import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyAccessToken } from '../utils/jwt';
import { presenceService } from '../services/presence.service';
import { redis } from '../config/redis';
import { registerChatHandlers } from './chat.handler';
import { registerPresenceHandlers } from './presence.handler';
import { ServerToClientEvents, ClientToServerEvents, SocketData } from '../types';
import { env, getAllowedOrigins } from '../config/env';

export function initializeSocket(httpServer: HttpServer): Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> {
  const allowedOrigins = getAllowedOrigins();

  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        if (env.NODE_ENV === 'development' && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
          return callback(null, true);
        }
        callback(new Error('CORS: Origin not allowed'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Production-optimized settings
    pingTimeout: 60000,
    pingInterval: 25000,
    // Transport configuration
    transports: ['websocket', 'polling'], // Prefer WebSocket, fallback to polling
    allowUpgrades: true,
    // Performance
    perMessageDeflate: false, // Disable compression for lower latency
    httpCompression: false,
    // Connection limits
    maxHttpBufferSize: 1e6, // 1MB max message size
    connectTimeout: 45000,
  });

  // ─── Auth Middleware ────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = verifyAccessToken(token);
      socket.data.userId = payload.userId;

      // Set user online
      await presenceService.setOnline(payload.userId);

      // Join personal room for targeted events
      socket.join(`user:${payload.userId}`);

      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  // ─── Connection Handler ─────────────────────────────────
  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    console.log(`🔌 Socket connected: ${userId} (${socket.id})`);

    // Broadcast online status to connections
    io.emit('user:online', { userId });

    // Register event handlers
    registerChatHandlers(io, socket);
    registerPresenceHandlers(io, socket);

    // Heartbeat
    socket.on('heartbeat', async () => {
      await presenceService.refreshHeartbeat(userId);
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`🔌 Socket disconnected: ${userId} (${socket.id})`);
      const lastSeenAt = await presenceService.setOffline(userId);
      io.emit('user:offline', { userId, lastSeenAt });
    });
  });

  return io;
}
