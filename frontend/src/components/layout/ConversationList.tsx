import { Avatar } from '@/components/ui/Avatar';
import type { Mood } from '@/components/ui/MoodRing';
import { Search, Hash } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { conversationsApi } from '@/lib/api';
import type { Conversation } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';
import { onSocketEvent } from '@/lib/socket';

export function ConversationList() {
  const [filter, setFilter] = useState<'All' | 'Unread' | 'Teams' | 'One-Time'>('All');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const { activeConversationId, setActiveConversation } = useStore();

  const filters = ['All', 'Unread', 'Teams', 'One-Time'];

  useEffect(() => {
    loadConversations();
    // Listen for new messages to update conversation list
    const unsub = onSocketEvent('message:new', () => {
      loadConversations();
    });
    return unsub;
  }, []);

  const loadConversations = async () => {
    try {
      const data = await conversationsApi.list();
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const getOtherUser = (conv: Conversation) => {
    if (conv.isGroup) return null;
    const other = conv.members.find(m => {
      const uid = typeof m.userId === 'string' ? m.userId : m.userId?._id;
      return uid !== user?.id;
    });
    return other?.userId;
  };

  const getConversationName = (conv: Conversation) => {
    if (conv.isGroup && conv.name) return conv.name;
    const otherUser = getOtherUser(conv);
    if (otherUser && typeof otherUser !== 'string') return otherUser.displayName;
    return 'Unknown';
  };

  const getConversationMood = (conv: Conversation): Mood => {
    const otherUser = getOtherUser(conv);
    if (otherUser && typeof otherUser !== 'string') {
      return (otherUser.currentMood?.toLowerCase() || 'neutral') as Mood;
    }
    return 'neutral';
  };

  const filteredConversations = conversations.filter(conv => {
    if (search) {
      const name = getConversationName(conv).toLowerCase();
      if (!name.includes(search.toLowerCase())) return false;
    }
    if (filter === 'Teams') return conv.isGroup;
    return true;
  });

  return (
    <div className={cn(
      "bg-bg-primary flex flex-col flex-shrink-0 z-10",
      // Desktop: Fixed width sidebar
      "md:w-80 md:h-[100dvh] md:border-r md:border-border-subtle md:flex",
      // Mobile: Full width, hide if conversation is active
      activeConversationId ? "hidden" : "w-full flex-1 flex pb-16 md:pb-0" // Add pb-16 for mobile bottom nav
    )}>
      {/* Header & Search */}
      <div className="p-4 space-y-4">
        <h2 className="text-xl font-bold font-heading">Messages</h2>
        <Input 
          type="text" 
          placeholder="Search..." 
          icon={<Search className="w-4 h-4" />} 
          className="bg-bg-secondary border-border-subtle h-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        
        {/* Filter Chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f as typeof filter)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                filter === f 
                  ? "bg-accent-primary text-white" 
                  : "bg-bg-secondary text-text-secondary hover:bg-bg-elevated hover:text-text-primary border border-border-subtle"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-4 space-y-[2px] px-2">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted text-sm">
          </div>
        ) : (
          filteredConversations.map(conv => {
            const name = getConversationName(conv);
            const mood = getConversationMood(conv);
            const isActive = activeConversationId === conv._id;
            const otherUser = getOtherUser(conv);
            const isOnline = otherUser && typeof otherUser !== 'string' ? otherUser.isOnline : false;

            return (
              <div 
                key={conv._id}
                onClick={() => setActiveConversation(conv._id)}
                className={cn(
                  "group flex items-center gap-3 p-3 rounded-xl w-full cursor-pointer transition-colors relative",
                  isActive ? "bg-accent-primary/10 border border-accent-primary/30" : "hover:bg-bg-secondary"
                )}
              >
                <div className="relative">
                  <Avatar 
                    src={typeof otherUser !== 'string' ? otherUser?.avatarUrl : undefined} 
                    alt={name} 
                    size="md" 
                    mood={mood as any} 
                    showMood
                  >
                    {conv.isGroup ? <Hash className="w-5 h-5 text-text-secondary" /> : null}
                  </Avatar>
                  {isOnline && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-success border-2 border-bg-primary rounded-full animate-pulseBreathe" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{name}</h3>
                      {conv.isGroup && conv.name && (
                        <span className="font-mono text-[10px] bg-accent-amber/20 text-accent-amber px-1.5 py-0.5 rounded-md leading-none border border-accent-amber/30">
                          #{conv.name}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <p className="text-xs truncate text-text-secondary">
                      {conv.lastMessage?.content || ''}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
