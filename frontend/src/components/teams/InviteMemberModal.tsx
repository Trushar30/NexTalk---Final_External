import { useState } from 'react';
import { X, UserPlus, Search, Loader2, AlertCircle, Check } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { motion, AnimatePresence } from 'framer-motion';
import { teamsApi, usersApi } from '@/lib/api';
import type { UserProfile } from '@/lib/api';

interface InviteMemberModalProps {
  teamId: string;
  existingMemberIds: string[];
  onClose: () => void;
  onInvited: (userId: string, user: UserProfile) => void;
}

export function InviteMemberModal({ teamId, existingMemberIds, onClose, onInvited }: InviteMemberModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const handleSearch = async (val: string) => {
    setQuery(val);
    setError('');
    if (val.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const users = await usersApi.search(val.trim());
      setResults(users.filter(u => !existingMemberIds.includes(u._id)));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleInvite = async (user: UserProfile) => {
    setInviting(user._id);
    setError('');
    try {
      await teamsApi.invite(teamId, user._id);
      setInvited(prev => new Set([...prev, user._id]));
      onInvited(user._id, user);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to invite user');
    } finally {
      setInviting(null);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-md"
        >
          <Card glass className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-success/20 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-success" />
                </div>
                <h2 className="text-xl font-bold">Invite Member</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border-subtle bg-bg-elevated text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:border-accent-primary transition-colors"
                placeholder="Search by username or name..."
                value={query}
                onChange={e => handleSearch(e.target.value)}
                autoFocus
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted animate-spin" />
              )}
            </div>

            {/* Results */}
            <div className="space-y-2 max-h-64 overflow-y-auto no-scrollbar">
              {results.length === 0 && query.trim().length >= 2 && !searching && (
                <p className="text-sm text-text-muted text-center py-4">No users found</p>
              )}
              {query.trim().length < 2 && (
                <p className="text-xs text-text-muted text-center py-4">Type at least 2 characters to search</p>
              )}
              {results.map(user => {
                const isInvited = invited.has(user._id);
                const isInviting = inviting === user._id;
                const mood = (user.currentMood?.toLowerCase() || 'neutral') as any;
                return (
                  <div key={user._id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-bg-secondary/60 transition-colors">
                    <Avatar src={user.avatarUrl} alt={user.displayName} size="sm" mood={mood} showMood />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{user.displayName}</p>
                      <p className="text-xs text-text-muted">@{user.username}</p>
                    </div>
                    <button
                      onClick={() => !isInvited && handleInvite(user)}
                      disabled={isInvited || isInviting}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        isInvited
                          ? 'bg-success/15 text-success border border-success/30 cursor-default'
                          : 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30 hover:bg-accent-primary/25'
                      }`}
                    >
                      {isInviting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isInvited ? (
                        <><Check className="w-3.5 h-3.5" /> Invited</>
                      ) : (
                        <><UserPlus className="w-3.5 h-3.5" /> Invite</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
