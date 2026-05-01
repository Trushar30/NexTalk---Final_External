import { cn } from '@/lib/utils';
import { MoodRing } from './MoodRing';

interface AvatarProps {
  src?: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  mood?: 'calm' | 'happy' | 'focused' | 'stressed' | 'excited' | 'neutral';
  className?: string;
  showMood?: boolean;
  children?: React.ReactNode;
}

export function Avatar({ 
  src, 
  alt = 'User avatar', 
  size = 'md', 
  mood, 
  className,
  showMood = false,
  children
}: AvatarProps) {
  const sizeMap = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-24 h-24',
    xl: 'w-32 h-32',
  };

  const avatarElement = (
    <div className={cn(
      'relative rounded-full overflow-hidden bg-bg-tertiary flex items-center justify-center border border-border-subtle',
      sizeMap[size],
      className
    )}>
      {src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : children ? (
        children
      ) : (
        <div className="w-full h-full flex items-center justify-center text-text-muted">
          <span className="text-xl font-bold">{alt.charAt(0).toUpperCase()}</span>
        </div>
      )}
    </div>
  );

  if (showMood && mood) {
    return (
      <div className="relative inline-flex items-center justify-center">
        <MoodRing mood={mood} size={size} />
        <div className="absolute inset-0 flex items-center justify-center">
           {avatarElement}
        </div>
      </div>
    );
  }

  return avatarElement;
}
