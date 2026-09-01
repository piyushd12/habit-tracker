import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import authRouter from './routes/auth.js';
import habitsRouter from './routes/habits.js';
import logsRouter from './routes/logs.js';
import remindersRouter from './routes/reminders.js';
import { errorHandler } from './utils/errors.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { prisma } from './config/db.js';
import { redisConnection } from './config/redis.js';

export const app = express();
const PORT = process.env.PORT || 5000;

// Configure CORS to support HTTPOnly cookies across local and Vercel production/preview deployments
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) return callback(null, true);

      const normalizedOrigin = origin.replace(/\/$/, '');

      // Allow configured origins in CLIENT_URL
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      // Allow any Vercel deployment domain (*.vercel.app)
      if (/\.vercel\.app$/.test(normalizedOrigin)) {
        return callback(null, true);
      }

      // Allow localhost dev environments
      if (normalizedOrigin.includes('localhost') || normalizedOrigin.includes('127.0.0.1')) {
        return callback(null, true);
      }

      console.warn(`⚠️  Blocked CORS origin: ${origin}`);
      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// Rate limiting for auth endpoints (prevent brute force attacks)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window per IP
  message: {
    status: 'error',
    message: 'Too many authentication attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: {
    status: 'error',
    message: 'Too many requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check endpoint (no auth required)
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check Redis connection
    await redisConnection.ping();
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'ok',
        redis: 'ok',
        scheduler: 'ok',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Service check failed',
    });
  }
});

// Apply rate limiting
app.use('/api', apiLimiter);

// REST Router registration
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/habits', habitsRouter);
app.use('/api/habits', logsRouter); // mounts /:id/logs, /:id/logs/:date, and /:id/streak under habits
app.use('/api/reminders', remindersRouter);

// Fallback Route
app.use((req, res, next) => {
  res.status(404).json({
    status: 'error',
    message: `Resource not found: ${req.method} ${req.url}`,
  });
});

// Standard Error Handler Middleware
app.use(errorHandler);

// Start Server & Scheduler
const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  startScheduler(60 * 1000); // Check timezone buckets every 60 seconds
});

// Graceful Shutdown
const shutdown = async () => {
  console.log('Shutting down gracefully...');
  stopScheduler();
  
  server.close(async () => {
    console.log('Express server closed.');
    await prisma.$disconnect();
    console.log('Database client disconnected.');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
