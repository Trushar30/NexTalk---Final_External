import http from 'http';
import app from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { redis, isRedisAvailable } from './config/redis';
import { initializeSocket } from './socket';
import { startKeepAlive } from './utils/keepAlive';

// Import workers so they start processing
import './jobs/notification.worker';
import './jobs/toxicCheck.worker';
import './jobs/messageExpiry.worker';

async function main(): Promise<void> {
  // Connect to MongoDB
  await connectDatabase();

  // Check Redis (non-blocking — app works without it)
  const redisOk = await isRedisAvailable();
  if (redisOk) {
    console.log('✅ Redis is available');
  } else {
    console.warn('⚠️ Redis is unavailable — background jobs and presence will degrade');
  }

  // Create HTTP server
  const server = http.createServer(app);

  // Configure server timeouts for production
  server.keepAliveTimeout = 65000; // Slightly higher than typical LB timeout (60s)
  server.headersTimeout = 66000;

  // Initialize Socket.io
  const io = initializeSocket(server);

  // Store io instance for access from services
  app.set('io', io);

  // Start listening
  server.listen(env.PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║            🚀 NexTalk Server Started              ║
╠═══════════════════════════════════════════════════╣
║  HTTP:      http://localhost:${env.PORT}               ║
║  WebSocket: ws://localhost:${env.PORT}                 ║
║  Env:       ${env.NODE_ENV.padEnd(37)}║
║  Redis:     ${(redisOk ? 'Connected ✅' : 'Degraded ⚠️').padEnd(37)}║
╚═══════════════════════════════════════════════════╝
    `);

    // Start keep-alive pinger (prevents Render free-tier spin-down)
    startKeepAlive();
  });

  // ─── Graceful Shutdown ──────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    // Stop accepting new connections
    server.close(async () => {
      console.log('HTTP server closed');

      try {
        // Close Socket.io connections
        io.close();
        console.log('Socket.IO closed');
      } catch (err) {
        console.error('Socket.IO close error:', err);
      }

      try {
        await disconnectDatabase();
      } catch (err) {
        console.error('Database disconnect error:', err);
      }

      try {
        await redis.quit();
      } catch (err) {
        // Redis may already be disconnected
      }

      console.log('All connections closed. Goodbye! 👋');
      process.exit(0);
    });

    // Force exit after 15s
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 15000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // In production, attempt graceful shutdown instead of hard exit
    if (env.NODE_ENV === 'production') {
      shutdown('UNCAUGHT_EXCEPTION').catch(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });
}

main().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
