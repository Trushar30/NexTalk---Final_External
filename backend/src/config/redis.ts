import Redis, { RedisOptions } from 'ioredis';
import { env } from './env';

/**
 * Build ioredis connection options.
 * Supports both redis:// (local) and rediss:// (Upstash/TLS).
 */
function buildRedisOptions(): RedisOptions {
  const isTLS = env.REDIS_URL.startsWith('rediss://');

  const opts: RedisOptions = {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      if (times > 20) {
        console.error('❌ Redis: max retries reached, giving up');
        return null;
      }
      return Math.min(times * 500, 10000);
    },
    reconnectOnError: (err: Error) => {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some((e) => err.message.includes(e));
    },
    lazyConnect: true, // Don't block startup
  };

  // Upstash / TLS support
  if (isTLS) {
    opts.tls = { rejectUnauthorized: false };
  }

  return opts;
}

// ─── Main Redis connection ──────────────────────────────
export const redis = new Redis(env.REDIS_URL, buildRedisOptions());

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => {
  // Log but don't crash — app can degrade gracefully without Redis
  if (err.message.includes('ECONNREFUSED')) {
    console.warn('⚠️ Redis unavailable — features will degrade gracefully');
  } else {
    console.error('Redis error:', err.message);
  }
});
redis.on('close', () => console.warn('⚠️ Redis connection closed'));

// Attempt initial connection (non-blocking)
redis.connect().catch((err) => {
  console.warn('⚠️ Redis initial connection failed:', err.message);
});

/**
 * Check if Redis is currently connected and usable.
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

// Separate connection for pub/sub (shared connections cannot mix commands + pub/sub)
export const redisSub = new Redis(env.REDIS_URL, buildRedisOptions());
redisSub.connect().catch(() => { /* handled by event listeners */ });

export const redisPub = new Redis(env.REDIS_URL, buildRedisOptions());
redisPub.connect().catch(() => { /* handled by event listeners */ });
