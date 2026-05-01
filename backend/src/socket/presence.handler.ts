import { Server, Socket } from 'socket.io';
import { presenceService } from '../services/presence.service';
import { notificationService } from '../services/notification.service';
import { conversationService } from '../services/conversation.service';
import { ScreenshotLog } from '../models';
import { ServerToClientEvents, ClientToServerEvents, SocketData } from '../types';

type IOServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export function registerPresenceHandlers(io: IOServer, socket: IOSocket): void {
  const userId = socket.data.userId;

  // ─── Typing Indicators ─────────────────────────────────
  socket.on('typing:start', async ({ conversationId }) => {
    try {
      const isNew = await presenceService.setTyping(userId, conversationId);
      if (isNew) {
        socket.to(conversationId).emit('typing:started', { userId, conversationId });
      }
    } catch (error) {
      console.error('typing:start error:', error);
    }
  });

  socket.on('typing:stop', async ({ conversationId }) => {
    try {
      await presenceService.clearTyping(userId, conversationId);
      socket.to(conversationId).emit('typing:stopped', { userId, conversationId });
    } catch (error) {
      console.error('typing:stop error:', error);
    }
  });

  // ─── Mood Update ────────────────────────────────────────
  socket.on('mood:update', async ({ mood }) => {
    try {
      await presenceService.updateMood(userId, mood);
      // Broadcast to all connected users
      io.emit('user:mood', { userId, mood });
    } catch (error) {
      console.error('mood:update error:', error);
    }
  });

  // ─── Presence Status ───────────────────────────────────
  socket.on('presence:update', async ({ status }) => {
    try {
      if (status === 'offline') {
        const lastSeenAt = await presenceService.setOffline(userId);
        io.emit('user:offline', { userId, lastSeenAt });
      } else {
        await presenceService.setOnline(userId);
        io.emit('user:online', { userId });
      }
    } catch (error) {
      console.error('presence:update error:', error);
    }
  });

  // ─── Screenshot Detection ──────────────────────────────
  socket.on('screenshot:detected', async ({ conversationId }) => {
    try {
      // Log the screenshot event
      await ScreenshotLog.create({ conversationId, userId, detectedAt: new Date() });

      // Get other members and notify
      const memberIds = await conversationService.getMemberIds(conversationId);
      const otherMembers = memberIds.filter((id) => id !== userId);

      const detectedAt = new Date();

      for (const memberId of otherMembers) {
        // Real-time alert via socket
        io.to(`user:${memberId}`).emit('screenshot:alert', {
          conversationId,
          userId,
          detectedAt,
        });

        // Persist notification
        await notificationService.create({
          userId: memberId,
          type: 'SCREENSHOT_TAKEN',
          title: 'Screenshot detected',
          body: 'Someone took a screenshot of your conversation.',
          data: { conversationId, screenshotterId: userId },
        });
      }
    } catch (error) {
      console.error('screenshot:detected error:', error);
    }
  });
}
