import { Conversation, IConversation } from '../models';
import { connectionService } from './connection.service';
import { AppError } from '../middleware/errorHandler.middleware';

export class ConversationService {
  /**
   * Create a new DM conversation or get existing one.
   */
  async createDM(userId: string, otherUserId: string): Promise<IConversation> {
    if (userId === otherUserId) throw new AppError('Cannot create conversation with yourself', 400);

    // Check they are connected
    const connected = await connectionService.areConnected(userId, otherUserId);
    if (!connected) throw new AppError('You must be connected to start a conversation', 403);

    // Check if DM already exists between these two users
    const existing = await Conversation.findOne({
      isGroup: false,
      'members.userId': { $all: [userId, otherUserId] },
      $expr: { $eq: [{ $size: '$members' }, 2] },
    });

    if (existing) return existing;

    return Conversation.create({
      isGroup: false,
      members: [
        { userId, joinedAt: new Date() },
        { userId: otherUserId, joinedAt: new Date() },
      ],
    });
  }

  /**
   * Create a group conversation.
   */
  async createGroup(creatorId: string, name: string, memberIds: string[]): Promise<IConversation> {
    const uniqueMembers = [...new Set([creatorId, ...memberIds])];

    return Conversation.create({
      isGroup: true,
      name,
      members: uniqueMembers.map((uid) => ({ userId: uid, joinedAt: new Date() })),
    });
  }

  /**
   * List all conversations for a user (with latest message preview).
   */
  async listForUser(userId: string): Promise<IConversation[]> {
    return Conversation.find({ 'members.userId': userId })
      .populate('members.userId', 'username displayName avatarUrl currentMood isOnline')
      .sort({ updatedAt: -1 });
  }

  /**
   * Get conversation by ID (with authentication check).
   */
  async getById(conversationId: string, userId: string): Promise<IConversation> {
    const conversation = await Conversation.findById(conversationId)
      .populate('members.userId', 'username displayName avatarUrl currentMood isOnline');

    if (!conversation) throw new AppError('Conversation not found', 404);

    const isMember = conversation.members.some((m) => m.userId.toString() === userId || (m.userId as any)?._id?.toString() === userId);
    if (!isMember) throw new AppError('Not a member of this conversation', 403);

    return conversation;
  }

  /**
   * Update last read timestamp for a user in a conversation.
   */
  async markRead(conversationId: string, userId: string): Promise<void> {
    await Conversation.updateOne(
      { _id: conversationId, 'members.userId': userId },
      { $set: { 'members.$.lastReadAt': new Date() } }
    );
  }

  /**
   * Check if a user is a member of a conversation.
   */
  async isMember(conversationId: string, userId: string): Promise<boolean> {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'members.userId': userId,
    });
    return !!conversation;
  }

  /**
   * Get member user IDs of a conversation.
   */
  async getMemberIds(conversationId: string): Promise<string[]> {
    const conversation = await Conversation.findById(conversationId).select('members.userId');
    if (!conversation) return [];
    return conversation.members.map((m) => m.userId.toString());
  }
}

export const conversationService = new ConversationService();
