import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { authLimiter, faceLimiter } from '../middleware/rateLimiter.middleware';
import { sendSuccess, sendCreated, sendError } from '../utils/apiResponse';
import { AuthRequest } from '../types';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─── Validation Schemas ──────────────────────────────────
const signupSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(50),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ─── Routes ──────────────────────────────────────────────

// POST /auth/signup
router.post('/signup', authLimiter, validate(signupSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { user, tokens } = await authService.signup(req.body);
    sendCreated(res, {
      user: { id: user.id, username: user.username, email: user.email, displayName: user.displayName },
      ...tokens,
    }, 'Account created successfully');
  } catch (err) { next(err); }
});

// POST /auth/login
router.post('/login', authLimiter, validate(loginSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { user, tokens } = await authService.login(
      req.body.email,
      req.body.password,
      req.headers['user-agent'],
      req.ip
    );
    sendSuccess(res, {
      user: { id: user.id, username: user.username, email: user.email, displayName: user.displayName, avatarUrl: user.avatarUrl, currentMood: user.currentMood },
      ...tokens,
    }, 'Login successful');
  } catch (err) { next(err); }
});

// POST /auth/logout
router.post('/logout', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) await authService.logout(refreshToken);
    sendSuccess(res, null, 'Logged out successfully');
  } catch (err) { next(err); }
});

// POST /auth/refresh
router.post('/refresh', validate(refreshSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tokens = await authService.refresh(req.body.refreshToken);
    sendSuccess(res, tokens, 'Tokens refreshed');
  } catch (err) { next(err); }
});

// POST /auth/face/register
router.post('/face/register', authenticate, faceLimiter, upload.single('image'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { sendError(res, 'Image file required', 400); return; }
    const result = await authService.registerFace(req.userId!, req.file.buffer);
    sendSuccess(res, result, 'Face registered');
  } catch (err) { next(err); }
});

// POST /auth/face/verify
router.post('/face/verify', faceLimiter, upload.single('image'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { sendError(res, 'Image file required', 400); return; }
    const { email } = req.body;
    if (!email) { sendError(res, 'email required', 400); return; }
    const result = await authService.verifyFace(email, req.file.buffer);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// GET /auth/check-username/:username
router.get('/check-username/:username', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const available = await authService.checkUsername(req.params.username);
    sendSuccess(res, { available });
  } catch (err) { next(err); }
});

export default router;
