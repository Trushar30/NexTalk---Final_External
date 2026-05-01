import { Queue } from 'bullmq';
import { env } from '../config/env';

/**
 * Parse Redis URL for BullMQ connection (supports Upstash rediss:// with auth).
 */
function parseRedisConnection(): { host: string; port: number; password?: string; tls?: Record<string, unknown> } {
  try {
    const url = new URL(env.REDIS_URL);
    const isTLS = env.REDIS_URL.startsWith('rediss://');

    const config: { host: string; port: number; password?: string; tls?: Record<string, unknown> } = {
      host: url.hostname,
      port: parseInt(url.port || '6379'),
    };

    if (url.password) {
      config.password = url.password;
    }

    if (isTLS) {
      config.tls = { rejectUnauthorized: false };
    }

    return config;
  } catch (err) {
    console.warn('⚠️ Failed to parse Redis URL for BullMQ, using defaults');
    return { host: 'localhost', port: 6379 };
  }
}

const connection = parseRedisConnection();

/**
 * Create a queue with error handling — if Redis is unavailable,
 * add() calls will fail gracefully and log warnings.
 */
function createSafeQueue(name: string): Queue {
  const queue = new Queue(name, { connection });

  queue.on('error', (err) => {
    console.warn(`⚠️ Queue "${name}" error:`, err.message);
  });

  return queue;
}

// ─── Queue Definitions ──────────────────────────────────
export const notificationQueue = createSafeQueue('notifications');
export const toxicCheckQueue = createSafeQueue('toxic-checks');
export const messageExpiryQueue = createSafeQueue('message-expiry');

/**
 * Safely add a job to a queue. Returns false if the queue is unavailable.
 */
export async function safeQueueAdd(queue: Queue, name: string, data: Record<string, unknown>, opts?: Record<string, unknown>): Promise<boolean> {
  try {
    await queue.add(name, data, opts);
    return true;
  } catch (err: any) {
    console.warn(`⚠️ Failed to queue job "${name}":`, err.message);
    return false;
  }
}
