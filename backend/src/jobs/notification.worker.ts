import { Worker } from 'bullmq';
import { env } from '../config/env';
import { notificationService } from '../services/notification.service';

const notificationWorker = new Worker(
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
  { connection: { host: new URL(env.REDIS_URL).hostname, port: parseInt(new URL(env.REDIS_URL).port || '6379') }, concurrency: 10 }
);

notificationWorker.on('failed', (job, err) => {
  console.error(`Notification job ${job?.id} failed:`, err.message);
});

export { notificationWorker };
