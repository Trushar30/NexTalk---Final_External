import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export type Mood = 'calm' | 'happy' | 'focused' | 'stressed' | 'excited' | 'neutral';

interface MoodRingProps {
  mood: Mood;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  children?: React.ReactNode;
}

const moodColors: Record<Mood, string> = {
  calm: 'var(--mood-calm)',
  happy: 'var(--mood-happy)',
  focused: 'var(--mood-focused)',
  stressed: 'var(--mood-stressed)',
  excited: 'var(--mood-excited)',
  neutral: 'var(--mood-neutral)',
};

const sizes = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-24 w-24', 
  xl: 'h-32 w-32', 
};

export function MoodRing({ mood, avatarUrl, size = 'md', className, children }: MoodRingProps) {
  const color = moodColors[mood] || moodColors.neutral;

  return (
    <div className={cn('relative inline-flex items-center justify-center rounded-full', className)}>
      {/* The glowing aura behind the avatar */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          boxShadow: `0 0 0 2px ${color}, 0 0 16px 4px ${color}40`,
        }}
        animate={{
          scale: [1, 1.04, 1],
          opacity: [0.8, 1, 0.8],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      
      {/* The avatar itself */}
      <div 
        className={cn('relative z-10 overflow-hidden rounded-full bg-secondary border border-subtle flex items-center justify-center', sizes[size])}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
        ) : children ? (
          children
        ) : (
          <div className="h-full w-full bg-elevated" />
        )}
      </div>
    </div>
  );
}
