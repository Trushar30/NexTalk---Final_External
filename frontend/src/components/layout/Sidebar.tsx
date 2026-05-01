import { NavLink } from 'react-router-dom';
import { MessageSquare, Search, Users, Hash, Bell, Settings } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';

export function Sidebar() {
  const { user } = useAuthStore();
  const { setViewingProfile } = useStore();
  const mood = (user?.currentMood?.toLowerCase() || 'calm') as 'calm' | 'happy' | 'focused' | 'stressed' | 'excited' | 'neutral';

  const navItems = [
    { icon: <MessageSquare className="w-6 h-6" />, path: '/messages', label: 'Messages' },
    { icon: <Search className="w-6 h-6" />, path: '/search', label: 'Search' },
    { icon: <Users className="w-6 h-6" />, path: '/requests', label: 'Requests' },
    { icon: <Hash className="w-6 h-6" />, path: '/teams', label: 'Teams' },
    { icon: <Bell className="w-6 h-6" />, path: '/notifications', label: 'Notifications' },
  ];

  return (
    <aside className="w-16 h-screen flex-shrink-0 bg-bg-secondary border-r border-border-subtle flex flex-col items-center py-6 z-20 hidden md:flex">
      {/* Brand */}
      <NavLink to="/" className="w-10 h-10 rounded-xl bg-accent-primary flex items-center justify-center mb-8 hover:bg-accent-glow transition-colors">
        <span className="text-white font-heading font-bold text-lg">N</span>
      </NavLink>

      {/* Nav Actions */}
      <nav className="flex-1 w-full flex flex-col items-center gap-6">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            title={item.label}
            className={({ isActive }) =>
              cn(
                "relative group flex items-center justify-center w-12 h-12 rounded-2xl transition-all",
                isActive ? "text-accent-glow bg-accent-primary/10" : "text-text-secondary hover:text-text-primary hover:bg-white/5"
              )
            }
          >
            {({ isActive }) => (
              <>
                {item.icon}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent-primary rounded-r-full" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Actions (Settings, Profile) */}
      <div className="flex flex-col items-center gap-6 mt-auto">
        <NavLink
            to="/settings"
            title="Settings"
            className={({ isActive }) =>
              cn(
                "group flex items-center justify-center w-12 h-12 rounded-2xl transition-all",
                isActive ? "text-accent-glow bg-accent-primary/10" : "text-text-secondary hover:text-text-primary hover:bg-white/5"
              )
            }
        >
          <Settings className="w-6 h-6 group-hover:rotate-45 transition-transform" />
        </NavLink>
        
        <button 
          title="Profile"
          onClick={() => setViewingProfile('me')}
          className="hover:scale-105 transition-transform focus:outline-none"
        >
          <Avatar 
            src={user?.avatarUrl} 
            alt={user?.displayName || 'Me'} 
            size="sm" 
            mood={mood} 
            showMood 
          />
        </button>
      </div>
    </aside>
  );
}
