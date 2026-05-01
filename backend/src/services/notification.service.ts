import { Notification, INotification } from '../models';
import { AppError } from '../middleware/errorHandler.middleware';

export class NotificationService {
  /**
   * Create a notification.
   */
  async create(data: {
    userId: string;
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }): Promise<INotification> {
    return Notification.create(data);
  }

  /**
   * List notifications for a user (paginated).
   */
  async listForUser(userId: string, page = 1, limit = 20): Promise<{ notifications: INotification[]; total: number }> {
    const skip = (page - 1) * limit;
    const [notifications, total] = await Promise.all([
      Notification.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments({ userId }),
    ]);
    return { notifications, total };
  }

  /**
   * Mark a single notification as read.
   */
  async markRead(notificationId: string, userId: string): Promise<void> {
    const result = await Notification.updateOne(
      { _id: notificationId, userId },
      { isRead: true }
    );
    if (result.matchedCount === 0) throw new AppError('Notification not found', 404);
  }

  /**
   * Mark all notifications as read.
   */
  async markAllRead(userId: string): Promise<void> {
    await Notification.updateMany({ userId, isRead: false }, { isRead: true });
  }

  /**
   * Delete a notification.
   */
  async delete(notificationId: string, userId: string): Promise<void> {
    const result = await Notification.deleteOne({ _id: notificationId, userId });
    if (result.deletedCount === 0) throw new AppError('Notification not found', 404);
  }

  /**
   * Get unread count.
   */
  async getUnreadCount(userId: string): Promise<number> {
    return Notification.countDocuments({ userId, isRead: false });
  }
}

export const notificationService = new NotificationService();
