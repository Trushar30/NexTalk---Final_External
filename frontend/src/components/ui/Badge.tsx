import React from 'react';
import { cn } from '@/lib/utils';
import { type Mood } from './MoodRing';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  mood?: Mood;
  variant?: 'outline' | 'solid' | 'neon';
}

const moodClasses: Record<Mood, string> = {
  calm: 'bg-blue-500/20 text-[#60A5FA] border-[#60A5FA]/30',
  happy: 'bg-yellow-500/20 text-[#FBBF24] border-[#FBBF24]/30',
  focused: 'bg-emerald-500/20 text-[#34D399] border-[#34D399]/30',
  stressed: 'bg-red-500/20 text-[#F87171] border-[#F87171]/30',
  excited: 'bg-purple-500/20 text-[#C084FC] border-[#C084FC]/30',
  neutral: 'bg-slate-500/20 text-[#94A3B8] border-[#94A3B8]/30',
};

const emojiMap: Record<Mood, string> = {
  calm: '🌊',
  happy: '😊',
  focused: '🎯',
  stressed: '😤',
  excited: '✨',
  neutral: '😶',
};

export function Badge({ className, mood, variant = 'solid', children, ...props }: BadgeProps) {
  if (mood) {
    return (
      <div 
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border",
          moodClasses[mood],
          className
        )}
        {...props}
      >
        <span>{emojiMap[mood]}</span>
        <span className="capitalize">{mood}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2",
        variant === 'solid' && "bg-accent-primary border-transparent text-white",
        variant === 'outline' && "text-text-primary border border-border-subtle",
        variant === 'neon' && "bg-accent-primary/20 text-accent-primary border border-accent-primary/50",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
