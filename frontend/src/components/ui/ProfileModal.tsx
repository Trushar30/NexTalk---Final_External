import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Settings, UserPlus, MessageSquare, Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';
import { usersApi, conversationsApi } from '@/lib/api';
import type { UserProfile } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { FallingPattern } from '@/components/ui/falling-pattern';

export function ProfileModal() {
  const navigate = useNavigate();
  const { user: authUser } = useAuthStore();
  const { viewingProfile: username, setViewingProfile, setActiveConversation } = useStore();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const isOwnProfile = !username || username === 'me' || username === authUser?.username;

  useEffect(() => {
    if (!username) {
      setProfile(null);
      return;
    }
    loadProfile();
  }, [username]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      if (isOwnProfile) {
        const data = await usersApi.getMe();
        setProfile(data);
      } else if (username) {
        const data = await usersApi.getByUsername(username);
        setProfile(data);
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMessage = async () => {
    if (!profile) return;
    try {
      const conv = await conversationsApi.create({ userId: profile._id });
      setActiveConversation(conv._id);
      setViewingProfile(null);
      navigate('/messages');
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  const closeModal = () => setViewingProfile(null);

  if (!username) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pb-20">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeModal}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto z-10"
        >
          <div className="space-y-6">
            <Card glass className="p-8 relative overflow-hidden shadow-2xl border-white/10">
              <button 
                onClick={closeModal}
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/20 text-white/70 hover:bg-black/40 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="absolute top-0 left-0 right-0 h-32 overflow-hidden pointer-events-none rounded-t-xl">
                <div className="absolute inset-0 bg-gradient-to-b from-accent-primary/30 to-bg-primary/90 z-10" />
                <FallingPattern 
                  color="var(--accent-primary)" 
                  blurIntensity="0.2em" 
                  duration={40} 
                  className="opacity-40 scale-150 transform-gpu" 
                />
              </div>
              
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
                </div>
              ) : !profile ? (
                <div className="flex items-center justify-center h-48">
                  <p className="text-text-muted">User not found</p>
                </div>
              ) : (
                <>
                  <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-6 pt-6">
                    <Avatar 
                      src={profile.avatarUrl} 
                      alt={profile.displayName} 
                      size="xl" 
                      mood={(profile.currentMood?.toLowerCase() || 'neutral') as any} 
                      showMood 
                    />
                    <div className="flex-1 text-center sm:text-left">
                      <div className="flex items-center justify-center sm:justify-start gap-3 mb-1 mt-2 sm:mt-0">
                        <h2 className="text-2xl font-bold">{profile.displayName}</h2>
                        <Badge mood={(profile.currentMood?.toLowerCase() || 'neutral') as any} />
                      </div>
                      <p className="text-text-secondary font-mono text-sm">@{profile.username}</p>
                      {profile.bio && <p className="text-text-secondary text-sm mt-3 max-w-md">{profile.bio}</p>}
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto justify-center mt-4 sm:mt-0">
                      {isOwnProfile ? (
                        <Button 
                          variant="outline" 
                          className="gap-2" 
                          onClick={() => {
                            closeModal();
                            navigate('/settings');
                          }}
                        >
                          <Settings className="w-4 h-4" /> Edit Profile
                        </Button>
                      ) : (
                        <>
                          <Button className="gap-2" onClick={handleMessage}>
                            <MessageSquare className="w-4 h-4" /> Message
                          </Button>
                          <Button variant="outline" className="gap-2">
                            <UserPlus className="w-4 h-4" /> Connect
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 mt-8 pt-8 border-t border-border-subtle">
                    <div className="text-center group">
                      <p className="text-2xl font-bold text-accent-primary group-hover:scale-110 transition-transform">-</p>
                      <p className="text-xs text-text-secondary mt-1 uppercase tracking-wider font-semibold">Connections</p>
                    </div>
                    <div className="text-center group">
                      <p className="text-2xl font-bold text-accent-primary group-hover:scale-110 transition-transform">
                        {profile.isOnline ? '🟢' : '⚫'}
                      </p>
                      <p className="text-xs text-text-secondary mt-1 uppercase tracking-wider font-semibold">
                        {profile.isOnline ? 'Online' : 'Offline'}
                      </p>
                    </div>
                    <div className="text-center group">
                      <p className="text-xl font-bold text-accent-primary group-hover:scale-110 transition-transform">
                        {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-text-secondary mt-1 uppercase tracking-wider font-semibold">Joined</p>
                    </div>
                  </div>
                </>
              )}
            </Card>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
