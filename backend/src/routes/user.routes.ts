import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { userService } from '../services/user.service';
import { connectionService } from '../services/connection.service';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { searchLimiter } from '../middleware/rateLimiter.middleware';
import { sendSuccess } from '../utils/apiResponse';
import { AuthRequest } from '../types';
import { MoodType } from '../models';

const router = Router();

// ─── Validation ──────────────────────────────────────────
const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().url().optional(),
  bio: z.string().max(500).optional(),
  privacyLevel: z.enum(['PUBLIC', 'FRIENDS', 'PRIVATE']).optional(),
  publicKey: z.string().optional(),
});

const moodSchema = z.object({
  mood: z.enum(MoodType as unknown as [string, ...string[]]),
});

// ─── Routes ──────────────────────────────────────────────

// GET /users/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await userService.getById(req.userId!);
    sendSuccess(res, user);
  } catch (err) { next(err); }
});

// PATCH /users/me
router.patch('/me', authenticate, validate(updateProfileSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await userService.updateProfile(req.userId!, req.body);
    sendSuccess(res, user, 'Profile updated');
  } catch (err) { next(err); }
});

// GET /users/search?q=
router.get('/search', authenticate, searchLimiter, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const q = (req.query.q as string) || '';
    const users = await userService.search(q);
    sendSuccess(res, users);
  } catch (err) { next(err); }
});

// PATCH /users/me/mood
router.patch('/me/mood', authenticate, validate(moodSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await userService.updateMood(req.userId!, req.body.mood);
    sendSuccess(res, null, 'Mood updated');
  } catch (err) { next(err); }
});

// GET /users/me/connections
router.get('/me/connections', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const connections = await connectionService.getConnections(req.userId!);
    sendSuccess(res, connections);
  } catch (err) { next(err); }
});

// GET /users/:username
router.get('/:username', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await userService.getByUsername(req.params.username);
    sendSuccess(res, user);
  } catch (err) { next(err); }
});

export default router;
