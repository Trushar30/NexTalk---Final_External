import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Phone, Video, Search, MoreVertical, Flame, Paperclip, Smile, Send,
  ShieldAlert, Lock, Trash2, Sparkles, X, Loader2, CheckSquare,
  CheckCheck, ArrowLeft, Dna, Brain, Zap, BarChart3, MessageCircle,
  TrendingUp, Activity,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { conversationsApi, aiApi } from '@/lib/api';
import type { Message, Conversation, UserProfile, CloneReplyResponse } from '@/lib/api';
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

  // ─── AI Cloner modal ────────────────────────────────────
  const [cloneModal, setCloneModal] = useState<{
    loading: boolean;
    data: CloneReplyResponse | null;
    inputMessage: string;
    error: string | null;
  } | null>(null);
  const [typedPrediction, setTypedPrediction] = useState('');
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const { activeConversationId, typingUsers, setActiveConversation } = useStore();

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

  // Real-time new messages (deduplicated by _id)
  useEffect(() => {
    if (!activeConversationId) return;
    const unsub = onSocketEvent<{ message: Message; conversationId: string }>('message:new', (data) => {
      if (data.conversationId === activeConversationId) {
        const decryptedMessage = {
          ...data.message,
          content: data.message.content ? decryptMessage(data.message.content) : data.message.content
        };
        setMessages(prev => {
          // Deduplicate: don't add if message already exists (e.g. sender's own message from REST response)
          if (prev.some(m => m._id === decryptedMessage._id)) return prev;
          return [...prev, decryptedMessage];
        });
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
      await conversationsApi.sendMessage(activeConversationId, { content, type: 'TEXT', isOneTime });
      // Don't add to messages here — the socket 'message:new' event will deliver it
      // This ensures both sender and receiver get the message via the same path
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

  // ─── AI Clone Handler ───────────────────────────────────
  const handleClonePredict = async () => {
    if (!messageText.trim() || !activeConversationId) return;
    const inputMsg = messageText.trim();

    // Clear any previous typing animation
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    setTypedPrediction('');
    setCloneModal({ loading: true, data: null, inputMessage: inputMsg, error: null });

    try {
      const result = await aiApi.cloneReply(activeConversationId, inputMsg);
      setCloneModal({ loading: false, data: result, inputMessage: inputMsg, error: null });

      // Typewriter animation for the prediction
      const text = result.prediction;
      let idx = 0;
      setTypedPrediction('');
      typingIntervalRef.current = setInterval(() => {
        idx++;
        setTypedPrediction(text.slice(0, idx));
        if (idx >= text.length) {
          if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;
        }
      }, 30);
    } catch (err) {
      console.error('AI Clone failed:', err);
      setCloneModal({
        loading: false,
        data: null,
        inputMessage: inputMsg,
        error: 'Could not generate prediction. AI service may be unavailable.',
      });
    }
  };

  const closeCloneModal = () => {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    setTypedPrediction('');
    setCloneModal(null);
  };

  // Cleanup typing interval on unmount
  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    };
  }, []);

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
      <div className="hidden md:flex flex-1 flex-col h-[100dvh] bg-bg-primary items-center justify-center">
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
    <div className={cn(
      "flex flex-col relative bg-bg-primary",
      // Desktop: Flex-1
      "md:flex-1 md:h-[100dvh] md:flex",
      // Mobile: Full width, hide if NO conversation active
      !activeConversationId ? "hidden" : "w-full flex-1 flex h-[100dvh]"
    )}>

      {/* ─── Chat Header ──────────────────────────────────── */}
      <header className="h-16 md:h-20 border-b border-border-subtle bg-bg-primary/50 backdrop-blur-md flex items-center justify-between px-4 md:px-6 z-10 sticky top-0">
        <div className="flex items-center gap-3 md:gap-4">
          {/* Mobile Back Button */}
          <button 
            onClick={() => setActiveConversation(null)} 
            className="md:hidden flex items-center justify-center w-10 h-10 -ml-2 rounded-full hover:bg-bg-secondary text-text-primary transition-colors focus:outline-none"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
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

        <div className="flex items-center gap-1 md:gap-2">
          <Button variant="ghost" size="icon" className="rounded-full hidden sm:flex"><Phone className="w-5 h-5 text-text-secondary" /></Button>
          <Button variant="ghost" size="icon" className="rounded-full hidden sm:flex"><Video className="w-5 h-5 text-text-secondary" /></Button>
          <Button variant="ghost" size="icon" className="rounded-full hidden sm:flex"><Search className="w-5 h-5 text-text-secondary" /></Button>

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
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2 flex flex-col no-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center flex-1 text-text-muted text-sm">
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
                  'relative p-3 md:p-4 rounded-2xl text-[13px] md:text-sm transition-all duration-150',
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
            className="p-3 md:p-4 px-4 md:px-6 bg-bg-elevated/90 backdrop-blur-xl border-t border-border-subtle sticky bottom-0 z-10"
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
            className="p-3 md:p-4 bg-bg-primary border-t border-border-subtle px-4 md:px-6 sticky bottom-0 z-10 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
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
              {/* 🧬 AI Cloner Button */}
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'rounded-full shrink-0 transition-all duration-300 relative group',
                  messageText.trim()
                    ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 hover:shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                    : 'text-text-muted opacity-40 cursor-not-allowed'
                )}
                onClick={handleClonePredict}
                disabled={!messageText.trim()}
                title="AI Clone — Predict their reply"
              >
                <Dna className="w-5 h-5" />
                {messageText.trim() && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
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

      {/* ─── AI Clone Prediction Modal ──────────────────────── */}
      <AnimatePresence>
        {cloneModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) closeCloneModal(); }}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="relative w-full max-w-lg bg-bg-elevated/95 backdrop-blur-2xl border border-emerald-500/20 rounded-3xl shadow-[0_0_60px_rgba(16,185,129,0.1)] overflow-hidden"
            >
              {/* Animated gradient accent bar */}
              <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-violet-500 animate-gradient-x" />

              {/* DNA Helix Background Pattern */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.03]">
                <div className="absolute inset-0" style={{
                  backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(16,185,129,0.3) 20px, rgba(16,185,129,0.3) 21px)`,
                  animation: 'dnaScroll 4s linear infinite',
                }} />
              </div>

              <div className="relative p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                      <Dna className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary flex items-center gap-2">
                        AI Clone
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-semibold uppercase tracking-wider">
                          Beta
                        </span>
                      </h3>
                      <p className="text-xs text-text-muted">
                        Predicting {otherUser?.displayName || 'their'} reply style
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={closeCloneModal}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Your message preview */}
                <div className="mb-4 p-3 bg-accent-primary/5 border border-accent-primary/15 rounded-xl">
                  <p className="text-[10px] uppercase tracking-wider text-accent-primary/60 font-semibold mb-1">Your message</p>
                  <p className="text-sm text-text-primary">{cloneModal.inputMessage}</p>
                </div>

                {/* Content */}
                {cloneModal.loading ? (
                  /* ── Neural Loading Animation ── */
                  <div className="flex flex-col items-center gap-4 py-10">
                    <div className="relative w-20 h-20">
                      {/* Outer ring */}
                      <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 animate-ping" />
                      {/* Middle ring */}
                      <div className="absolute inset-2 rounded-full border-2 border-cyan-400/30 animate-spin" style={{ animationDuration: '3s' }} />
                      {/* Inner core */}
                      <div className="absolute inset-4 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center">
                        <Brain className="w-6 h-6 text-emerald-400 animate-pulse" />
                      </div>
                      {/* Orbiting dots */}
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="absolute w-2 h-2 rounded-full bg-emerald-400"
                          animate={{
                            x: [0, 20 * Math.cos((i * 2.09) + 0), 0, -20 * Math.cos((i * 2.09) + 0), 0],
                            y: [0, 20 * Math.sin((i * 2.09) + 0), 0, -20 * Math.sin((i * 2.09) + 0), 0],
                            opacity: [0.3, 1, 0.3],
                          }}
                          transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                        />
                      ))}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-emerald-400">Analysing neural patterns…</p>
                      <p className="text-xs text-text-muted mt-1">Decoding communication DNA</p>
                    </div>
                  </div>
                ) : cloneModal.error ? (
                  /* ── Error State ── */
                  <div className="p-4 bg-danger/10 border border-danger/20 rounded-xl text-sm text-danger">
                    ⚠️ {cloneModal.error}
                  </div>
                ) : cloneModal.data ? (
                  /* ── Prediction Result ── */
                  <div className="space-y-4">
                    {/* Predicted reply bubble */}
                    <div className="relative">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <Avatar src={otherUser?.avatarUrl} alt={otherUser?.displayName || ''} size="sm" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-semibold text-emerald-400">{otherUser?.displayName || 'User'}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400/70 border border-emerald-500/15">AI Clone</span>
                          </div>
                          <div className="p-3.5 bg-message-received rounded-2xl rounded-tl-sm border border-border-subtle relative">
                            <p className="text-sm text-text-primary leading-relaxed">
                              {typedPrediction}
                              {typedPrediction.length < (cloneModal.data?.prediction?.length || 0) && (
                                <span className="inline-block w-0.5 h-4 bg-emerald-400 ml-0.5 animate-pulse" />
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Confidence meter */}
                    <div className="flex items-center gap-3 px-1">
                      <div className="flex items-center gap-1.5 text-xs text-text-muted">
                        <Activity className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Confidence</span>
                      </div>
                      <div className="flex-1 h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(cloneModal.data.confidence * 100)}%` }}
                          transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                        />
                      </div>
                      <span className="text-xs font-semibold text-emerald-400">{Math.round(cloneModal.data.confidence * 100)}%</span>
                    </div>

                    {/* Style Profile Grid */}
                    <div className="grid grid-cols-3 gap-2">
                      <StyleCard
                        icon={<MessageCircle className="w-3.5 h-3.5" />}
                        label="Avg Length"
                        value={`${cloneModal.data.style_profile.avg_length} words`}
                      />
                      <StyleCard
                        icon={<Smile className="w-3.5 h-3.5" />}
                        label="Emoji Use"
                        value={cloneModal.data.style_profile.emoji_frequency > 0.5 ? 'Frequent' : cloneModal.data.style_profile.emoji_frequency > 0.1 ? 'Sometimes' : 'Rare'}
                      />
                      <StyleCard
                        icon={<Zap className="w-3.5 h-3.5" />}
                        label="Mood"
                        value={cloneModal.data.style_profile.mood}
                      />
                      <StyleCard
                        icon={<TrendingUp className="w-3.5 h-3.5" />}
                        label="Vocabulary"
                        value={cloneModal.data.style_profile.vocabulary_level}
                      />
                      <StyleCard
                        icon={<BarChart3 className="w-3.5 h-3.5" />}
                        label="Slang"
                        value={cloneModal.data.style_profile.slang_level}
                      />
                      <StyleCard
                        icon={<Activity className="w-3.5 h-3.5" />}
                        label="Style"
                        value={cloneModal.data.style_profile.punctuation_style}
                      />
                    </div>

                    {/* Favorite Emojis */}
                    {cloneModal.data.style_profile.favorite_emojis.length > 0 && (
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-xs text-text-muted">Top emojis:</span>
                        <div className="flex gap-1">
                          {cloneModal.data.style_profile.favorite_emojis.map((e, i) => (
                            <span key={i} className="text-base bg-bg-secondary px-1.5 py-0.5 rounded-lg">{e}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Method & Disclaimer */}
                    <div className="pt-2 border-t border-border-subtle">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-text-muted">
                          🧬 AI prediction — not a real message
                        </p>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-bg-secondary text-text-muted border border-border-subtle">
                          {cloneModal.data.method === 'ai' ? '✨ AI Model' : '⚡ Template Engine'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Close Button */}
                {!cloneModal.loading && (
                  <button
                    onClick={closeCloneModal}
                    className="mt-4 w-full py-2.5 rounded-xl text-sm font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/15 transition-colors"
                  >
                    Got it
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

// ─── Helper: Style Profile Card ───────────────────────────
function StyleCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="p-2.5 bg-bg-secondary/50 border border-border-subtle rounded-xl text-center group hover:border-emerald-500/20 hover:bg-emerald-500/5 transition-all"
    >
      <div className="w-6 h-6 mx-auto mb-1 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <p className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-xs font-semibold text-text-primary capitalize">{value}</p>
    </motion.div>
  );
}
