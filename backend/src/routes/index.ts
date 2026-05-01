import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import connectionRoutes from './connection.routes';
import conversationRoutes from './conversation.routes';
import teamRoutes from './team.routes';
import notificationRoutes from './notification.routes';
import aiRoutes from './ai.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/connections', connectionRoutes);
router.use('/conversations', conversationRoutes);
router.use('/teams', teamRoutes);
router.use('/notifications', notificationRoutes);
router.use('/ai', aiRoutes);

export default router;
