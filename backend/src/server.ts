import http from 'http';
import app from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { redis } from './config/redis';
import { initializeSocket } from './socket';

// Import workers so they start processing
import './jobs/notification.worker';
import './jobs/toxicCheck.worker';
import './jobs/messageExpiry.worker';

async function main(): Promise<void> {
  // Connect to MongoDB
  await connectDatabase();

  // Create HTTP server
  const server = http.createServer(app);

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
╚═══════════════════════════════════════════════════╝
    `);
  });

  // ─── Graceful Shutdown ──────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    server.close(async () => {
      console.log('HTTP server closed');
      await disconnectDatabase();
      await redis.quit();
      console.log('All connections closed. Goodbye! 👋');
      process.exit(0);
    });

    // Force exit after 10s
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
