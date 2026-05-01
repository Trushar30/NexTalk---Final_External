import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/Card';
import { Users, UserPlus, Check, X, Loader2, Clock, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { connectionsApi, usersApi, conversationsApi } from '@/lib/api';
import type { ConnectionRequest } from '@/lib/api';

export default function RequestsScreen() {
  const [tab, setTab] = useState<'incoming' | 'sent' | 'connections'>('incoming');
  const [incoming, setIncoming] = useState<ConnectionRequest[]>([]);
  const [sent, setSent] = useState<ConnectionRequest[]>([]);
  const [connections, setConnections] = useState<ConnectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { setActiveConversation } = useStore();

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const [inc, sn, conns] = await Promise.all([
        connectionsApi.getIncoming(),
        connectionsApi.getSent(),
        usersApi.getConnections(),
      ]);
      setIncoming(inc);
      setSent(sn);
      setConnections(conns);
    } catch (err) {
      console.error('Failed to load requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      await connectionsApi.accept(requestId);
      setIncoming(prev => prev.filter(r => r._id !== requestId));
    } catch (err) {
      console.error('Accept failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      await connectionsApi.decline(requestId);
      setIncoming(prev => prev.filter(r => r._id !== requestId));
    } catch (err) {
      console.error('Decline failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleMessageUser = async (userId: string) => {
    try {
      const conv = await conversationsApi.create({ userId });
      setActiveConversation(conv._id);
      navigate('/messages');
    } catch (err) {
      console.error('Failed to start chat:', err);
    }
  };

  const currentList = tab === 'incoming' ? incoming : tab === 'sent' ? sent : connections;

  return (
    <AppLayout>
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-heading mb-2">Requests</h1>
            <p className="text-text-secondary">Manage your connection requests.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border-subtle pb-1">
          <button
            onClick={() => setTab('incoming')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === 'incoming' ? 'text-accent-primary border-b-2 border-accent-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <Users className="w-4 h-4 inline mr-2" />
            Incoming ({incoming.length})
          </button>
          <button
            onClick={() => setTab('sent')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === 'sent' ? 'text-accent-primary border-b-2 border-accent-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <Clock className="w-4 h-4 inline mr-2" />
            Sent ({sent.length})
          </button>
          <button
            onClick={() => setTab('connections')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === 'connections' ? 'text-accent-primary border-b-2 border-accent-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <Users className="w-4 h-4 inline mr-2" />
            Connections ({connections.length})
          </button>
        </div>

        <div className="space-y-4 pt-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 text-accent-primary animate-spin" />
            </div>
          ) : currentList.length === 0 ? (
            <Card glass className="p-12 flex flex-col items-center justify-center text-center border-dashed">
              <div className="w-16 h-16 bg-bg-secondary rounded-full flex items-center justify-center mb-4">
                {tab === 'incoming' ? <Users className="w-8 h-8 text-text-muted" /> : tab === 'sent' ? <UserPlus className="w-8 h-8 text-text-muted" /> : <Users className="w-8 h-8 text-text-muted" />}
              </div>
              <p className="text-text-primary font-medium mb-1">
                {tab === 'incoming' ? 'No pending requests' : tab === 'sent' ? 'No sent requests' : 'No connections yet'}
              </p>
              <p className="text-text-muted text-sm max-w-[250px]">
                {tab === 'incoming' ? "When someone asks to connect, it'll show up here." : tab === 'sent' ? "Connection requests you've sent will appear here." : "Connect with others to start chatting."}
              </p>
            </Card>
          ) : (
            currentList.map(req => {
              let person = tab === 'incoming' ? req.requesterId : req.recipientId;
              if (tab === 'connections') {
                const reqId = typeof req.requesterId === 'string' ? req.requesterId : (req.requesterId as any)?._id;
                person = reqId === user?.id ? req.recipientId : req.requesterId;
              }
              const personProfile = typeof person === 'string' ? null : person as any;

              return (
                <Card key={req._id} glass className="p-4 flex items-center gap-4">
                  <Avatar 
                    src={personProfile?.avatarUrl} 
                    alt={personProfile?.displayName || 'User'} 
                    size="md" 
                    mood={(personProfile?.currentMood?.toLowerCase() || 'neutral') as any} 
                    showMood 
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{personProfile?.displayName || 'Unknown User'}</h3>
                    <p className="text-sm text-text-secondary font-mono">@{personProfile?.username || 'unknown'}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {tab === 'incoming' ? (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="gap-1"
                        onClick={() => handleAccept(req._id)}
                        disabled={actionLoading === req._id}
                      >
                        {actionLoading === req._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Accept
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => handleDecline(req._id)}
                        disabled={actionLoading === req._id}
                      >
                        <X className="w-4 h-4" />
                        Decline
                      </Button>
                    </div>
                  ) : tab === 'sent' ? (
                    <span className="text-xs font-medium text-accent-amber bg-accent-amber/10 px-2 py-1 rounded-md border border-accent-amber/30">
                      Pending
                    </span>
                  ) : (
                    <Button 
                      size="sm" 
                      onClick={() => personProfile?._id && handleMessageUser(personProfile._id)}
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Message
                    </Button>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </div>
    </AppLayout>
  );
}
