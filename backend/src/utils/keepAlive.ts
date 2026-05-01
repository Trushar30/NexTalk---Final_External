import { env } from '../config/env';

/**
 * Self-ping mechanism to prevent Render free-tier spin-down.
 * Pings the backend and AI service health endpoints every 14 minutes.
 */
export function startKeepAlive(): void {
  if (env.NODE_ENV !== 'production') {
    return; // Only in production
  }

  const INTERVAL = 14 * 60 * 1000; // 14 minutes (Render sleeps at 15 min)

  const urls: string[] = [];

  if (env.KEEP_ALIVE_URL) {
    urls.push(`${env.KEEP_ALIVE_URL}/health`);
  }
  if (env.AI_KEEP_ALIVE_URL) {
    urls.push(`${env.AI_KEEP_ALIVE_URL}/health`);
  }

  if (urls.length === 0) {
    console.log('ℹ️ Keep-alive: No URLs configured, skipping');
    return;
  }

  console.log(`🏓 Keep-alive: Pinging ${urls.length} service(s) every ${INTERVAL / 60000} min`);

  setInterval(async () => {
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        });
        console.log(`🏓 Keep-alive: ${url} → ${response.status}`);
      } catch (err: any) {
        console.warn(`🏓 Keep-alive failed: ${url} → ${err.message}`);
      }
    }
  }, INTERVAL);
}
