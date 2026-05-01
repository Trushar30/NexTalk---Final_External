import { Router, Response, NextFunction } from 'express';
import { connectionService } from '../services/connection.service';
import { conversationService } from '../services/conversation.service';
import { authenticate } from '../middleware/auth.middleware';
import { connectionLimiter } from '../middleware/rateLimiter.middleware';
import { sendSuccess, sendCreated } from '../utils/apiResponse';
import { AuthRequest } from '../types';

const router = Router();

// POST /connections/request/:userId — Send connection request
router.post('/request/:userId', authenticate, connectionLimiter, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const connection = await connectionService.sendRequest(req.userId!, req.params.userId);
    sendCreated(res, connection, 'Connection request sent');
  } catch (err) { next(err); }
});

// POST /connections/accept/:requestId — Accept connection
router.post('/accept/:requestId', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const connection = await connectionService.acceptRequest(req.params.requestId, req.userId!);
    // Auto-create a DM so users can immediately start chatting
    await conversationService.createDM(connection.requesterId.toString(), connection.recipientId.toString());
    sendSuccess(res, connection, 'Connection accepted');
  } catch (err) { next(err); }
});

// POST /connections/decline/:requestId — Decline connection
router.post('/decline/:requestId', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await connectionService.declineRequest(req.params.requestId, req.userId!);
    sendSuccess(res, null, 'Connection declined');
  } catch (err) { next(err); }
});

// DELETE /connections/:userId — Remove connection
router.delete('/:userId', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await connectionService.removeConnection(req.userId!, req.params.userId);
    sendSuccess(res, null, 'Connection removed');
  } catch (err) { next(err); }
});

// GET /connections/requests — Pending incoming
router.get('/requests', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const requests = await connectionService.getIncomingRequests(req.userId!);
    sendSuccess(res, requests);
  } catch (err) { next(err); }
});

// GET /connections/sent — Pending outgoing
router.get('/sent', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sent = await connectionService.getSentRequests(req.userId!);
    sendSuccess(res, sent);
  } catch (err) { next(err); }
});

export default router;
