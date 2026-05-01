import { Crown, Shield, User, Trash2, ChevronDown } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { useState, useRef, useEffect } from 'react';
import type { UserProfile } from '@/lib/api';

interface MemberCardProps {
  member: {
    userId: UserProfile;
    role: string;
    joinedAt: string;
  };
  isCurrentUser: boolean;
  canManage: boolean; // current user is OWNER or ADMIN
  isOwner: boolean;   // current user is OWNER
  onRemove: (userId: string) => void;
  onRoleChange: (userId: string, role: string) => void;
}

const roleConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  OWNER: { label: 'Owner', icon: <Crown className="w-3 h-3" />, color: 'text-accent-amber bg-accent-amber/15 border-accent-amber/30' },
  ADMIN: { label: 'Admin', icon: <Shield className="w-3 h-3" />, color: 'text-accent-primary bg-accent-primary/15 border-accent-primary/30' },
  MEMBER: { label: 'Member', icon: <User className="w-3 h-3" />, color: 'text-text-secondary bg-bg-secondary border-border-subtle' },
  GUEST: { label: 'Guest', icon: <User className="w-3 h-3" />, color: 'text-text-muted bg-bg-secondary border-border-subtle' },
};

export function MemberCard({ member, isCurrentUser, canManage, isOwner, onRemove, onRoleChange }: MemberCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const user = member.userId as UserProfile;
  const role = member.role;
  const cfg = roleConfig[role] || roleConfig.MEMBER;
  const mood = (user.currentMood?.toLowerCase() || 'neutral') as 'calm' | 'happy' | 'focused' | 'stressed' | 'excited' | 'neutral';

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const canActOn = canManage && !isCurrentUser && role !== 'OWNER';

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-bg-secondary/60 transition-colors group">
      <Avatar src={user.avatarUrl} alt={user.displayName} size="sm" mood={mood} showMood />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">
            {user.displayName}
            {isCurrentUser && <span className="text-text-muted ml-1">(you)</span>}
          </span>
        </div>
        <p className="text-xs text-text-muted truncate">@{user.username}</p>
      </div>

      {/* Role badge */}
      <div className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium shrink-0', cfg.color)}>
        {cfg.icon}
        <span>{cfg.label}</span>
      </div>

      {/* Actions menu (only for managers, non-owner targets) */}
      {canActOn && (
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setShowMenu(v => !v)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-elevated opacity-0 group-hover:opacity-100 transition-all"
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-bg-elevated border border-border-subtle rounded-xl shadow-2xl overflow-hidden z-50">
              {/* Role change options (owner only) */}
              {isOwner && role !== 'ADMIN' && (
                <button
                  onClick={() => { onRoleChange(user._id, 'ADMIN'); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-primary hover:bg-accent-primary/10 hover:text-accent-primary transition-colors"
                >
                  <Shield className="w-3.5 h-3.5" /> Promote to Admin
                </button>
              )}
              {isOwner && role === 'ADMIN' && (
                <button
                  onClick={() => { onRoleChange(user._id, 'MEMBER'); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-primary hover:bg-bg-secondary transition-colors"
                >
                  <User className="w-3.5 h-3.5" /> Demote to Member
                </button>
              )}
              <button
                onClick={() => { onRemove(user._id); setShowMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-danger hover:bg-danger/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove from team
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
