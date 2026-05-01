import { useState } from 'react';
import { X, Hash, Loader2, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { teamsApi } from '@/lib/api';
import type { TeamChannel } from '@/lib/api';

interface CreateChannelModalProps {
  teamId: string;
  onClose: () => void;
  onCreated: (channel: TeamChannel) => void;
}

export function CreateChannelModal({ teamId, onClose, onCreated }: CreateChannelModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const channel = await teamsApi.createChannel(teamId, {
        name: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        description: description || undefined,
      });
      onCreated(channel);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to create channel');
    } finally {
      setLoading(false);
    }
  };

  const cleanName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

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
        >
          <Card glass className="p-8 w-full max-w-md space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-accent-primary/20 flex items-center justify-center">
                  <Hash className="w-5 h-5 text-accent-primary" />
                </div>
                <h2 className="text-xl font-bold">Create Channel</h2>
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

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Channel Name</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">#</span>
                  <input
                    type="text"
                    className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-border-subtle bg-bg-elevated text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:border-accent-primary transition-colors"
                    placeholder="e.g. announcements"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                {name && (
                  <p className="text-xs text-text-muted pl-1">Preview: <span className="text-accent-primary font-mono">#{cleanName}</span></p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Description <span className="text-text-muted font-normal">(optional)</span></label>
                <textarea
                  className="w-full h-16 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:border-accent-primary resize-none transition-colors"
                  placeholder="What's this channel about?"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Creating...
                  </span>
                ) : 'Create Channel'}
              </Button>
            </form>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
