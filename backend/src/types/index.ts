import { Request } from 'express';
import { MoodType, MessageType, NotificationType, TeamRole, ConnectionStatus } from '../models';

// ─── Auth ────────────────────────────────────────────────
export interface AuthRequest extends Request {
  userId?: string;
}

export interface TokenPayload {
  userId: string;
  type: 'access' | 'refresh';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ─── API ─────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  total?: number;
  page?: number;
  limit?: number;
  hasMore?: boolean;
  nextCursor?: string;
}

// ─── Socket Events ───────────────────────────────────────
export interface ServerToClientEvents {
  'message:new': (data: { message: unknown; conversationId: string }) => void;
  'message:edited': (data: { messageId: string; content: string; editedAt: Date }) => void;
  'message:deleted': (data: { messageId: string }) => void;
  'message:reaction': (data: { messageId: string; userId: string; emoji: string; action: 'add' | 'remove' }) => void;
  'message:read': (data: { userId: string; conversationId: string; messageId: string; readAt: Date }) => void;
  'message:toxic:warning': (data: { messageId: string; score: number; categories: string[] }) => void;
  'onetimemessage:expired': (data: { messageId: string }) => void;
  'typing:started': (data: { userId: string; conversationId: string }) => void;
  'typing:stopped': (data: { userId: string; conversationId: string }) => void;
  'user:online': (data: { userId: string }) => void;
  'user:offline': (data: { userId: string; lastSeenAt: Date }) => void;
  'user:mood': (data: { userId: string; mood: string }) => void;
  'notification:new': (data: { notification: unknown }) => void;
  'screenshot:alert': (data: { conversationId: string; userId: string; detectedAt: Date }) => void;
}

export interface ClientToServerEvents {
  'join:conversation': (data: { conversationId: string }) => void;
  'leave:conversation': (data: { conversationId: string }) => void;
  'message:send': (data: SendMessagePayload) => void;
  'message:edit': (data: { messageId: string; content: string }) => void;
  'message:delete': (data: { messageId: string }) => void;
  'message:react': (data: { messageId: string; emoji: string }) => void;
  'message:read': (data: { conversationId: string; messageId: string }) => void;
  'onetimemessage:viewed': (data: { messageId: string }) => void;
  'typing:start': (data: { conversationId: string }) => void;
  'typing:stop': (data: { conversationId: string }) => void;
  'presence:update': (data: { status: 'online' | 'away' | 'offline' }) => void;
  'mood:update': (data: { mood: string }) => void;
  'screenshot:detected': (data: { conversationId: string }) => void;
  heartbeat: () => void;
}

export interface SocketData {
  userId: string;
}

// ─── Message ─────────────────────────────────────────────
export interface SendMessagePayload {
  conversationId: string;
  content?: string;
  encryptedContent?: string;
  contentKey?: string;
  type?: string;
  isOneTime?: boolean;
  mediaUrl?: string;
}

// ─── AI Service ──────────────────────────────────────────
export interface ToxicCheckResult {
  isToxic: boolean;
  score: number;
  categories: string[];
}

export interface EmotionResult {
  verified: boolean;
  mood: string | null;
  confidence: number;
}

export interface SummarizeResult {
  summary: string;
}
