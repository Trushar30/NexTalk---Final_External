import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { conversationService } from '../services/conversation.service';
import { messageService } from '../services/message.service';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { messageLimiter } from '../middleware/rateLimiter.middleware';
import { sendSuccess, sendCreated } from '../utils/apiResponse';
import { AuthRequest } from '../types';

const router = Router();

// ─── Validation ──────────────────────────────────────────
const createConversationSchema = z.object({
  userId: z.string().optional(),      // For DM
  name: z.string().optional(),        // For group
  memberIds: z.array(z.string()).optional(), // For group
});

const sendMessageSchema = z.object({
  content: z.string().optional(),
  encryptedContent: z.string().optional(),
  contentKey: z.string().optional(),
  type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE']).optional(),
  isOneTime: z.boolean().optional(),
  mediaUrl: z.string().url().optional(),
});

const editMessageSchema = z.object({
  content: z.string().min(1),
});

const reactSchema = z.object({
  emoji: z.string().min(1).max(10),
});

// ─── Routes ──────────────────────────────────────────────

// GET /conversations — List all
router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const conversations = await conversationService.listForUser(req.userId!);
    sendSuccess(res, conversations);
  } catch (err) { next(err); }
});

// POST /conversations — Create DM or group
router.post('/', authenticate, validate(createConversationSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId, name, memberIds } = req.body;
    let conversation;

    if (userId) {
      // DM
      conversation = await conversationService.createDM(req.userId!, userId);
    } else if (name && memberIds) {
      // Group
      conversation = await conversationService.createGroup(req.userId!, name, memberIds);
    } else {
      res.status(400).json({ success: false, error: 'Provide userId for DM or name+memberIds for group' });
      return;
    }

    sendCreated(res, conversation);
  } catch (err) { next(err); }
});

// GET /conversations/:id — Get conversation
router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const conversation = await conversationService.getById(req.params.id, req.userId!);
    sendSuccess(res, conversation);
  } catch (err) { next(err); }
});

// GET /conversations/:id/messages — Paginated messages
router.get('/:id/messages', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string) || 30;
    const result = await messageService.getPaginated(req.params.id, req.userId!, cursor, limit);
    sendSuccess(res, result.messages, undefined, 200, {
      hasMore: !!result.nextCursor,
      nextCursor: result.nextCursor || undefined,
    });
  } catch (err) { next(err); }
});

// POST /conversations/:id/messages — Send message
router.post('/:id/messages', authenticate, messageLimiter, validate(sendMessageSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const message = await messageService.send(req.userId!, {
      conversationId: req.params.id,
      ...req.body,
    });
    sendCreated(res, message);
  } catch (err) { next(err); }
});

// PATCH /conversations/:id/messages/:msgId — Edit message
router.patch('/:id/messages/:msgId', authenticate, validate(editMessageSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const message = await messageService.edit(req.params.msgId, req.userId!, req.body.content);
    sendSuccess(res, message, 'Message updated');
  } catch (err) { next(err); }
});

// DELETE /conversations/:id/messages/:msgId — Delete message
router.delete('/:id/messages/:msgId', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await messageService.delete(req.params.msgId, req.userId!);
    sendSuccess(res, null, 'Message deleted');
  } catch (err) { next(err); }
});

// POST /conversations/:id/messages/:msgId/react — Add/remove reaction
router.post('/:id/messages/:msgId/react', authenticate, validate(reactSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await messageService.toggleReaction(req.params.msgId, req.userId!, req.body.emoji);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// POST /conversations/:id/read — Mark conversation as read
router.post('/:id/read', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await conversationService.markRead(req.params.id, req.userId!);
    sendSuccess(res, null, 'Marked as read');
  } catch (err) { next(err); }
});

// POST /conversations/:id/messages/:msgId/view — Mark one-time message as viewed
router.post('/:id/messages/:msgId/view', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await messageService.markOneTimeViewed(req.params.msgId, req.userId!);
    sendSuccess(res, null, 'Message viewed');
  } catch (err) { next(err); }
});

export default router;
