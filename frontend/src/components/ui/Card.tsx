import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';

interface CardProps extends HTMLMotionProps<"div"> {
  glass?: boolean;
}

export function Card({ className, glass = false, children, ...props }: CardProps) {
  return (
    <motion.div
      className={cn(
        glass ? "glass-panel rounded-2xl p-6" : "glass-card p-6",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
