import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Hash, Plus, Users, ArrowLeft, Send, Smile,
  Loader2, Lock, Flame, ShieldAlert, Trash2,
  UserPlus, ChevronRight, MoreVertical, LogOut,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { teamsApi, conversationsApi } from '@/lib/api';
import type { Team, TeamChannel, Message, UserProfile } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { onSocketEvent, emitSocketEvent } from '@/lib/socket';
import { decryptMessage } from '@/lib/crypto';
import { CreateChannelModal } from './CreateChannelModal';
import { InviteMemberModal } from './InviteMemberModal';
import { MemberCard } from './MemberCard';

interface TeamDetailViewProps {
  team: Team;
  onBack: () => void;
  onTeamDeleted: () => void;
  onTeamLeft: () => void;
}

export function TeamDetailView({ team: initialTeam, onBack, onTeamDeleted, onTeamLeft }: TeamDetailViewProps) {
  const { user } = useAuthStore();
  const [team, setTeam] = useState<Team>(initialTeam);
  const [channels, setChannels] = useState<TeamChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<TeamChannel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [isOneTime, setIsOneTime] = useState(false);
  const [revealedMessages, setRevealedMessages] = useState<Set<string>>(new Set());
  const [showMembers, setShowMembers] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showTeamMenu, setShowTeamMenu] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const teamMenuRef = useRef<HTMLDivElement>(null);

  const myMembership = team.members.find(m => {
    const uid = typeof m.userId === 'string' ? m.userId : (m.userId as UserProfile)?._id;
    return uid === user?.id;
  });
  const myRole = myMembership?.role || 'MEMBER';
  const isOwner = myRole === 'OWNER';
  const isAdmin = myRole === 'ADMIN' || isOwner;

  // Outside click for team menu
  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (teamMenuRef.current && !teamMenuRef.current.contains(e.target as Node)) {
        setShowTeamMenu(false);
      }
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load channels
  useEffect(() => {
    setLoadingChannels(true);
    teamsApi.getChannels(team._id)
      .then(chs => {
        setChannels(chs);
        if (chs.length > 0) setActiveChannel(chs[0]);
      })
      .catch(console.error)
      .finally(() => setLoadingChannels(false));
  }, [team._id]);

  // Load messages when active channel changes
  useEffect(() => {
    if (!activeChannel?.conversationId) return;
    const convId = activeChannel.conversationId;
    setLoadingMessages(true);
    setMessages([]);

    conversationsApi.getMessages(convId)
      .then(res => {
        setMessages([...(res.data || [])].reverse());
        setLoadingMessages(false);
        setTimeout(scrollToBottom, 100);
      })
      .catch(err => {
        console.error('Failed to load channel messages:', err);
        setLoadingMessages(false);
      });

    emitSocketEvent('join:conversation', { conversationId: convId });
    return () => { emitSocketEvent('leave:conversation', { conversationId: convId }); };
  }, [activeChannel?.conversationId, scrollToBottom]);

  // Real-time messages
  useEffect(() => {
    if (!activeChannel?.conversationId) return;
    const convId = activeChannel.conversationId;
    const unsub = onSocketEvent<{ message: Message; conversationId: string }>('message:new', (data) => {
      if (data.conversationId === convId) {
        const decryptedMessage = {
          ...data.message,
          content: data.message.content ? decryptMessage(data.message.content) : data.message.content,
        };
        setMessages(prev => [...prev, decryptedMessage]);
        setTimeout(scrollToBottom, 100);
      }
    });
    return unsub;
  }, [activeChannel?.conversationId, scrollToBottom]);

  // Real-time deletions
  useEffect(() => {
    if (!activeChannel?.conversationId) return;
    const unsub = onSocketEvent<{ messageId: string }>('message:deleted', ({ messageId }) => {
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, isDeleted: true, content: undefined } : m));
    });
    return unsub;
  }, [activeChannel?.conversationId]);

  const handleSend = async () => {
    if (!messageText.trim() || !activeChannel?.conversationId || sending) return;
    const content = messageText.trim();
    setMessageText('');
    setSending(true);
    try {
      const msg = await conversationsApi.sendMessage(activeChannel.conversationId, { content, type: 'TEXT', isOneTime });
      setMessages(prev => [...prev, msg]);
      setTimeout(scrollToBottom, 100);
      if (isOneTime) setIsOneTime(false);
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessageText(content);
    } finally {
      setSending(false);
    }
  };

  const handleReveal = async (msgId: string) => {
    if (!activeChannel?.conversationId) return;
    try {
      await conversationsApi.markOneTimeViewed(activeChannel.conversationId, msgId);
      setRevealedMessages(prev => { const n = new Set(prev); n.add(msgId); return n; });
    } catch (err) { console.error('Failed to reveal:', err); }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await teamsApi.removeMember(team._id, userId);
      setTeam(prev => ({
        ...prev,
        members: prev.members.filter(m => {
          const uid = typeof m.userId === 'string' ? m.userId : (m.userId as UserProfile)?._id;
          return uid !== userId;
        }),
      }));
    } catch (err: any) {
      console.error('Remove member failed:', err);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await teamsApi.updateMemberRole(team._id, userId, role);
      setTeam(prev => ({
        ...prev,
        members: prev.members.map(m => {
          const uid = typeof m.userId === 'string' ? m.userId : (m.userId as UserProfile)?._id;
          return uid === userId ? { ...m, role } : m;
        }),
      }));
    } catch (err: any) {
      console.error('Role change failed:', err);
    }
  };

  const handleDeleteTeam = async () => {
    setActionLoading(true);
    try {
      await teamsApi.delete(team._id);
      onTeamDeleted();
    } catch (err: any) {
      console.error('Delete team failed:', err);
    } finally {
      setActionLoading(false);
      setConfirmDelete(false);
    }
  };

  const handleLeaveTeam = async () => {
    setActionLoading(true);
    try {
      await teamsApi.leave(team._id);
      onTeamLeft();
    } catch (err: any) {
      console.error('Leave team failed:', err);
    } finally {
      setActionLoading(false);
      setConfirmLeave(false);
    }
  };

  const memberIds = team.members.map(m => {
    const uid = typeof m.userId === 'string' ? m.userId : (m.userId as UserProfile)?._id;
    return uid;
  }).filter(Boolean) as string[];

  return (
    <div className="flex-1 flex h-screen overflow-hidden">
      {/* ── Channel Sidebar ── */}
      <aside className="w-64 flex-shrink-0 bg-bg-secondary border-r border-border-subtle flex flex-col">
        {/* Team Header */}
        <div className="p-4 border-b border-border-subtle">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-text-muted hover:text-text-primary text-xs mb-4 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Teams
          </button>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 shrink-0 bg-accent-primary/20 rounded-xl flex items-center justify-center border border-accent-primary/30">
                <Hash className="w-5 h-5 text-accent-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-text-primary text-sm truncate">{team.name}</h2>
                <p className="text-xs text-text-muted font-mono">#{team.tag}</p>
              </div>
            </div>

            {/* Team menu */}
            <div className="relative shrink-0" ref={teamMenuRef}>
              <Button variant="ghost" size="icon" className="w-7 h-7 rounded-lg" onClick={() => setShowTeamMenu(v => !v)}>
                <MoreVertical className="w-4 h-4 text-text-muted" />
              </Button>
              <AnimatePresence>
                {showTeamMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute right-0 top-full mt-1 w-48 bg-bg-elevated border border-border-subtle rounded-xl shadow-2xl overflow-hidden z-50"
                  >
                    {isOwner && (
                      <button
                        onClick={() => { setConfirmDelete(true); setShowTeamMenu(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-danger hover:bg-danger/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete Team
                      </button>
                    )}
                    {!isOwner && (
                      <button
                        onClick={() => { setConfirmLeave(true); setShowTeamMenu(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-danger hover:bg-danger/10 transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" /> Leave Team
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {team.description && (
            <p className="text-xs text-text-muted mt-3 leading-relaxed line-clamp-2">{team.description}</p>
          )}
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-0.5 no-scrollbar">
          <div className="flex items-center justify-between px-2 py-1.5 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Channels</span>
            {isAdmin && (
              <button
                onClick={() => setShowCreateChannel(true)}
                className="w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-accent-primary hover:bg-accent-primary/10 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {loadingChannels ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 text-text-muted animate-spin" />
            </div>
          ) : channels.length === 0 ? (
            <p className="text-xs text-text-muted px-2 py-2">No channels yet</p>
          ) : (
            channels.map(ch => (
              <button
                key={ch._id}
                onClick={() => setActiveChannel(ch)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left',
                  activeChannel?._id === ch._id
                    ? 'bg-accent-primary/15 text-accent-primary font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
                )}
              >
                <Hash className="w-4 h-4 shrink-0" />
                <span className="truncate">{ch.name}</span>
              </button>
            ))
          )}
        </div>

        {/* Members button */}
        <div className="p-3 border-t border-border-subtle">
          <button
            onClick={() => setShowMembers(v => !v)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
              showMembers ? 'bg-bg-elevated text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
            )}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>{team.members.length} Member{team.members.length !== 1 ? 's' : ''}</span>
            <ChevronRight className={cn('w-4 h-4 ml-auto transition-transform', showMembers && 'rotate-90')} />
          </button>
        </div>
      </aside>

      {/* ── Members Panel ── */}
      <AnimatePresence>
        {showMembers && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="flex-shrink-0 bg-bg-elevated border-r border-border-subtle flex flex-col overflow-hidden"
          >
            <div className="p-4 border-b border-border-subtle flex items-center justify-between">
              <h3 className="font-bold text-sm">Members</h3>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 rounded-lg"
                  onClick={() => setShowInvite(true)}
                  title="Invite member"
                >
                  <UserPlus className="w-4 h-4 text-text-muted" />
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 no-scrollbar">
              {team.members.map(m => {
                const memberUser = m.userId as UserProfile;
                const memberId = typeof m.userId === 'string' ? m.userId : memberUser?._id;
                return (
                  <MemberCard
                    key={memberId}
                    member={m as any}
                    isCurrentUser={memberId === user?.id}
                    canManage={isAdmin}
                    isOwner={isOwner}
                    onRemove={handleRemoveMember}
                    onRoleChange={handleRoleChange}
                  />
                );
              })}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Channel Chat ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!activeChannel ? (
          <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
            <div className="text-center space-y-3">
              <Hash className="w-12 h-12 mx-auto text-text-muted/30" />
              <p>Select a channel to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            {/* Channel header */}
            <header className="h-16 border-b border-border-subtle bg-bg-primary/50 backdrop-blur-md flex items-center px-6 gap-3 sticky top-0 z-10">
              <Hash className="w-5 h-5 text-text-muted" />
              <div>
                <h3 className="font-bold text-sm">{activeChannel.name}</h3>
                {activeChannel.description && (
                  <p className="text-xs text-text-muted">{activeChannel.description}</p>
                )}
              </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-2 flex flex-col no-scrollbar">
              {loadingMessages ? (
                <div className="flex items-center justify-center flex-1">
                  <div className="w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center">
                    <Hash className="w-7 h-7 text-accent-primary/50" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">Welcome to #{activeChannel.name}!</p>
                    <p className="text-xs text-text-muted mt-1">This is the beginning of the channel.</p>
                  </div>
                </div>
              ) : (
                messages.map(msg => {
                  const senderId = typeof msg.senderId === 'string' ? msg.senderId : (msg.senderId as UserProfile)?._id;
                  const isMine = senderId === user?.id;
                  const senderProfile = typeof msg.senderId !== 'string' ? msg.senderId as UserProfile : null;
                  const senderName = senderProfile?.displayName || 'User';
                  const senderAvatar = senderProfile?.avatarUrl;
                  const senderMood = (senderProfile?.currentMood?.toLowerCase() || 'neutral') as any;
                  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  if (msg.isDeleted) {
                    return (
                      <div key={msg._id} className={cn('flex', isMine ? 'self-end' : 'self-start')}>
                        <div className="p-3 rounded-2xl text-sm italic text-text-muted bg-bg-secondary border border-border-subtle">
                          Message deleted
                        </div>
                      </div>
                    );
                  }

                  if (msg.isToxic) {
                    return (
                      <motion.div
                        key={msg._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex self-start max-w-[70%] gap-2 items-center"
                      >
                        <div className="p-4 rounded-2xl rounded-bl-sm border border-danger/50 bg-danger/10 text-sm">
                          <div className="flex items-center gap-2 mb-2 text-danger font-medium border-b border-danger/20 pb-2">
                            <ShieldAlert className="w-4 h-4" />
                            <span>⚠️ Flagged content</span>
                          </div>
                          <div className="blur-sm hover:blur-none transition-all cursor-pointer select-none">{msg.content}</div>
                        </div>
                      </motion.div>
                    );
                  }

                  return (
                    <motion.div
                      key={msg._id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn('flex max-w-[75%] gap-3 items-end', isMine ? 'self-end flex-row-reverse' : 'self-start')}
                    >
                      {!isMine && (
                        <Avatar src={senderAvatar} alt={senderName} size="sm" mood={senderMood} showMood />
                      )}
                      <div className={cn(
                        'relative p-4 rounded-2xl text-sm',
                        isMine
                          ? 'bg-message-sent rounded-br-sm shadow-[0_4px_15px_rgba(124,58,237,0.15)]'
                          : 'bg-message-received rounded-bl-sm border border-border-subtle'
                      )}>
                        {!isMine && senderName && (
                          <p className="text-xs text-accent-primary font-medium mb-1">{senderName}</p>
                        )}
                        {msg.isOneTime && !revealedMessages.has(msg._id) ? (
                          <div
                            className="flex items-center gap-3 cursor-pointer group"
                            onClick={() => handleReveal(msg._id)}
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
                        <div className={cn('text-[10px] mt-1 text-right', isMine ? 'text-white/50' : 'text-text-muted')}>
                          {time}
                          {msg.editedAt && ' (edited)'}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div className="p-4 px-6 bg-bg-primary border-t border-border-subtle sticky bottom-0 z-10">
              <div className={cn(
                'flex items-center gap-2 p-2 rounded-full border bg-bg-secondary transition-all',
                isOneTime
                  ? 'border-accent-amber/50 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                  : 'border-border-subtle focus-within:border-accent-primary focus-within:ring-1 focus-within:ring-accent-primary'
              )}>
                <Button variant="ghost" size="icon" className="rounded-full shrink-0 text-text-muted hover:text-text-primary">
                  <Smile className="w-5 h-5" />
                </Button>
                <input
                  type="text"
                  className="flex-1 bg-transparent border-none focus:outline-none text-sm px-2 placeholder:text-text-muted text-text-primary min-w-0"
                  placeholder={isOneTime ? 'Type one-time message...' : `Message #${activeChannel.name}...`}
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
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
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-[18px] h-[18px] ml-0.5" />}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Modals ── */}
      {showCreateChannel && (
        <CreateChannelModal
          teamId={team._id}
          onClose={() => setShowCreateChannel(false)}
          onCreated={ch => {
            setChannels(prev => [...prev, ch]);
            setActiveChannel(ch);
            setShowCreateChannel(false);
          }}
        />
      )}

      {showInvite && (
        <InviteMemberModal
          teamId={team._id}
          existingMemberIds={memberIds}
          onClose={() => setShowInvite(false)}
          onInvited={(_invitedId, u) => {
            setTeam(prev => ({
              ...prev,
              members: [...prev.members, { userId: u as any, role: 'MEMBER', joinedAt: new Date().toISOString() }],
            }));
          }}
        />
      )}

      {/* Confirm Delete */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-bg-elevated border border-danger/30 rounded-2xl p-6 max-w-sm w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-danger/15 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-danger" />
                </div>
                <div>
                  <h3 className="font-bold text-text-primary">Delete Team</h3>
                  <p className="text-xs text-text-muted">This cannot be undone.</p>
                </div>
              </div>
              <p className="text-sm text-text-secondary">
                This will permanently delete <strong className="text-text-primary">{team.name}</strong>, all its channels, and all messages.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <button
                  onClick={handleDeleteTeam}
                  disabled={actionLoading}
                  className="flex-1 py-2 rounded-xl bg-danger text-white text-sm font-medium hover:bg-danger/80 transition-colors flex items-center justify-center gap-2"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete Team
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Leave */}
      <AnimatePresence>
        {confirmLeave && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-bg-elevated border border-border-subtle rounded-2xl p-6 max-w-sm w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-amber/15 flex items-center justify-center">
                  <LogOut className="w-5 h-5 text-accent-amber" />
                </div>
                <div>
                  <h3 className="font-bold text-text-primary">Leave Team</h3>
                  <p className="text-xs text-text-muted">You'll need to be invited back.</p>
                </div>
              </div>
              <p className="text-sm text-text-secondary">
                Are you sure you want to leave <strong className="text-text-primary">{team.name}</strong>?
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setConfirmLeave(false)}>Cancel</Button>
                <button
                  onClick={handleLeaveTeam}
                  disabled={actionLoading}
                  className="flex-1 py-2 rounded-xl bg-accent-amber text-white text-sm font-medium hover:bg-accent-amber/80 transition-colors flex items-center justify-center gap-2"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                  Leave Team
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
