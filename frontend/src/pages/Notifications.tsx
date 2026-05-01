import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Bell, Check, CheckCheck, Loader2, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { notificationsApi } from '@/lib/api';
import type { AppNotification } from '@/lib/api';
import { cn } from '@/lib/utils';
import { onSocketEvent } from '@/lib/socket';

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
    const unsub = onSocketEvent<{ notification: AppNotification }>('notification:new', (data) => {
      setNotifications(prev => [data.notification, ...prev]);
    });
    return unsub;
  }, []);

  const loadNotifications = async () => {
    try {
      const result = await notificationsApi.list();
      setNotifications(result.data || []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) { console.error(err); }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    try {
      await notificationsApi.remove(id);
      setNotifications(prev => prev.filter(n => n._id !== id));
    } catch (err) { console.error(err); }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const getIcon = (type: string) => {
    const map: Record<string, string> = { MESSAGE: '💬', REQUEST_RECEIVED: '👋', REQUEST_ACCEPTED: '🤝', REACTION: '❤️', TEAM_INVITE: '🏷️', SCREENSHOT_TAKEN: '📸', TOXIC_FLAGGED: '⚠️' };
    return map[type] || '🔔';
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-heading mb-2">Notifications</h1>
            <p className="text-text-secondary">Stay updated on what's happening.</p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" className="gap-2" onClick={handleMarkAllRead}>
              <CheckCheck className="w-4 h-4" /> Mark all read
            </Button>
          )}
        </div>

        <div className="space-y-3 pt-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-accent-primary animate-spin" /></div>
          ) : notifications.length === 0 ? (
            <Card glass className="p-12 flex flex-col items-center justify-center text-center border-dashed">
              <div className="w-16 h-16 bg-bg-secondary rounded-full flex items-center justify-center mb-4">
                <Bell className="w-8 h-8 text-text-muted" />
              </div>
              <p className="text-text-primary font-medium mb-1">You're all caught up!</p>
              <p className="text-text-muted text-sm">We'll let you know when there's new activity.</p>
            </Card>
          ) : (
            notifications.map(notif => (
              <Card key={notif._id} glass className={cn("p-4 flex items-start gap-4 group transition-colors", !notif.isRead && "border-accent-primary/30 bg-accent-primary/5")}>
                <div className="w-10 h-10 rounded-full bg-bg-secondary flex items-center justify-center text-lg shrink-0">{getIcon(notif.type)}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm">{notif.title}</h3>
                  <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{notif.body}</p>
                  <p className="text-xs text-text-muted mt-1">{new Date(notif.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!notif.isRead && <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={() => handleMarkRead(notif._id)}><Check className="w-4 h-4" /></Button>}
                  <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full text-danger" onClick={() => handleDelete(notif._id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
