import { Queue } from 'bullmq';
import { env } from '../config/env';

// BullMQ uses its own bundled ioredis, so pass connection config (not an instance)
// to avoid type conflicts between ioredis versions.
const connection = { host: new URL(env.REDIS_URL).hostname, port: parseInt(new URL(env.REDIS_URL).port || '6379') };

// ─── Queue Definitions ──────────────────────────────────
export const notificationQueue = new Queue('notifications', { connection });
export const toxicCheckQueue = new Queue('toxic-checks', { connection });
export const messageExpiryQueue = new Queue('message-expiry', { connection });
