import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  // If already connected, return existing socket
  if (socket?.connected) return socket;

  // If socket exists but disconnected, clean up first
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  const token = getAccessToken();
  if (!token) {
    console.warn('🔌 No auth token — cannot connect socket');
    return null as any;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    // Use polling first, then upgrade to websocket — more reliable on reverse proxies (Render)
    transports: ['polling', 'websocket'],
    upgrade: true,
    reconnection: true,
    reconnectionAttempts: Infinity, // Keep trying in production
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
    // Force new connection on reconnect with fresh token
    forceNew: false,
  });

  socket.on('connect', () => {
    console.log('🔌 Socket connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket disconnected:', reason);
    // If server disconnected us, try reconnecting with fresh token
    if (reason === 'io server disconnect') {
      const freshToken = getAccessToken();
      if (freshToken && socket) {
        socket.auth = { token: freshToken };
        socket.connect();
      }
    }
  });

  socket.on('connect_error', (error) => {
    console.error('🔌 Socket connection error:', error.message);
    // If auth error, try with fresh token
    if (error.message.includes('token') || error.message.includes('Authentication')) {
      const freshToken = getAccessToken();
      if (freshToken && socket) {
        socket.auth = { token: freshToken };
      }
    }
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

// ─── Typed event helpers ─────────────────────────────────
export function onSocketEvent<T = unknown>(event: string, callback: (data: T) => void) {
  socket?.on(event, callback as (...args: unknown[]) => void);
  return () => {
    socket?.off(event, callback as (...args: unknown[]) => void);
  };
}

export function emitSocketEvent(event: string, data?: unknown) {
  socket?.emit(event, data);
}
