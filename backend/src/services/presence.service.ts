import { redis } from '../config/redis';
import { User } from '../models';

export class PresenceService {
  private readonly ONLINE_TTL = 35;  // seconds — heartbeat every 30s
  private readonly TYPING_TTL = 5;   // seconds

  // ─── Online Status ─────────────────────────────────────
  async setOnline(userId: string): Promise<void> {
    // Always update MongoDB (source of truth for online status)
    try {
      await User.updateOne({ _id: userId }, { isOnline: true });
    } catch (err: any) {
      console.error('setOnline DB error:', err.message);
    }
    // Redis is optional (used for TTL-based auto-offline)
    try {
      await redis.set(`user:online:${userId}`, '1', 'EX', this.ONLINE_TTL);
    } catch {
      // Redis unavailable — MongoDB still tracks presence
    }
  }

  async setOffline(userId: string): Promise<Date> {
    const lastSeenAt = new Date();
    try {
      await User.updateOne({ _id: userId }, { isOnline: false, lastSeenAt });
    } catch (err: any) {
      console.error('setOffline DB error:', err.message);
    }
    try {
      await redis.del(`user:online:${userId}`);
      await redis.del(`user:mood:${userId}`);
    } catch {
      // Redis unavailable — okay
    }
    return lastSeenAt;
  }

  async isOnline(userId: string): Promise<boolean> {
    try {
      const result = await redis.exists(`user:online:${userId}`);
      return result === 1;
    } catch {
      // Fallback: check MongoDB
      const user = await User.findById(userId, 'isOnline').lean();
      return user?.isOnline || false;
    }
  }

  async refreshHeartbeat(userId: string): Promise<void> {
    try {
      await redis.expire(`user:online:${userId}`, this.ONLINE_TTL);
    } catch {
      // Redis unavailable — no-op
    }
  }

  // ─── Typing ────────────────────────────────────────────
  async setTyping(userId: string, conversationId: string): Promise<boolean> {
    try {
      const key = `user:typing:${conversationId}:${userId}`;
      const isNew = !(await redis.exists(key));
      await redis.set(key, '1', 'EX', this.TYPING_TTL);
      return isNew;
    } catch {
      // Redis unavailable — always emit (minor duplicate is fine)
      return true;
    }
  }

  async clearTyping(userId: string, conversationId: string): Promise<void> {
    try {
      await redis.del(`user:typing:${conversationId}:${userId}`);
    } catch {
      // Redis unavailable — no-op
    }
  }

  // ─── Mood ──────────────────────────────────────────────
  async updateMood(userId: string, mood: string): Promise<void> {
    try {
      await User.updateOne({ _id: userId }, { currentMood: mood, moodUpdatedAt: new Date() });
    } catch (err: any) {
      console.error('updateMood DB error:', err.message);
    }
    try {
      await redis.set(`user:mood:${userId}`, mood);
    } catch {
      // Redis unavailable — MongoDB still has the mood
    }
  }

  async getMood(userId: string): Promise<string | null> {
    try {
      return await redis.get(`user:mood:${userId}`);
    } catch {
      // Fallback: check MongoDB
      const user = await User.findById(userId, 'currentMood').lean();
      return user?.currentMood || null;
    }
  }
}

export const presenceService = new PresenceService();
