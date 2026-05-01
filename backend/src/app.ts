import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env, getAllowedOrigins } from './config/env';
import apiRoutes from './routes';
import { errorHandler } from './middleware/errorHandler.middleware';
import { generalLimiter } from './middleware/rateLimiter.middleware';

const app = express();

// ─── Trust Proxy (required for Render/Vercel reverse proxy) ──
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ─── Security ────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Allow embedding for WebSocket
  contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
}));

const allowedOrigins = getAllowedOrigins();
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // In development, allow localhost variants
    if (env.NODE_ENV === 'development' && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
      return callback(null, true);
    }
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // Cache preflight for 24h
}));

// ─── Parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(compression());

// ─── Logging ─────────────────────────────────────────────
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'short'));
}

// ─── Rate Limiting ───────────────────────────────────────
app.use('/api', generalLimiter);

// ─── Routes ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    env: env.NODE_ENV,
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
  });
});

app.use('/api', apiRoutes);

// ─── Error Handler ───────────────────────────────────────
app.use(errorHandler);

export default app;
