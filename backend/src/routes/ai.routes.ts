import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import axios from 'axios';
import CryptoJS from 'crypto-js';
import { env } from '../config/env';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { AuthRequest } from '../types';
import { Message, Conversation, User } from '../models';

const router = Router();

const headers = { 'X-Service-Secret': env.AI_SERVICE_SECRET || '' };
const E2E_SECRET = process.env.E2E_SECRET || 'nex-talk-secure-key-2026';

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

const cloneReplySchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().min(1).max(2000),
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

// POST /ai/clone-reply — AI Cloner: predict how a user would reply
router.post('/clone-reply', authenticate, validate(cloneReplySchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { conversationId, message } = req.body;
    const userId = req.userId!;

    // 1. Find the conversation and verify membership
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      sendError(res, 'Conversation not found', 404);
      return;
    }

    const isMember = conversation.members.some(
      (m) => m.userId.toString() === userId
    );
    if (!isMember) {
      sendError(res, 'Not a member of this conversation', 403);
      return;
    }

    // 2. Find the OTHER user in the conversation (the target to clone)
    const targetMember = conversation.members.find(
      (m) => m.userId.toString() !== userId
    );
    if (!targetMember) {
      sendError(res, 'No target user found in conversation', 400);
      return;
    }
    const targetUserId = targetMember.userId.toString();

    // 3. Get the target user's profile (for mood & name)
    const targetUser = await User.findById(targetUserId).select('displayName currentMood');
    const targetMood = targetUser?.currentMood?.toLowerCase() || 'neutral';
    const targetName = targetUser?.displayName || 'User';

    // 4. Fetch the target user's last 50 messages in this conversation
    const targetMessages = await Message.find({
      conversationId,
      senderId: targetUserId,
      isDeleted: false,
      content: { $ne: null, $exists: true },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('content')
      .lean();

    // 5. Decrypt messages
    const targetHistory = targetMessages
      .map((m) => {
        let content = m.content || '';
        if (content.startsWith('U2FsdGVkX1')) {
          try {
            const bytes = CryptoJS.AES.decrypt(content, E2E_SECRET);
            content = bytes.toString(CryptoJS.enc.Utf8) || content;
          } catch {
            // If decryption fails, use raw content
          }
        }
        return content;
      })
      .filter((c) => c.length > 0)
      .reverse(); // Chronological order

    // 6. Forward to Python AI service
    const response = await axios.post(
      `${env.AI_SERVICE_URL}/clone/predict`,
      {
        message,
        target_history: targetHistory,
        target_mood: targetMood,
        target_name: targetName,
      },
      {
        headers,
        timeout: 30000,
      }
    );

    sendSuccess(res, response.data);
  } catch (err: any) {
    console.error('AI Clone prediction failed:', err.message);
    sendError(res, err.response?.data?.detail || 'AI Cloner service unavailable', 502);
  }
});

export default router;
