import { type ClassValue, clsx } from 'clsx';

/**
 * Utility to merge tailwind/class strings conditionally
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
