import { Worker } from 'bullmq';
import { env } from '../config/env';
import { Message } from '../models';

/**
 * Parse Redis URL for BullMQ worker connection.
 */
function parseRedisConnection() {
  try {
    const url = new URL(env.REDIS_URL);
    const isTLS = env.REDIS_URL.startsWith('rediss://');
    const config: Record<string, unknown> = {
      host: url.hostname,
      port: parseInt(url.port || '6379'),
    };
    if (url.password) config.password = url.password;
    if (isTLS) config.tls = { rejectUnauthorized: false };
    return config;
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

const connection = parseRedisConnection();

let messageExpiryWorker: Worker | null = null;

try {
  messageExpiryWorker = new Worker(
    'message-expiry',
    async (job) => {
      const { messageId } = job.data;

      const message = await Message.findById(messageId);
      if (!message) return;
      if (!message.isOneTime) return;
      if (message.oneTimeViewedAt) return; // Already viewed — content already cleared

      // Auto-expire: clear content after 24h even if never viewed
      message.content = null as any;
      message.encryptedContent = null as any;
      message.contentKey = null as any;
      message.oneTimeViewedAt = new Date();
      await message.save();

      console.log(`⏰ One-time message expired: ${messageId}`);
    },
    { connection }
  );

  messageExpiryWorker.on('failed', (job, err) => {
    console.error(`Message expiry job ${job?.id} failed:`, err.message);
  });

  console.log('✅ Message expiry worker started');
} catch (err: any) {
  console.warn('⚠️ Message expiry worker could not start (Redis unavailable?):', err.message);
}

export { messageExpiryWorker };
