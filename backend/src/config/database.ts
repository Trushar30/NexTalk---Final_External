import mongoose from 'mongoose';
import { env } from './env';

export async function connectDatabase(): Promise<void> {
  const maxRetries = 5;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      await mongoose.connect(env.MONGODB_URI, {
        // Connection pool settings for production
        maxPoolSize: env.NODE_ENV === 'production' ? 10 : 5,
        minPoolSize: env.NODE_ENV === 'production' ? 2 : 1,
        // Timeouts
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        // Buffering
        bufferCommands: true,
        // Auto-create indexes in dev, skip in prod for performance
        autoIndex: env.NODE_ENV !== 'production',
      });
      console.log('✅ MongoDB connected successfully');
      break;
    } catch (error) {
      attempt++;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      console.error(`❌ MongoDB connection attempt ${attempt}/${maxRetries} failed:`, error);
      if (attempt >= maxRetries) {
        console.error('❌ MongoDB: all connection attempts exhausted');
        process.exit(1);
      }
      console.log(`  Retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Mongoose will auto-reconnect...');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected');
  });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  console.log('MongoDB disconnected');
}
