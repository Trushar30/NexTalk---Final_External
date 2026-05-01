import { Message, IMessage, Conversation } from '../models';
import { conversationService } from './conversation.service';
import { AppError } from '../middleware/errorHandler.middleware';
import { SendMessagePayload } from '../types';
import { toxicCheckQueue, notificationQueue, messageExpiryQueue, safeQueueAdd } from '../jobs/queues';
import CryptoJS from 'crypto-js';
import { env } from '../config/env';

const E2E_SECRET = process.env.E2E_SECRET || 'nex-talk-secure-key-2026';

export class MessageService {
  /**
   * Send a new message.
   */
  async send(senderId: string, payload: SendMessagePayload): Promise<IMessage> {
    const { conversationId, content, encryptedContent, contentKey, type, isOneTime, mediaUrl } = payload;

    // Verify sender is member
    const isMember = await conversationService.isMember(conversationId, senderId);
    if (!isMember) throw new AppError('Not a member of this conversation', 403);

    const message = await Message.create({
      conversationId,
      senderId,
      content,
      encryptedContent,
      contentKey,
      type: type || 'TEXT',
      isOneTime: isOneTime || false,
      mediaUrl,
    });

    // Bump conversation updatedAt
    await Conversation.updateOne({ _id: conversationId }, { updatedAt: new Date() });

    // Async toxic check (non-blocking) — uses safeQueueAdd for graceful degradation
    if (content) {
      let plainContent = content;
      if (content.startsWith('U2FsdGVkX1')) {
        try {
          const bytes = CryptoJS.AES.decrypt(content, E2E_SECRET);
          plainContent = bytes.toString(CryptoJS.enc.Utf8) || content;
        } catch (err) {
          console.error('Backend decryption for toxic check failed:', err);
        }
      }
      await safeQueueAdd(toxicCheckQueue, 'toxic-check', { messageId: message.id, content: plainContent });
    }

    // Schedule expiry for one-time messages (24h fallback)
    if (isOneTime) {
      await safeQueueAdd(messageExpiryQueue, 'expire-onetimemsg', { messageId: message.id }, { delay: 24 * 60 * 60 * 1000 });
    }

    // Trigger notification for other members
    const memberIds = await conversationService.getMemberIds(conversationId);
    const otherMembers = memberIds.filter((id) => id !== senderId);
    const isEncrypted = content?.startsWith('U2FsdGVkX1');
    for (const recipientId of otherMembers) {
      let previewText = 'Sent a message';
      if (content) {
        previewText = isEncrypted ? 'Sent a secure message' : (content.length > 100 ? content.substring(0, 100) + '...' : content);
      }
      
      await safeQueueAdd(notificationQueue, 'send-notification', {
        userId: recipientId,
        type: 'MESSAGE',
        title: 'New message',
        body: previewText,
        data: { conversationId, messageId: message.id },
      });
    }

    return message;
  }

  /**
   * Edit a message.
   */
  async edit(messageId: string, userId: string, newContent: string): Promise<IMessage> {
    const message = await Message.findById(messageId);
    if (!message) throw new AppError('Message not found', 404);
    if (message.senderId.toString() !== userId) throw new AppError('Can only edit your own messages', 403);
    if (message.isDeleted) throw new AppError('Cannot edit a deleted message', 400);
    if (message.isOneTime) throw new AppError('Cannot edit a one-time message', 400);

    message.content = newContent;
    message.editedAt = new Date();
    await message.save();

    // Re-check toxicity
    if (newContent) {
      let plainContent = newContent;
      if (newContent.startsWith('U2FsdGVkX1')) {
        try {
          const bytes = CryptoJS.AES.decrypt(newContent, E2E_SECRET);
          plainContent = bytes.toString(CryptoJS.enc.Utf8) || newContent;
        } catch (err) {
          console.error('Backend decryption for toxic check failed:', err);
        }
      }
      await safeQueueAdd(toxicCheckQueue, 'toxic-check', { messageId: message.id, content: plainContent });
    }

    return message;
  }

  /**
   * Soft-delete a message.
   */
  async delete(messageId: string, userId: string): Promise<void> {
    const message = await Message.findById(messageId);
    if (!message) throw new AppError('Message not found', 404);
    if (message.senderId.toString() !== userId) throw new AppError('Can only delete your own messages', 403);

    message.isDeleted = true;
    message.deletedAt = new Date();
    message.content = null as any;
    message.encryptedContent = null as any;
    await message.save();
  }

  /**
   * Toggle a reaction on a message.
   */
  async toggleReaction(messageId: string, userId: string, emoji: string): Promise<{ action: 'add' | 'remove' }> {
    const message = await Message.findById(messageId);
    if (!message) throw new AppError('Message not found', 404);

    const existingIndex = message.reactions.findIndex(
      (r) => r.userId.toString() === userId && r.emoji === emoji
    );

    if (existingIndex >= 0) {
      message.reactions.splice(existingIndex, 1);
      await message.save();
      return { action: 'remove' };
    } else {
      message.reactions.push({ userId: userId as any, emoji, createdAt: new Date() });
      await message.save();
      return { action: 'add' };
    }
  }

  /**
   * Mark a message as read.
   */
  async markRead(messageId: string, userId: string): Promise<void> {
    await Message.updateOne(
      { _id: messageId, 'readBy.userId': { $ne: userId } },
      { $push: { readBy: { userId, readAt: new Date() } } }
    );
  }

  /**
   * Handle one-time message viewed.
   */
  async markOneTimeViewed(messageId: string, viewerId: string): Promise<void> {
    const message = await Message.findById(messageId);
    if (!message) throw new AppError('Message not found', 404);
    if (!message.isOneTime) throw new AppError('Not a one-time message', 400);
    if (message.oneTimeViewedAt) throw new AppError('Already viewed', 400);
    if (message.senderId.toString() === viewerId) throw new AppError('Sender cannot trigger view expiry', 400);

    message.oneTimeViewedAt = new Date();
    message.oneTimeViewedBy = viewerId as any;
    message.content = null as any;
    message.encryptedContent = null as any;
    message.contentKey = null as any;
    await message.save();
  }

  /**
   * Get paginated messages for a conversation (cursor-based).
   */
  async getPaginated(
    conversationId: string,
    userId: string,
    cursor?: string,
    limit = 30
  ): Promise<{ messages: IMessage[]; nextCursor: string | null }> {
    const isMember = await conversationService.isMember(conversationId, userId);
    if (!isMember) throw new AppError('Not a member of this conversation', 403);

    const query: Record<string, unknown> = { conversationId };

    if (cursor) {
      query.createdAt = { $lt: new Date(cursor) };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('senderId', 'username displayName avatarUrl');

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    const nextCursor = hasMore && messages.length > 0
      ? messages[messages.length - 1].createdAt.toISOString()
      : null;

    // Filter expired one-time messages
    const filtered = messages.map((msg) => {
      if (msg.isOneTime && msg.oneTimeViewedAt) {
        const ghost = msg.toObject();
        ghost.content = undefined;
        ghost.encryptedContent = undefined;
        return ghost as IMessage;
      }
      if (msg.isDeleted) {
        const tombstone = msg.toObject();
        tombstone.content = undefined;
        tombstone.encryptedContent = undefined;
        return tombstone as IMessage;
      }
      return msg;
    });

    return { messages: filtered, nextCursor };
  }
}

export const messageService = new MessageService();
