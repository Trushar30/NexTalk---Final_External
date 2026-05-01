import { Worker } from 'bullmq';
import { env } from '../config/env';
import { Message } from '../models';
import axios from 'axios';

const connection = { host: new URL(env.REDIS_URL).hostname, port: parseInt(new URL(env.REDIS_URL).port || '6379') };

const toxicCheckWorker = new Worker(
  'toxic-checks',
  async (job) => {
    const { messageId, content } = job.data;

    try {
      const response = await axios.post(
        `${env.AI_SERVICE_URL}/toxic/check`,
        { content },
        {
          headers: { 'X-Service-Secret': env.AI_SERVICE_SECRET || '' },
          timeout: 10000,
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
      console.error(`Toxic check failed for message ${messageId}:`, error.message);
      return { error: error.message };
    }
  },
  { connection, concurrency: 5 }
);

toxicCheckWorker.on('failed', (job, err) => {
  console.error(`Toxic check job ${job?.id} failed:`, err.message);
});

export { toxicCheckWorker };
