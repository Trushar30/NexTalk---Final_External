import { Server, Socket } from 'socket.io';
import { messageService } from '../services/message.service';
import { conversationService } from '../services/conversation.service';
import { ServerToClientEvents, ClientToServerEvents, SocketData } from '../types';

type IOServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export function registerChatHandlers(io: IOServer, socket: IOSocket): void {
  const userId = socket.data.userId;

  // ─── Join / Leave Conversation Room ─────────────────────
  socket.on('join:conversation', async ({ conversationId }) => {
    try {
      const isMember = await conversationService.isMember(conversationId, userId);
      if (isMember) {
        socket.join(conversationId);
      }
    } catch (error) {
      console.error('join:conversation error:', error);
    }
  });

  socket.on('leave:conversation', ({ conversationId }) => {
    socket.leave(conversationId);
  });

  // ─── Send Message ───────────────────────────────────────
  socket.on('message:send', async (payload) => {
    try {
      const message = await messageService.send(userId, payload);
      const populated = await message.populate('senderId', 'username displayName avatarUrl');

      // Emit to conversation room
      io.to(payload.conversationId).emit('message:new', {
        message: populated.toObject(),
        conversationId: payload.conversationId,
      });
    } catch (error: any) {
      console.error('message:send error:', error.message);
    }
  });

  // ─── Edit Message ───────────────────────────────────────
  socket.on('message:edit', async ({ messageId, content }) => {
    try {
      const message = await messageService.edit(messageId, userId, content);
      io.to(message.conversationId.toString()).emit('message:edited', {
        messageId,
        content,
        editedAt: message.editedAt!,
      });
    } catch (error: any) {
      console.error('message:edit error:', error.message);
    }
  });

  // ─── Delete Message ─────────────────────────────────────
  socket.on('message:delete', async ({ messageId }) => {
    try {
      await messageService.delete(messageId, userId);
      // We need the conversationId — get from rooms
      for (const room of socket.rooms) {
        if (room !== socket.id && !room.startsWith('user:')) {
          io.to(room).emit('message:deleted', { messageId });
        }
      }
    } catch (error: any) {
      console.error('message:delete error:', error.message);
    }
  });

  // ─── Reactions ──────────────────────────────────────────
  socket.on('message:react', async ({ messageId, emoji }) => {
    try {
      const result = await messageService.toggleReaction(messageId, userId, emoji);
      for (const room of socket.rooms) {
        if (room !== socket.id && !room.startsWith('user:')) {
          io.to(room).emit('message:reaction', {
            messageId,
            userId,
            emoji,
            action: result.action,
          });
        }
      }
    } catch (error: any) {
      console.error('message:react error:', error.message);
    }
  });

  // ─── Read Receipts ─────────────────────────────────────
  socket.on('message:read', async ({ conversationId, messageId }) => {
    try {
      await messageService.markRead(messageId, userId);
      await conversationService.markRead(conversationId, userId);
      socket.to(conversationId).emit('message:read', {
        userId,
        conversationId,
        messageId,
        readAt: new Date(),
      });
    } catch (error: any) {
      console.error('message:read error:', error.message);
    }
  });

  // ─── One-Time Message Viewed ────────────────────────────
  socket.on('onetimemessage:viewed', async ({ messageId }) => {
    try {
      await messageService.markOneTimeViewed(messageId, userId);
      // Notify both sender and viewer
      for (const room of socket.rooms) {
        if (room !== socket.id && !room.startsWith('user:')) {
          io.to(room).emit('onetimemessage:expired', { messageId });
        }
      }
    } catch (error: any) {
      console.error('onetimemessage:viewed error:', error.message);
    }
  });
}
