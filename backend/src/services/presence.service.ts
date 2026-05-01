import { redis } from '../config/redis';
import { User } from '../models';

export class PresenceService {
  private readonly ONLINE_TTL = 35;  // seconds — heartbeat every 30s
  private readonly TYPING_TTL = 5;   // seconds

  // ─── Online Status ─────────────────────────────────────
  async setOnline(userId: string): Promise<void> {
    await redis.set(`user:online:${userId}`, '1', 'EX', this.ONLINE_TTL);
    await User.updateOne({ _id: userId }, { isOnline: true });
  }

  async setOffline(userId: string): Promise<Date> {
    await redis.del(`user:online:${userId}`);
    await redis.del(`user:mood:${userId}`);
    const lastSeenAt = new Date();
    await User.updateOne({ _id: userId }, { isOnline: false, lastSeenAt });
    return lastSeenAt;
  }

  async isOnline(userId: string): Promise<boolean> {
    const result = await redis.exists(`user:online:${userId}`);
    return result === 1;
  }

  async refreshHeartbeat(userId: string): Promise<void> {
    await redis.expire(`user:online:${userId}`, this.ONLINE_TTL);
  }

  // ─── Typing ────────────────────────────────────────────
  async setTyping(userId: string, conversationId: string): Promise<boolean> {
    const key = `user:typing:${conversationId}:${userId}`;
    const isNew = !(await redis.exists(key));
    await redis.set(key, '1', 'EX', this.TYPING_TTL);
    return isNew; // Returns true if this is a new typing event (emit to room)
  }

  async clearTyping(userId: string, conversationId: string): Promise<void> {
    await redis.del(`user:typing:${conversationId}:${userId}`);
  }

  // ─── Mood ──────────────────────────────────────────────
  async updateMood(userId: string, mood: string): Promise<void> {
    await redis.set(`user:mood:${userId}`, mood);
    await User.updateOne({ _id: userId }, { currentMood: mood, moodUpdatedAt: new Date() });
  }

  async getMood(userId: string): Promise<string | null> {
    return redis.get(`user:mood:${userId}`);
  }
}

export const presenceService = new PresenceService();
