import { Worker } from 'bullmq';
import { env } from '../config/env';
import { Message } from '../models';

const connection = { host: new URL(env.REDIS_URL).hostname, port: parseInt(new URL(env.REDIS_URL).port || '6379') };

const messageExpiryWorker = new Worker(
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

export { messageExpiryWorker };
