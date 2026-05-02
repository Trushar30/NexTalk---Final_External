import { create } from 'zustand';
import { authApi, usersApi, setTokens, clearTokens, getAccessToken, getRefreshToken } from '@/lib/api';
import type { AuthUser } from '@/lib/api';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  loginWithFace: (email: string, image: File) => Promise<{ verified: boolean; mood?: string | null }>;
  signup: (data: { username: string; email: string; password: string; displayName: string }) => Promise<void>;
  logout: () => Promise<void>;
  fetchCurrentUser: () => Promise<void>;
  initialize: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true, // true on first load to check stored tokens
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const result = await authApi.login(email, password);
      setTokens(result.accessToken, result.refreshToken);
      set({ user: result.user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      const data = err.response?.data;
      const message = (data?.details && data.details[0]) || data?.error || err.message || 'Login failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  loginWithFace: async (email, image) => {
    set({ isLoading: true, error: null });
    try {
      const result = await authApi.verifyFace(email, image);
      if (result.verified && result.tokens && result.user) {
        setTokens(result.tokens.accessToken, result.tokens.refreshToken);
        set({ user: result.user, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false, error: 'Face not recognized' });
      }
      return { verified: result.verified, mood: result.mood };
    } catch (err: any) {
      const data = err.response?.data;
      const message = (data?.details && data.details[0]) || data?.error || err.message || 'Face login failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  signup: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const result = await authApi.signup(data);
      setTokens(result.accessToken, result.refreshToken);
      set({ user: result.user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      const data = err.response?.data;
      const message = (data?.details && data.details[0]) || data?.error || err.message || 'Signup failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        await authApi.logout(refreshToken).catch(() => {});
      }
    } finally {
      clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false, error: null });
    }
  },

  fetchCurrentUser: async () => {
    try {
      const profile = await usersApi.getMe();
      set({
        user: {
          id: profile._id,
          username: profile.username,
          email: profile.email,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          currentMood: profile.currentMood,
        },
        isAuthenticated: true,
      });
    } catch {
      clearTokens();
      set({ user: null, isAuthenticated: false });
    }
  },

  initialize: async () => {
    const token = getAccessToken();
    if (!token) {
      set({ isLoading: false });
      return;
    }
    try {
      await get().fetchCurrentUser();
    } finally {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
