import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/Card';
import { Search, UserPlus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { usersApi, connectionsApi } from '@/lib/api';
import type { UserProfile } from '@/lib/api';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingRequest, setSendingRequest] = useState<string | null>(null);

  const searchUsers = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const users = await usersApi.search(q);
      setResults(users);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchUsers(query), 400);
    return () => clearTimeout(timer);
  }, [query, searchUsers]);

  const handleConnect = async (userId: string) => {
    setSendingRequest(userId);
    try {
      await connectionsApi.sendRequest(userId);
    } catch (err) {
      console.error('Failed to send connection request:', err);
    } finally {
      setSendingRequest(null);
    }
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold font-heading mb-2">Search</h1>
          <p className="text-text-secondary">Find friends, messages, and teams across NexTalk.</p>
        </div>
        
        <Input 
          type="text" 
          placeholder="Search users by name or username..." 
          icon={<Search className="w-5 h-5" />} 
          className="h-14 text-lg bg-bg-secondary"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="space-y-3 pt-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 text-accent-primary animate-spin" />
            </div>
          ) : results.length > 0 ? (
            results.map(u => (
              <Card key={u._id} glass className="p-4 flex items-center gap-4 hover:border-accent-primary/50 transition-colors">
                <Avatar 
                  src={u.avatarUrl} 
                  alt={u.displayName} 
                  size="md" 
                  mood={(u.currentMood?.toLowerCase() || 'neutral') as any} 
                  showMood 
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{u.displayName}</h3>
                  <p className="text-sm text-text-secondary font-mono">@{u.username}</p>
                  {u.bio && <p className="text-xs text-text-muted mt-1 line-clamp-1">{u.bio}</p>}
                </div>
                <Button 
                  size="sm" 
                  className="gap-1.5 shrink-0" 
                  onClick={() => handleConnect(u._id)}
                  disabled={sendingRequest === u._id}
                >
                  {sendingRequest === u._id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Connect
                    </>
                  )}
                </Button>
              </Card>
            ))
          ) : query.length >= 2 ? (
            <Card glass className="p-12 flex flex-col items-center justify-center text-center border-dashed">
              <Search className="w-8 h-8 text-text-muted mb-4" />
              <p className="text-text-muted font-medium">No users found for "{query}"</p>
            </Card>
          ) : (
            <Card glass className="p-6 flex flex-col items-center justify-center text-center h-48 border-dashed">
              <Search className="w-8 h-8 text-text-muted mb-4" />
              <p className="text-text-muted font-medium">Type at least 2 characters to search</p>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
