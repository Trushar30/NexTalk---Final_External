import { Worker } from 'bullmq';
import { env } from '../config/env';
import { Message } from '../models';
import axios from 'axios';

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

let toxicCheckWorker: Worker | null = null;

try {
  toxicCheckWorker = new Worker(
    'toxic-checks',
    async (job) => {
      const { messageId, content } = job.data;

      try {
        const response = await axios.post(
          `${env.AI_SERVICE_URL}/toxic/check`,
          { content },
          {
            headers: { 'X-Service-Secret': env.AI_SERVICE_SECRET || '' },
            timeout: 15000,
          }
        );

        const { isToxic, score, categories } = response.data;

        if (isToxic) {
          await Message.updateOne(
            { _id: messageId },
            { isToxic: true, toxicScore: score, toxicCategories: categories }
          );
          console.log(`⚠️ Toxic message flagged: ${messageId} (score: ${score})`);
        }

        return { isToxic, score };
      } catch (error: any) {
        // Don't retry if AI service is genuinely down — just log and move on
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          console.warn(`⚠️ AI service unavailable for toxic check on message ${messageId}`);
          return { error: 'AI service unavailable' };
        }
        console.error(`Toxic check failed for message ${messageId}:`, error.message);
        throw error; // BullMQ will retry
      }
    },
    {
      connection,
      concurrency: 5,
      limiter: { max: 10, duration: 1000 }, // Max 10 jobs/second
    }
  );

  toxicCheckWorker.on('failed', (job, err) => {
    console.error(`Toxic check job ${job?.id} failed:`, err.message);
  });

  console.log('✅ Toxic check worker started');
} catch (err: any) {
  console.warn('⚠️ Toxic check worker could not start (Redis unavailable?):', err.message);
}

export { toxicCheckWorker };
