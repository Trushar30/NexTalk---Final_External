import axios from 'axios';
import { encryptMessage, decryptMessage } from './crypto';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// ─── Axios Instance ──────────────────────────────────────
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// ─── Token helpers (sync with useAuthStore) ──────────────
export function getAccessToken(): string | null {
  return localStorage.getItem('accessToken');
}

export function getRefreshToken(): string | null {
  return localStorage.getItem('refreshToken');
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem('accessToken', access);
  localStorage.setItem('refreshToken', refresh);
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

// ─── Request Interceptor ────────────────────────────────
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response Interceptor (auto-refresh on 401) ─────────
let isRefreshing = false;
let failedQueue: { resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
        const newAccess = data.data.accessToken;
        const newRefresh = data.data.refreshToken;
        setTokens(newAccess, newRefresh);
        processQueue(null, newAccess);
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ─── Typed API helpers (unwrap { success, data } envelope) ─
async function unwrap<T>(promise: Promise<{ data: { success: boolean; data?: T; message?: string; error?: string } }>): Promise<T> {
  const res = await promise;
  if (!res.data.success) throw new Error(res.data.error || 'API Error');
  return res.data.data as T;
}

// ─── Auth API ────────────────────────────────────────────
export const authApi = {
  signup: (body: { username: string; email: string; password: string; displayName: string }) =>
    unwrap<{ user: AuthUser; accessToken: string; refreshToken: string }>(apiClient.post('/auth/signup', body)),

  login: (email: string, password: string) =>
    unwrap<{ user: AuthUser; accessToken: string; refreshToken: string }>(apiClient.post('/auth/login', { email, password })),

  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refreshToken }),

  refresh: (refreshToken: string) =>
    unwrap<{ accessToken: string; refreshToken: string }>(apiClient.post('/auth/refresh', { refreshToken })),

  checkUsername: (username: string) =>
    unwrap<{ available: boolean }>(apiClient.get(`/auth/check-username/${username}`)),

  registerFace: (image: File) => {
    const form = new FormData();
    form.append('image', image);
    return unwrap<{ success: boolean }>(apiClient.post('/auth/face/register', form, { headers: { 'Content-Type': 'multipart/form-data' } }));
  },

  verifyFace: (email: string, image: File) => {
    const form = new FormData();
    form.append('email', email);
    form.append('image', image);
    return unwrap<{ verified: boolean; mood: string | null; tokens?: { accessToken: string; refreshToken: string }; user?: AuthUser }>(
      apiClient.post('/auth/face/verify', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    );
  },
};

// ─── Users API ───────────────────────────────────────────
export const usersApi = {
  getMe: () => unwrap<UserProfile>(apiClient.get('/users/me')),

  updateProfile: (body: Partial<{ displayName: string; bio: string; avatarUrl: string; privacyLevel: string }>) =>
    unwrap<UserProfile>(apiClient.patch('/users/me', body)),

  updateMood: (mood: string) =>
    unwrap(apiClient.patch('/users/me/mood', { mood })),

  search: (q: string) =>
    unwrap<UserProfile[]>(apiClient.get('/users/search', { params: { q } })),

  getByUsername: (username: string) =>
    unwrap<UserProfile>(apiClient.get(`/users/${username}`)),

  getConnections: () =>
    unwrap<Connection[]>(apiClient.get('/users/me/connections')),
};

// ─── Connections API ─────────────────────────────────────
export const connectionsApi = {
  sendRequest: (userId: string) =>
    unwrap(apiClient.post(`/connections/request/${userId}`)),

  accept: (requestId: string) =>
    unwrap(apiClient.post(`/connections/accept/${requestId}`)),

  decline: (requestId: string) =>
    unwrap(apiClient.post(`/connections/decline/${requestId}`)),

  remove: (userId: string) =>
    unwrap(apiClient.delete(`/connections/${userId}`)),

  getIncoming: () =>
    unwrap<ConnectionRequest[]>(apiClient.get('/connections/requests')),

  getSent: () =>
    unwrap<ConnectionRequest[]>(apiClient.get('/connections/sent')),
};

// ─── Conversations API ───────────────────────────────────
export const conversationsApi = {
  list: () =>
    unwrap<Conversation[]>(apiClient.get('/conversations'))
      .then(convs => convs.map(c => ({
        ...c,
        lastMessage: c.lastMessage ? { ...c.lastMessage, content: c.lastMessage.content ? decryptMessage(c.lastMessage.content) : c.lastMessage.content } : c.lastMessage
      }))),

  create: (body: { userId?: string; name?: string; memberIds?: string[] }) =>
    unwrap<Conversation>(apiClient.post('/conversations', body)),

  getById: (id: string) =>
    unwrap<Conversation>(apiClient.get(`/conversations/${id}`))
      .then(c => ({
        ...c,
        lastMessage: c.lastMessage ? { ...c.lastMessage, content: c.lastMessage.content ? decryptMessage(c.lastMessage.content) : c.lastMessage.content } : c.lastMessage
      })),

  getMessages: (id: string, cursor?: string, limit = 30) =>
    apiClient.get(`/conversations/${id}/messages`, { params: { cursor, limit } })
      .then(res => {
         const payload = res.data as { success: boolean; data: Message[]; meta?: { hasMore: boolean; nextCursor?: string } };
         if (payload.data) {
           payload.data = payload.data.map(m => ({ ...m, content: m.content ? decryptMessage(m.content) : m.content }));
         }
         return payload;
      }),

  sendMessage: (id: string, body: { content?: string; type?: string; isOneTime?: boolean }) => {
    const encBody = { ...body, content: body.content ? encryptMessage(body.content) : body.content };
    return unwrap<Message>(apiClient.post(`/conversations/${id}/messages`, encBody))
      .then(msg => ({ ...msg, content: msg.content ? decryptMessage(msg.content) : msg.content }));
  },

  editMessage: (convId: string, msgId: string, content: string) =>
    unwrap(apiClient.patch(`/conversations/${convId}/messages/${msgId}`, { content: encryptMessage(content) })),

  deleteMessage: (convId: string, msgId: string) =>
    unwrap(apiClient.delete(`/conversations/${convId}/messages/${msgId}`)),

  react: (convId: string, msgId: string, emoji: string) =>
    unwrap(apiClient.post(`/conversations/${convId}/messages/${msgId}/react`, { emoji })),

  markRead: (convId: string) =>
    unwrap(apiClient.post(`/conversations/${convId}/read`)),

  markOneTimeViewed: (convId: string, msgId: string) =>
    unwrap(apiClient.post(`/conversations/${convId}/messages/${msgId}/view`)),
};

// ─── Teams API ───────────────────────────────────────────
export const teamsApi = {
  list: () => unwrap<Team[]>(apiClient.get('/teams')),

  create: (body: { name: string; tag: string; description?: string; isPublic?: boolean }) =>
    unwrap<Team>(apiClient.post('/teams', body)),

  getById: (id: string) => unwrap<Team>(apiClient.get(`/teams/${id}`)),

  update: (id: string, body: Partial<{ name: string; description: string; bannerUrl: string; isPublic: boolean }>) =>
    unwrap<Team>(apiClient.patch(`/teams/${id}`, body)),

  delete: (id: string) => unwrap(apiClient.delete(`/teams/${id}`)),

  join: (id: string) => unwrap(apiClient.post(`/teams/${id}/join`)),

  leave: (id: string) => unwrap(apiClient.delete(`/teams/${id}/leave`)),

  invite: (id: string, userId: string) => unwrap(apiClient.post(`/teams/${id}/invite`, { userId })),

  getChannels: (id: string) => unwrap<TeamChannel[]>(apiClient.get(`/teams/${id}/channels`)),

  createChannel: (id: string, body: { name: string; description?: string }) =>
    unwrap<TeamChannel>(apiClient.post(`/teams/${id}/channels`, body)),

  getMembers: (id: string) => unwrap<Team['members']>(apiClient.get(`/teams/${id}/members`)),

  removeMember: (teamId: string, userId: string) =>
    unwrap(apiClient.delete(`/teams/${teamId}/members/${userId}`)),

  updateMemberRole: (teamId: string, userId: string, role: string) =>
    unwrap(apiClient.patch(`/teams/${teamId}/members/${userId}`, { role })),

  search: (tag: string) => unwrap<Team[]>(apiClient.get('/teams/search', { params: { tag } })),
};

// ─── Notifications API ───────────────────────────────────
export const notificationsApi = {
  list: (page = 1, limit = 20) =>
    apiClient.get('/notifications', { params: { page, limit } })
      .then(res => res.data as { success: boolean; data: AppNotification[]; meta?: { total: number; hasMore: boolean } }),

  markRead: (id: string) => unwrap(apiClient.patch(`/notifications/${id}/read`)),

  markAllRead: () => unwrap(apiClient.patch('/notifications/read-all')),

  remove: (id: string) => unwrap(apiClient.delete(`/notifications/${id}`)),
};

// ─── AI API ──────────────────────────────────────────────
export const aiApi = {
  toxicCheck: (content: string) =>
    unwrap<{ isToxic: boolean; score: number; categories: string[] }>(apiClient.post('/ai/toxic-check', { content })),

  summarize: (messages: { sender: string; content: string }[]) =>
    unwrap<{ summary: string }>(apiClient.post('/ai/summarize', { messages })),

  cloneReply: (conversationId: string, message: string) =>
    unwrap<CloneReplyResponse>(apiClient.post('/ai/clone-reply', { conversationId, message })),
};

// ─── Status API ──────────────────────────────────────────
export interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latencyMs: number | null;
  message?: string;
}

export interface SystemStatus {
  overall: 'operational' | 'degraded';
  services: ServiceStatus[];
  checkedAt: string;
}

export const statusApi = {
  check: () =>
    unwrap<SystemStatus>(apiClient.get('/status')),
};

// ─── Types ───────────────────────────────────────────────
export interface AuthUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  currentMood?: string;
}

export interface UserProfile {
  _id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  currentMood: string;
  isOnline: boolean;
  lastSeenAt?: string;
  privacyLevel: string;
  createdAt: string;
}

export interface Connection {
  _id: string;
  requesterId: UserProfile;
  recipientId: UserProfile;
  status: string;
  createdAt: string;
}

export interface ConnectionRequest {
  _id: string;
  requesterId: UserProfile;
  recipientId: UserProfile;
  status: string;
  createdAt: string;
}

export interface Conversation {
  _id: string;
  isGroup: boolean;
  name?: string;
  members: { userId: UserProfile; joinedAt: string; lastReadAt?: string }[];
  lastMessage?: Message;
  createdAt: string;
}

export interface Message {
  _id: string;
  conversationId: string;
  senderId: string | UserProfile;
  content?: string;
  type: string;
  isOneTime: boolean;
  isToxic: boolean;
  toxicScore?: number;
  toxicCategories: string[];
  reactions: { userId: string; emoji: string; createdAt: string }[];
  readBy: { userId: string; readAt: string }[];
  isDeleted: boolean;
  createdAt: string;
  editedAt?: string;
}

export interface Team {
  _id: string;
  name: string;
  tag: string;
  description?: string;
  bannerUrl?: string;
  isPublic: boolean;
  createdBy: string;
  members: { userId: UserProfile; role: string; joinedAt: string }[];
  createdAt: string;
}

export interface TeamChannel {
  _id: string;
  teamId: string;
  name: string;
  description?: string;
  conversationId?: string;
  createdAt: string;
}

export interface AppNotification {
  _id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

// ─── AI Cloner Types ─────────────────────────────────────
export interface StyleProfile {
  avg_length: number;
  emoji_frequency: number;
  favorite_emojis: string[];
  punctuation_style: string;
  capitalization: string;
  vocabulary_level: string;
  greeting_style: string;
  mood: string;
  slang_level: string;
  response_patterns: string[];
}

export interface CloneReplyResponse {
  prediction: string;
  style_profile: StyleProfile;
  confidence: number;
  method: string;
}
