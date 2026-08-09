import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRouter from './routes/auth.js';
import habitsRouter from './routes/habits.js';
import logsRouter from './routes/logs.js';
import remindersRouter from './routes/reminders.js';
import { errorHandler } from './utils/errors.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { prisma } from './config/db.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Configure CORS to support HTTPOnly cookies across local domains
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// REST Router registration
app.use('/api/auth', authRouter);
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
  startScheduler(60 * 1000); // Check timezone buckets every minute
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
