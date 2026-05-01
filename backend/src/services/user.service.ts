import { User, IUser } from '../models';
import { AppError } from '../middleware/errorHandler.middleware';

export class UserService {
  /**
   * Get user by ID (excludes password hash).
   */
  async getById(userId: string): Promise<IUser> {
    const user = await User.findById(userId).select('-passwordHash -faceEmbedding');
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  /**
   * Get public profile by username.
   */
  async getByUsername(username: string): Promise<IUser> {
    const user = await User.findOne({ username: username.toLowerCase() })
      .select('-passwordHash -faceEmbedding -email');
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  /**
   * Update current user's profile.
   */
  async updateProfile(
    userId: string,
    data: Partial<Pick<IUser, 'displayName' | 'avatarUrl' | 'bio' | 'privacyLevel' | 'publicKey'>>
  ): Promise<IUser> {
    const user = await User.findByIdAndUpdate(userId, { $set: data }, { new: true, runValidators: true })
      .select('-passwordHash -faceEmbedding');
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  /**
   * Search users by username or display name.
   */
  async search(query: string, limit = 20): Promise<IUser[]> {
    return User.find({
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { displayName: { $regex: query, $options: 'i' } },
      ],
    })
      .select('username displayName avatarUrl currentMood isOnline')
      .limit(limit);
  }

  /**
   * Update mood manually.
   */
  async updateMood(userId: string, mood: string): Promise<void> {
    await User.updateOne(
      { _id: userId },
      { currentMood: mood, moodUpdatedAt: new Date() }
    );
  }

  /**
   * Get user's public key for E2E encryption.
   */
  async getPublicKey(userId: string): Promise<string | null> {
    const user = await User.findById(userId).select('publicKey');
    return user?.publicKey || null;
  }
}

export const userService = new UserService();
