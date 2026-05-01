import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Phone, Video, Search, MoreVertical, Flame, Paperclip, Smile, Send,
  ShieldAlert, Lock, Trash2, Sparkles, X, Loader2, CheckSquare,
  CheckCheck,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { conversationsApi, aiApi } from '@/lib/api';
import type { Message, Conversation, UserProfile } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';
import { onSocketEvent, emitSocketEvent } from '@/lib/socket';
import { decryptMessage } from '@/lib/crypto';

export function ChatArea() {
  const [messageText, setMessageText] = useState('');
  const [isOneTime, setIsOneTime] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [revealedMessages, setRevealedMessages] = useState<Set<string>>(new Set());

  // ─── Header 3-dot menu ──────────────────────────────────
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  // ─── Multi-select mode ──────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ─── AI Summary modal ───────────────────────────────────
  const [summaryModal, setSummaryModal] = useState<{
    loading: boolean;
    text: string | null;
    count: number;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const { activeConversationId, typingUsers } = useStore();

  // Close header menu on outside click
  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  // Exit select mode when conversation changes
  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [activeConversationId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load conversation + messages
  useEffect(() => {
    if (!activeConversationId) return;

    setLoading(true);
    setMessages([]);
    setConversation(null);

    Promise.all([
      conversationsApi.getById(activeConversationId),
      conversationsApi.getMessages(activeConversationId),
    ]).then(([conv, msgRes]) => {
      setConversation(conv);
      setMessages([...(msgRes.data || [])].reverse());
      setLoading(false);
      setTimeout(scrollToBottom, 100);
    }).catch(err => {
      console.error('Failed to load conversation:', err);
      setLoading(false);
    });

    emitSocketEvent('join:conversation', { conversationId: activeConversationId });
    return () => { emitSocketEvent('leave:conversation', { conversationId: activeConversationId }); };
  }, [activeConversationId, scrollToBottom]);

  // Real-time new messages
  useEffect(() => {
    if (!activeConversationId) return;
    const unsub = onSocketEvent<{ message: Message; conversationId: string }>('message:new', (data) => {
      if (data.conversationId === activeConversationId) {
        const decryptedMessage = {
          ...data.message,
          content: data.message.content ? decryptMessage(data.message.content) : data.message.content
        };
        setMessages(prev => [...prev, decryptedMessage]);
        setTimeout(scrollToBottom, 100);
      }
    });
    return unsub;
  }, [activeConversationId, scrollToBottom]);

  // Real-time deletions from other clients
  useEffect(() => {
    if (!activeConversationId) return;
    const unsub = onSocketEvent<{ messageId: string }>('message:deleted', ({ messageId }) => {
      setMessages(prev => prev.map(m =>
        m._id === messageId ? { ...m, isDeleted: true, content: undefined } : m
      ));
    });
    return unsub;
  }, [activeConversationId]);

  // ─── Handlers ───────────────────────────────────────────

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMessageText(val);
    if (activeConversationId) emitSocketEvent('typing:start', { conversationId: activeConversationId });
  };

  const handleSend = async () => {
    if (!messageText.trim() || !activeConversationId || sending) return;
    const content = messageText.trim();
    setMessageText('');
    setSending(true);
    try {
      const msg = await conversationsApi.sendMessage(activeConversationId, { content, type: 'TEXT', isOneTime });
      setMessages(prev => [...prev, msg]);
      setTimeout(scrollToBottom, 100);
      if (isOneTime) setIsOneTime(false);
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessageText(content);
    } finally {
      setSending(false);
      emitSocketEvent('typing:stop', { conversationId: activeConversationId });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleReveal = async (msgId: string) => {
    if (!activeConversationId) return;
    try {
      await conversationsApi.markOneTimeViewed(activeConversationId, msgId);
      setRevealedMessages(prev => { const n = new Set(prev); n.add(msgId); return n; });
    } catch (err) { console.error('Failed to reveal message:', err); }
  };

  // ─── Selection helpers ───────────────────────────────────
  const enterSelectMode = () => {
    setHeaderMenuOpen(false);
    setSelectMode(true);
    setSelectedIds(new Set());
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelectMsg = (msgId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  // ─── Bulk Delete ─────────────────────────────────────────
  const handleBulkDelete = async () => {
    if (!activeConversationId || selectedIds.size === 0) return;

    // Only delete messages the user owns
    const myMsgIds = messages
      .filter(m => {
        const sid = typeof m.senderId === 'string' ? m.senderId : m.senderId?._id;
        return sid === user?.id && selectedIds.has(m._id) && !m.isDeleted;
      })
      .map(m => m._id);

    if (myMsgIds.length === 0) {
      exitSelectMode();
      return;
    }

    // Optimistic update for all selected own messages
    setMessages(prev => prev.map(m =>
      myMsgIds.includes(m._id) ? { ...m, isDeleted: true, content: undefined } : m
    ));
    exitSelectMode();

    // Call API for each
    await Promise.allSettled(
      myMsgIds.map(id => conversationsApi.deleteMessage(activeConversationId, id))
    );
  };

  // ─── Bulk Summarize ──────────────────────────────────────
  const handleBulkSummarize = async () => {
    if (selectedIds.size === 0) return;

    const selectedMsgs = messages.filter(
      m => selectedIds.has(m._id) && !m.isDeleted && m.content
    );

    if (selectedMsgs.length === 0) {
      exitSelectMode();
      return;
    }

    const count = selectedMsgs.length;
    exitSelectMode();
    setSummaryModal({ loading: true, text: null, count });

    const payload = selectedMsgs.map(m => ({
      sender: typeof m.senderId !== 'string' ? (m.senderId?.displayName || 'User') : 'User',
      content: m.content || '',
    }));

    try {
      const result = await aiApi.summarize(payload);
      setSummaryModal({ loading: false, text: result.summary, count });
    } catch (err) {
      console.error('Summarize failed:', err);
      setSummaryModal({
        loading: false,
        text: '⚠️ Could not generate summary. AI service may be unavailable.',
        count,
      });
    }
  };

  // ─── Derived values ──────────────────────────────────────
  const getOtherUser = (): UserProfile | null => {
    if (!conversation || conversation.isGroup) return null;
    const other = conversation.members.find(m => {
      const uid = typeof m.userId === 'string' ? m.userId : m.userId?._id;
      return uid !== user?.id;
    });
    if (other?.userId && typeof other.userId !== 'string') return other.userId;
    return null;
  };

  const otherUser = getOtherUser();
  const convName = conversation?.isGroup ? conversation.name : otherUser?.displayName || 'Select a conversation';
  const otherMood = (otherUser?.currentMood?.toLowerCase() || 'neutral') as 'calm' | 'happy' | 'focused' | 'stressed' | 'excited' | 'neutral';
  const isOtherOnline = otherUser?.isOnline || false;
  const currentTypingUsers = activeConversationId ? typingUsers.get(activeConversationId) : undefined;
  const isTyping = currentTypingUsers && currentTypingUsers.size > 0;

  // How many of the selected msgs are deletable (own, non-deleted)
  const deletableCount = messages.filter(m => {
    const sid = typeof m.senderId === 'string' ? m.senderId : m.senderId?._id;
    return sid === user?.id && selectedIds.has(m._id) && !m.isDeleted;
  }).length;

  const summarizableCount = messages.filter(
    m => selectedIds.has(m._id) && !m.isDeleted && m.content
  ).length;

  // No conversation selected
  if (!activeConversationId) {
    return (
      <div className="flex-1 flex flex-col h-screen bg-bg-primary items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-bg-secondary rounded-full flex items-center justify-center mx-auto border border-border-subtle">
            <span className="text-3xl">💬</span>
          </div>
          <h2 className="text-xl font-bold text-text-primary">Welcome to NexTalk</h2>
          <p className="text-text-secondary max-w-sm">Select a conversation to start messaging or search for users to connect.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-bg-primary relative">

      {/* ─── Chat Header ──────────────────────────────────── */}
      <header className="h-20 border-b border-border-subtle bg-bg-primary/50 backdrop-blur-md flex items-center justify-between px-6 z-10 sticky top-0">
        <div className="flex items-center gap-4">
          <Avatar src={otherUser?.avatarUrl} alt={convName || 'User'} size="md" mood={otherMood} showMood />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-lg">{convName}</h2>
              {otherUser && <Badge mood={otherMood} />}
            </div>
            <p className={cn('text-sm flex items-center gap-1.5', isOtherOnline ? 'text-success' : 'text-text-muted')}>
              {isOtherOnline && <span className="w-2 h-2 rounded-full bg-success animate-pulse" />}
              {isOtherOnline ? 'Online' : 'Offline'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="rounded-full"><Phone className="w-5 h-5 text-text-secondary" /></Button>
          <Button variant="ghost" size="icon" className="rounded-full"><Video className="w-5 h-5 text-text-secondary" /></Button>
          <Button variant="ghost" size="icon" className="rounded-full"><Search className="w-5 h-5 text-text-secondary" /></Button>

          {/* 3-dot header menu */}
          <div className="relative" ref={headerMenuRef}>
            <Button
              variant="ghost"
              size="icon"
              className={cn('rounded-full', headerMenuOpen && 'bg-bg-secondary')}
              onClick={() => setHeaderMenuOpen(v => !v)}
            >
              <MoreVertical className="w-5 h-5 text-text-secondary" />
            </Button>

            <AnimatePresence>
              {headerMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -6 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-2 w-52 bg-bg-elevated/95 backdrop-blur-xl border border-border-subtle rounded-2xl shadow-2xl overflow-hidden z-30"
                >
                  {/* Select Messages option */}
                  <button
                    onClick={enterSelectMode}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-primary hover:bg-accent-primary/10 hover:text-accent-primary transition-colors"
                  >
                    <CheckSquare className="w-4 h-4 text-accent-primary" />
                    <span>Select Messages</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* ─── Select Mode Banner ───────────────────────────── */}
      <AnimatePresence>
        {selectMode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden bg-accent-primary/10 border-b border-accent-primary/30"
          >
            <div className="flex items-center justify-between px-6 py-2.5">
              <div className="flex items-center gap-2 text-sm font-medium text-accent-primary">
                <CheckCheck className="w-4 h-4" />
                {selectedIds.size === 0
                  ? 'Tap messages to select'
                  : `${selectedIds.size} selected`}
              </div>
              <button
                onClick={exitSelectMode}
                className="text-xs text-text-muted hover:text-text-primary transition-colors flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Messages Feed ────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-2 flex flex-col no-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center flex-1 text-text-muted text-sm">
            <p>No messages yet. Say hello! 👋</p>
          </div>
        ) : (
          messages.map((msg) => {
            const senderId = typeof msg.senderId === 'string' ? msg.senderId : msg.senderId?._id;
            const isMine = senderId === user?.id;
            const senderName = typeof msg.senderId !== 'string' ? msg.senderId?.displayName : '';
            const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const isSelected = selectedIds.has(msg._id);

            // ── Deleted tombstone ──
            if (msg.isDeleted) {
              return (
                <div
                  key={msg._id}
                  className={cn('flex', isMine ? 'self-end' : 'self-start')}
                  onClick={() => selectMode && toggleSelectMsg(msg._id)}
                >
                  <div className="p-3 rounded-2xl text-sm italic text-text-muted bg-bg-secondary border border-border-subtle">
                    Message deleted
                  </div>
                </div>
              );
            }

            // ── Toxic message ──
            if (msg.isToxic) {
              return (
                <motion.div
                  key={msg._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'flex self-start max-w-[70%] gap-2 items-center',
                    selectMode && 'cursor-pointer',
                    isSelected && 'opacity-80'
                  )}
                  onClick={() => selectMode && toggleSelectMsg(msg._id)}
                >
                  {selectMode && (
                    <SelectCheckbox selected={isSelected} />
                  )}
                  <div className="p-4 rounded-2xl rounded-bl-sm border border-danger/50 bg-danger/10 text-sm">
                    <div className="flex items-center gap-2 mb-2 text-danger font-medium border-b border-danger/20 pb-2">
                      <ShieldAlert className="w-4 h-4" />
                      <span>⚠️ Flagged content — tap to reveal</span>
                    </div>
                    <div className="blur-sm hover:blur-none transition-all cursor-pointer select-none">
                      {msg.content}
                    </div>
                  </div>
                </motion.div>
              );
            }

            const senderAvatar = typeof msg.senderId !== 'string' ? msg.senderId?.avatarUrl : '';
            const senderMood = typeof msg.senderId !== 'string'
              ? (msg.senderId?.currentMood?.toLowerCase() || 'neutral')
              : 'neutral';

            return (
              <motion.div
                key={msg._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => selectMode && toggleSelectMsg(msg._id)}
                className={cn(
                  'flex max-w-[75%] gap-3 items-end',
                  isMine ? 'self-end flex-row-reverse' : 'self-start',
                  selectMode && 'cursor-pointer select-none',
                  isSelected && 'opacity-80'
                )}
              >
                {/* Checkbox (select mode, left side for others) */}
                {selectMode && !isMine && <SelectCheckbox selected={isSelected} />}

                {!isMine && !selectMode && (
                  <Avatar src={senderAvatar} alt={senderName} size="sm" mood={senderMood as any} showMood />
                )}
                {!isMine && selectMode && (
                  <div className="w-7 h-7 shrink-0" /> /* spacer */
                )}

                <div className={cn(
                  'relative p-4 rounded-2xl text-sm transition-all duration-150',
                  isMine
                    ? 'bg-message-sent rounded-br-sm shadow-[0_4px_15px_rgba(124,58,237,0.15)]'
                    : 'bg-message-received rounded-bl-sm border border-border-subtle',
                  isSelected && 'ring-2 ring-accent-primary ring-offset-2 ring-offset-bg-primary'
                )}>
                  {conversation?.isGroup && !isMine && senderName && (
                    <p className="text-xs text-accent-primary font-medium mb-1">{senderName}</p>
                  )}

                  {msg.isOneTime && !revealedMessages.has(msg._id) ? (
                    <div
                      className="flex items-center gap-3 cursor-pointer group"
                      onClick={(e) => { if (!selectMode) { e.stopPropagation(); handleReveal(msg._id); } }}
                    >
                      <div className="w-8 h-8 rounded-full bg-accent-amber/20 flex items-center justify-center">
                        <Flame className="w-4 h-4 text-accent-amber" />
                      </div>
                      <div className="font-medium text-accent-primary group-hover:text-accent-glow transition-colors">
                        View One-time Message
                      </div>
                    </div>
                  ) : (
                    msg.content
                  )}

                  <div className={cn('text-[10px] mt-1', isMine ? 'text-right text-white/50' : 'text-right text-text-muted')}>
                    {time}
                    {msg.editedAt && ' (edited)'}
                  </div>
                </div>

                {/* Checkbox (select mode, right side for own messages) */}
                {selectMode && isMine && <SelectCheckbox selected={isSelected} />}
              </motion.div>
            );
          })
        )}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex self-start">
            <div className="bg-message-received px-4 py-3 rounded-2xl rounded-bl-sm border border-border-subtle flex gap-1 items-center h-10 w-16">
              <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0 }} className="w-1.5 h-1.5 bg-text-muted rounded-full" />
              <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }} className="w-1.5 h-1.5 bg-text-muted rounded-full" />
              <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }} className="w-1.5 h-1.5 bg-text-muted rounded-full" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── Input / Action Bar (bottom) ─────────────────── */}
      <AnimatePresence mode="wait">
        {selectMode ? (
          /* ── Bulk Action Bar ── */
          <motion.div
            key="action-bar"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="p-4 px-6 bg-bg-elevated/90 backdrop-blur-xl border-t border-border-subtle sticky bottom-0 z-10"
          >
            <div className="flex items-center gap-3">
              {/* Delete selected */}
              <button
                onClick={handleBulkDelete}
                disabled={deletableCount === 0 || selectedIds.size === 0}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all',
                  deletableCount > 0 && selectedIds.size > 0
                    ? 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25'
                    : 'bg-bg-secondary text-text-muted border border-border-subtle opacity-50 cursor-not-allowed'
                )}
              >
                <Trash2 className="w-4 h-4" />
                Delete
                {deletableCount > 0 && selectedIds.size > 0 && (
                  <span className="ml-1 bg-danger/20 text-danger text-xs px-1.5 py-0.5 rounded-full font-semibold">
                    {deletableCount}
                  </span>
                )}
              </button>

              {/* Summarize selected */}
              <button
                onClick={handleBulkSummarize}
                disabled={summarizableCount === 0 || selectedIds.size === 0}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all',
                  summarizableCount > 0 && selectedIds.size > 0
                    ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30 hover:bg-accent-primary/25'
                    : 'bg-bg-secondary text-text-muted border border-border-subtle opacity-50 cursor-not-allowed'
                )}
              >
                <Sparkles className="w-4 h-4" />
                Summarize
                {summarizableCount > 0 && selectedIds.size > 0 && (
                  <span className="ml-1 bg-accent-primary/20 text-accent-primary text-xs px-1.5 py-0.5 rounded-full font-semibold">
                    {summarizableCount}
                  </span>
                )}
              </button>

              {/* Cancel */}
              <button
                onClick={exitSelectMode}
                className="w-10 h-10 rounded-xl bg-bg-secondary border border-border-subtle flex items-center justify-center text-text-muted hover:text-text-primary hover:border-border-default transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {deletableCount < selectedIds.size && selectedIds.size > 0 && (
              <p className="text-xs text-text-muted text-center mt-2">
                You can only delete your own messages ({deletableCount} of {selectedIds.size} selected)
              </p>
            )}
          </motion.div>
        ) : (
          /* ── Normal Input Bar ── */
          <motion.div
            key="input-bar"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="p-4 bg-bg-primary border-t border-border-subtle px-6 sticky bottom-0 z-10"
          >

            <div className={cn(
              'flex items-center gap-2 p-2 rounded-full border bg-bg-secondary transition-all',
              isOneTime
                ? 'border-accent-amber/50 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                : 'border-border-subtle focus-within:border-accent-primary focus-within:ring-1 focus-within:ring-accent-primary'
            )}>
              <Button variant="ghost" size="icon" className="rounded-full shrink-0 text-text-muted hover:text-text-primary">
                <Smile className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full shrink-0 text-text-muted hover:text-text-primary hidden sm:flex">
                <Paperclip className="w-5 h-5" />
              </Button>
              <input
                type="text"
                className="flex-1 bg-transparent border-none focus:outline-none text-sm px-2 placeholder:text-text-muted text-text-primary min-w-0"
                placeholder={isOneTime ? 'Type one-time message...' : `Message ${convName}...`}
                value={messageText}
                onChange={handleMessageChange}
                onKeyDown={handleKeyDown}
              />
              <Button
                variant="ghost"
                size="icon"
                className={cn('rounded-full shrink-0 transition-colors', isOneTime ? 'text-accent-amber bg-accent-amber/10' : 'text-text-muted hover:text-text-primary')}
                onClick={() => setIsOneTime(!isOneTime)}
                title="Toggle One-Time Message"
              >
                {isOneTime ? <Flame className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
              </Button>
              <Button
                size="icon"
                className={cn('rounded-full shrink-0', messageText.trim() ? 'bg-accent-primary text-white' : 'bg-bg-elevated text-text-muted cursor-not-allowed')}
                onClick={handleSend}
                disabled={!messageText.trim() || sending}
              >
                <Send className="w-[18px] h-[18px] ml-0.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── AI Summary Modal ─────────────────────────────── */}
      <AnimatePresence>
        {summaryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setSummaryModal(null); }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 24 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="relative w-full max-w-md bg-bg-elevated/95 backdrop-blur-xl border border-border-subtle rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Gradient accent bar */}
              <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-purple-400 to-fuchsia-500" />

              <div className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-accent-primary/20 flex items-center justify-center">
                      <Sparkles className="w-4.5 h-4.5 text-accent-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary">AI Summary</h3>
                      <p className="text-xs text-text-muted">
                        {summaryModal.count} message{summaryModal.count !== 1 ? 's' : ''} · Powered by NexTalk AI
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSummaryModal(null)}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Content */}
                {summaryModal.loading ? (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-full bg-accent-primary/10 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-accent-primary animate-spin" />
                      </div>
                      <div className="absolute inset-0 rounded-full border-2 border-accent-primary/20 animate-ping" />
                    </div>
                    <p className="text-sm text-text-muted">Analysing {summaryModal.count} messages…</p>
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-accent-primary/5 border border-accent-primary/20 rounded-xl text-sm text-text-primary leading-relaxed"
                  >
                    {summaryModal.text}
                  </motion.div>
                )}

                {!summaryModal.loading && (
                  <button
                    onClick={() => setSummaryModal(null)}
                    className="mt-4 w-full py-2.5 rounded-xl text-sm font-medium bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors"
                  >
                    Done
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Helper: checkbox indicator ───────────────────────────
function SelectCheckbox({ selected }: { selected: boolean }) {
  return (
    <div className={cn(
      'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-150',
      selected
        ? 'bg-accent-primary border-accent-primary shadow-[0_0_8px_rgba(124,58,237,0.4)]'
        : 'border-border-subtle bg-bg-secondary'
    )}>
      {selected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-2 h-2 rounded-full bg-white"
        />
      )}
    </div>
  );
}
