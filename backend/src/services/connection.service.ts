import { Connection, IConnection, User } from '../models';
import { AppError } from '../middleware/errorHandler.middleware';

export class ConnectionService {
  /**
   * Send a connection request.
   */
  async sendRequest(requesterId: string, recipientId: string): Promise<IConnection> {
    if (requesterId === recipientId) {
      throw new AppError('Cannot send connection request to yourself', 400);
    }

    // Check recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) throw new AppError('User not found', 404);

    // Check if connection already exists (in either direction)
    const existing = await Connection.findOne({
      $or: [
        { requesterId, recipientId },
        { requesterId: recipientId, recipientId: requesterId },
      ],
    });

    if (existing) {
      if (existing.status === 'BLOCKED') throw new AppError('Cannot send request', 403);
      if (existing.status === 'ACCEPTED') throw new AppError('Already connected', 409);
      if (existing.status === 'PENDING') throw new AppError('Connection request already pending', 409);
      if (existing.status === 'DECLINED') {
        // Allow re-request after decline
        existing.requesterId = requesterId as any;
        existing.recipientId = recipientId as any;
        existing.status = 'PENDING';
        await existing.save();
        return existing;
      }
    }

    return Connection.create({ requesterId, recipientId });
  }

  /**
   * Accept a connection request.
   */
  async acceptRequest(requestId: string, userId: string): Promise<IConnection> {
    const connection = await Connection.findById(requestId);
    if (!connection) throw new AppError('Connection request not found', 404);
    if (connection.recipientId.toString() !== userId) {
      throw new AppError('Not authorized to accept this request', 403);
    }
    if (connection.status !== 'PENDING') {
      throw new AppError('Request is no longer pending', 400);
    }

    connection.status = 'ACCEPTED';
    await connection.save();
    return connection;
  }

  /**
   * Decline a connection request.
   */
  async declineRequest(requestId: string, userId: string): Promise<void> {
    const connection = await Connection.findById(requestId);
    if (!connection) throw new AppError('Connection request not found', 404);
    if (connection.recipientId.toString() !== userId) {
      throw new AppError('Not authorized to decline this request', 403);
    }

    connection.status = 'DECLINED';
    await connection.save();
  }

  /**
   * Remove a connection.
   */
  async removeConnection(userId: string, otherUserId: string): Promise<void> {
    const result = await Connection.deleteOne({
      $or: [
        { requesterId: userId, recipientId: otherUserId, status: 'ACCEPTED' },
        { requesterId: otherUserId, recipientId: userId, status: 'ACCEPTED' },
      ],
    });
    if (result.deletedCount === 0) throw new AppError('Connection not found', 404);
  }

  /**
   * Get all accepted connections for a user.
   */
  async getConnections(userId: string): Promise<IConnection[]> {
    return Connection.find({
      $or: [{ requesterId: userId }, { recipientId: userId }],
      status: 'ACCEPTED',
    }).populate('requesterId recipientId', 'username displayName avatarUrl currentMood isOnline');
  }

  /**
   * Get pending incoming requests.
   */
  async getIncomingRequests(userId: string): Promise<IConnection[]> {
    return Connection.find({ recipientId: userId, status: 'PENDING' })
      .populate('requesterId', 'username displayName avatarUrl')
      .sort({ createdAt: -1 });
  }

  /**
   * Get pending outgoing requests.
   */
  async getSentRequests(userId: string): Promise<IConnection[]> {
    return Connection.find({ requesterId: userId, status: 'PENDING' })
      .populate('recipientId', 'username displayName avatarUrl')
      .sort({ createdAt: -1 });
  }

  /**
   * Check if two users are connected.
   */
  async areConnected(userId1: string, userId2: string): Promise<boolean> {
    const connection = await Connection.findOne({
      $or: [
        { requesterId: userId1, recipientId: userId2 },
        { requesterId: userId2, recipientId: userId1 },
      ],
      status: 'ACCEPTED',
    });
    return !!connection;
  }
}

export const connectionService = new ConnectionService();
