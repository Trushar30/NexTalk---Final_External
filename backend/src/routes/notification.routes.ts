import { Router, Response, NextFunction } from 'express';
import { notificationService } from '../services/notification.service';
import { authenticate } from '../middleware/auth.middleware';
import { sendSuccess } from '../utils/apiResponse';
import { AuthRequest } from '../types';

const router = Router();

// GET /notifications — Paginated list
router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const { notifications, total } = await notificationService.listForUser(req.userId!, page, limit);
    sendSuccess(res, notifications, undefined, 200, { total, page, limit, hasMore: page * limit < total });
  } catch (err) { next(err); }
});

// PATCH /notifications/read-all — Mark all read
router.patch('/read-all', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await notificationService.markAllRead(req.userId!);
    sendSuccess(res, null, 'All notifications marked as read');
  } catch (err) { next(err); }
});

// PATCH /notifications/:id/read — Mark one read
router.patch('/:id/read', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await notificationService.markRead(req.params.id, req.userId!);
    sendSuccess(res, null, 'Notification marked as read');
  } catch (err) { next(err); }
});

// DELETE /notifications/:id — Delete
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await notificationService.delete(req.params.id, req.userId!);
    sendSuccess(res, null, 'Notification deleted');
  } catch (err) { next(err); }
});

export default router;
