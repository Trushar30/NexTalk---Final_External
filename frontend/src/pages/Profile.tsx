import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Settings, UserPlus, MessageSquare, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';
import { usersApi, conversationsApi } from '@/lib/api';
import type { UserProfile } from '@/lib/api';

export default function ProfileScreen() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user: authUser } = useAuthStore();
  const { setActiveConversation } = useStore();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const isOwnProfile = !username || username === 'me' || username === authUser?.username;

  useEffect(() => {
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
      navigate('/messages');
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-text-muted">User not found</p>
        </div>
      </AppLayout>
    );
  }

  const mood = (profile.currentMood?.toLowerCase() || 'neutral') as 'calm' | 'happy' | 'focused' | 'stressed' | 'excited' | 'neutral';

  return (
    <AppLayout>
      <div className="p-8 max-w-3xl mx-auto space-y-8">
        {/* Profile Header */}
        <Card glass className="p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-accent-primary/20 to-transparent" />
          <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-6 pt-4">
            <Avatar 
              src={profile.avatarUrl} 
              alt={profile.displayName} 
              size="xl" 
              mood={mood} 
              showMood 
            />
            <div className="flex-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-3 mb-1">
                <h1 className="text-2xl font-bold">{profile.displayName}</h1>
                <Badge mood={mood} />
              </div>
              <p className="text-text-secondary font-mono text-sm">@{profile.username}</p>
              {profile.bio && <p className="text-text-secondary text-sm mt-2 max-w-md">{profile.bio}</p>}
            </div>
            <div className="flex gap-2">
              {isOwnProfile ? (
                <Button variant="outline" className="gap-2" onClick={() => navigate('/settings')}>
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
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card glass className="p-6 text-center">
            <p className="text-2xl font-bold text-accent-primary">-</p>
            <p className="text-sm text-text-secondary mt-1">Connections</p>
          </Card>
          <Card glass className="p-6 text-center">
            <p className="text-2xl font-bold text-accent-primary">
              {profile.isOnline ? '🟢' : '⚫'}
            </p>
            <p className="text-sm text-text-secondary mt-1">
              {profile.isOnline ? 'Online' : 'Offline'}
            </p>
          </Card>
          <Card glass className="p-6 text-center">
            <p className="text-2xl font-bold text-accent-primary">
              {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </p>
            <p className="text-sm text-text-secondary mt-1">Joined</p>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
