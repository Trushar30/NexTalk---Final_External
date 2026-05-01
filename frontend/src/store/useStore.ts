import { create } from 'zustand';

export type Mood = 'calm' | 'happy' | 'focused' | 'stressed' | 'excited' | 'neutral';

interface AppState {
  // Active conversation
  activeConversationId: string | null;
  setActiveConversation: (id: string | null) => void;

  // Presence tracking 
  onlineUsers: Set<string>;
  setUserOnline: (userId: string) => void;
  setUserOffline: (userId: string) => void;

  // Typing indicators
  typingUsers: Map<string, Set<string>>; // convId -> Set of userIds
  setUserTyping: (conversationId: string, userId: string) => void;
  setUserStoppedTyping: (conversationId: string, userId: string) => void;
  // Profile Modal
  viewingProfile: string | null;
  setViewingProfile: (username: string | null) => void;
}

export const useStore = create<AppState>((set) => ({
  viewingProfile: null,
  setViewingProfile: (username) => set({ viewingProfile: username }),
  activeConversationId: null,
  setActiveConversation: (id) => set({ activeConversationId: id }),

  onlineUsers: new Set(),
  setUserOnline: (userId) =>
    set((state) => {
      const newSet = new Set(state.onlineUsers);
      newSet.add(userId);
      return { onlineUsers: newSet };
    }),
  setUserOffline: (userId) =>
    set((state) => {
      const newSet = new Set(state.onlineUsers);
      newSet.delete(userId);
      return { onlineUsers: newSet };
    }),

  typingUsers: new Map(),
  setUserTyping: (conversationId, userId) =>
    set((state) => {
      const newMap = new Map(state.typingUsers);
      const users = new Set(newMap.get(conversationId) || []);
      users.add(userId);
      newMap.set(conversationId, users);
      return { typingUsers: newMap };
    }),
  setUserStoppedTyping: (conversationId, userId) =>
    set((state) => {
      const newMap = new Map(state.typingUsers);
      const users = new Set(newMap.get(conversationId) || []);
      users.delete(userId);
      newMap.set(conversationId, users);
      return { typingUsers: newMap };
    }),
}));
