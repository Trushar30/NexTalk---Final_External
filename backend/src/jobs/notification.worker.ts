import { Worker } from 'bullmq';
import { env } from '../config/env';
import { notificationService } from '../services/notification.service';

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

let notificationWorker: Worker | null = null;

try {
  notificationWorker = new Worker(
    'notifications',
    async (job) => {
      const { userId, type, title, body, data } = job.data;

      // 1. Save to database
      const notification = await notificationService.create({ userId, type, title, body, data });

      // 2. If user is online, the Socket.io layer handles real-time delivery
      //    This worker just ensures the notification is persisted.
      //    Real-time emission is handled by the socket layer checking after this job.

      console.log(`📨 Notification created for user ${userId}: ${title}`);
      return { notificationId: notification.id };
    },
    {
      connection,
      concurrency: 10,
      limiter: { max: 20, duration: 1000 }, // Max 20 notifications/second
    }
  );

  notificationWorker.on('failed', (job, err) => {
    console.error(`Notification job ${job?.id} failed:`, err.message);
  });

  console.log('✅ Notification worker started');
} catch (err: any) {
  console.warn('⚠️ Notification worker could not start (Redis unavailable?):', err.message);
}

export { notificationWorker };
