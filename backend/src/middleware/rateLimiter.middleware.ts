import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { sendError } from '../utils/apiResponse';

interface RateLimitOptions {
  windowMs: number;   // Time window in milliseconds
  maxRequests: number; // Max requests in that window
  keyPrefix?: string;  // Custom prefix for rate limit key
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, maxRequests, keyPrefix = 'rl' } = options;
  const windowS = Math.ceil(windowMs / 1000);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identifier = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${req.method}:${req.route?.path || req.path}:${identifier}`;

    try {
      const current = await redis.incr(key);

      if (current === 1) {
        await redis.expire(key, windowS);
      }

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current));

      if (current > maxRequests) {
        const ttl = await redis.ttl(key);
        res.setHeader('Retry-After', ttl);
        sendError(res, 'Too many requests. Please try again later.', 429);
        return;
      }

      next();
    } catch (error) {
      // If Redis is down, let the request through
      console.error('Rate limiter error:', error);
      next();
    }
  };
}

// ─── Pre-configured limiters ─────────────────────────────
export const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 5, keyPrefix: 'rl:auth' });
export const faceLimiter = rateLimit({ windowMs: 5 * 60 * 1000, maxRequests: 10, keyPrefix: 'rl:face' });
export const messageLimiter = rateLimit({ windowMs: 60 * 1000, maxRequests: 60, keyPrefix: 'rl:msg' });
export const connectionLimiter = rateLimit({ windowMs: 60 * 60 * 1000, maxRequests: 20, keyPrefix: 'rl:conn' });
export const searchLimiter = rateLimit({ windowMs: 60 * 1000, maxRequests: 30, keyPrefix: 'rl:search' });
export const generalLimiter = rateLimit({ windowMs: 60 * 1000, maxRequests: 100, keyPrefix: 'rl:gen' });
