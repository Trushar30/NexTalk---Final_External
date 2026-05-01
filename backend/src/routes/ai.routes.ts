import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { env } from '../config/env';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { AuthRequest } from '../types';

const router = Router();

const headers = { 'X-Service-Secret': env.AI_SERVICE_SECRET || '' };

// ─── Validation ──────────────────────────────────────────
const toxicCheckSchema = z.object({
  content: z.string().min(1).max(5000),
});

const summarizeSchema = z.object({
  messages: z.array(z.object({
    sender: z.string(),
    content: z.string(),
  })).min(1).max(200),
});

// ─── Routes ──────────────────────────────────────────────

// POST /ai/toxic-check
router.post('/toxic-check', authenticate, validate(toxicCheckSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const response = await axios.post(`${env.AI_SERVICE_URL}/toxic/check`, req.body, {
      headers,
      timeout: 10000,
    });
    sendSuccess(res, response.data);
  } catch (err: any) {
    sendError(res, err.response?.data?.detail || 'AI service unavailable', 502);
  }
});

// POST /ai/summarize
router.post('/summarize', authenticate, validate(summarizeSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const response = await axios.post(`${env.AI_SERVICE_URL}/summarize`, req.body, {
      headers,
      timeout: 30000,
    });
    sendSuccess(res, response.data);
  } catch (err: any) {
    sendError(res, err.response?.data?.detail || 'AI service unavailable', 502);
  }
});

// POST /ai/emotion
router.post('/emotion', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const response = await axios.post(`${env.AI_SERVICE_URL}/face/emotion`, req.body, {
      headers,
      timeout: 10000,
    });
    sendSuccess(res, response.data);
  } catch (err: any) {
    sendError(res, err.response?.data?.detail || 'AI service unavailable', 502);
  }
});

export default router;
