import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),

  // Comma-separated frontend URLs for CORS (e.g. "https://nextalk.vercel.app,http://localhost:3000")
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // MongoDB
  MONGODB_URI: z.string().default('mongodb://localhost:27017/nextalk'),

  // Redis (supports both redis:// and rediss:// for TLS/Upstash)
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),

  // S3 / MinIO
  AWS_BUCKET_NAME: z.string().default('nextalk-media'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ENDPOINT: z.string().optional(),

  // AI Service
  AI_SERVICE_URL: z.string().default('http://localhost:8000'),
  AI_SERVICE_SECRET: z.string().optional(),

  // Face Encryption
  FACE_ENCRYPTION_KEY: z.string().optional(),

  // Push Notifications
  FCM_SERVER_KEY: z.string().optional(),

  // Email
  SENDGRID_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@nextalk.app'),

  // Keep-alive self-ping URL (set to your Render URL in production)
  KEEP_ALIVE_URL: z.string().optional(),

  // Keep-alive for AI service
  AI_KEEP_ALIVE_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

/**
 * Parse FRONTEND_URL into an array of allowed origins (supports comma-separated).
 */
export function getAllowedOrigins(): string[] {
  return env.FRONTEND_URL.split(',').map((url) => url.trim()).filter(Boolean);
}
