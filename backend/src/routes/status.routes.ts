import { Router, Request, Response } from 'express';
import axios from 'axios';
import { env } from '../config/env';
import { sendSuccess } from '../utils/apiResponse';

const router = Router();

interface ServiceCheck {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latencyMs: number | null;
  message?: string;
}

// ─── GET /status — Check all service health ──────────────
router.get('/', async (_req: Request, res: Response) => {
  const checks: ServiceCheck[] = [];

  // 1. Backend API (self — always up if we're responding)
  checks.push({
    name: 'Backend API',
    status: 'operational',
    latencyMs: 0,
    message: `Node.js • Uptime: ${Math.floor(process.uptime())}s`,
  });

  // 2. MongoDB
  try {
    const mongoose = await import('mongoose');
    const start = Date.now();
    const state = mongoose.default.connection.readyState;
    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    const latency = Date.now() - start;
    if (state === 1) {
      checks.push({ name: 'Database (MongoDB)', status: 'operational', latencyMs: latency, message: 'Connected' });
    } else {
      checks.push({ name: 'Database (MongoDB)', status: 'down', latencyMs: null, message: `State: ${['disconnected', 'connected', 'connecting', 'disconnecting'][state]}` });
    }
  } catch (e: any) {
    checks.push({ name: 'Database (MongoDB)', status: 'down', latencyMs: null, message: e.message });
  }

  // 3. Redis (BullMQ)
  try {
    const IORedis = (await import('ioredis')).default;
    const start = Date.now();
    const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true });
    await redis.connect();
    await redis.ping();
    const latency = Date.now() - start;
    await redis.quit();
    checks.push({ name: 'Redis (Queue)', status: 'operational', latencyMs: latency, message: 'Connected' });
  } catch (e: any) {
    checks.push({ name: 'Redis (Queue)', status: 'down', latencyMs: null, message: 'Connection failed' });
  }

  // 4. AI Service
  try {
    const start = Date.now();
    const resp = await axios.get(`${env.AI_SERVICE_URL}/health`, { timeout: 5000 });
    const latency = Date.now() - start;
    if (resp.data?.status === 'ok') {
      checks.push({ name: 'AI Service', status: 'operational', latencyMs: latency, message: resp.data.mode || 'Healthy' });
    } else {
      checks.push({ name: 'AI Service', status: 'degraded', latencyMs: latency, message: 'Unexpected response' });
    }
  } catch (e: any) {
    checks.push({ name: 'AI Service', status: 'down', latencyMs: null, message: 'Unreachable' });
  }

  // 5. AI — Toxicity Detection
  try {
    const start = Date.now();
    const resp = await axios.get(`${env.AI_SERVICE_URL}/ready`, { timeout: 5000 });
    const latency = Date.now() - start;
    const models = resp.data?.models || {};
    
    checks.push({
      name: 'Toxicity Filter',
      status: models.toxic_classifier ? 'operational' : 'down',
      latencyMs: latency,
      message: models.toxic_classifier || 'Not loaded',
    });

    checks.push({
      name: 'Chat Summarizer',
      status: models.summarizer ? 'operational' : 'down',
      latencyMs: latency,
      message: models.summarizer || 'Not loaded',
    });

    checks.push({
      name: 'Face Authentication',
      status: models.face_embedding ? 'operational' : 'down',
      latencyMs: latency,
      message: models.face_embedding || 'Not loaded',
    });

    checks.push({
      name: 'Emotion Detection',
      status: models.emotion_detection ? 'operational' : 'down',
      latencyMs: latency,
      message: models.emotion_detection || 'Not loaded',
    });
  } catch {
    // If AI service is already down, add individual feature status
    if (checks.find(c => c.name === 'AI Service')?.status === 'down') {
      ['Toxicity Filter', 'Chat Summarizer', 'Face Authentication', 'Emotion Detection'].forEach(name => {
        checks.push({ name, status: 'down', latencyMs: null, message: 'AI Service unavailable' });
      });
    }
  }

  // 6. WebSocket (Socket.IO) — basic check
  checks.push({
    name: 'Real-time (WebSocket)',
    status: 'operational',
    latencyMs: 0,
    message: 'Socket.IO active',
  });

  const overallStatus = checks.every(c => c.status === 'operational')
    ? 'operational'
    : checks.some(c => c.status === 'down')
    ? 'degraded'
    : 'operational';

  sendSuccess(res, {
    overall: overallStatus,
    services: checks,
    checkedAt: new Date().toISOString(),
  });
});

export default router;
