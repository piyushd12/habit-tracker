import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { validate } from '../middleware/validate.js';
import { logCompletionSchema } from '../middleware/validators.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthenticatedRequest } from '../types/index.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors.js';
import { validateLogDate, calculateStreak } from '../services/streaks.js';

const router = Router();

// Require authentication for all log routes
router.use(requireAuth);

// POST /api/habits/:id/logs - Complete habit for a given local date
router.post(
  '/:id/logs',
  validate(logCompletionSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id;
    const habitId = req.params.id as string;
    const { date } = req.body; // Expects "YYYY-MM-DD"

    try {
      const habit = await prisma.habit.findUnique({
        where: { id: habitId },
      });

      if (!habit) {
        throw new NotFoundError('Habit not found');
      }

      if (habit.userId !== userId) {
        throw new ForbiddenError('You do not have permission to access this habit');
      }

      // Validate date window (only allow logging today or yesterday in user's timezone)
      if (!validateLogDate(date, req.user!.timezone)) {
        throw new BadRequestError('Completion date must be today or yesterday in your local timezone');
      }

      // Idempotent insertion
      let log = await prisma.habitLog.findUnique({
        where: {
          habitId_date: {
            habitId,
            date,
          },
        },
      });

      if (!log) {
        log = await prisma.habitLog.create({
          data: {
            habitId,
            date,
          },
        });
      }

      // Fetch all logs to recalculate streaks
      const allLogs = await prisma.habitLog.findMany({
        where: { habitId },
        select: { date: true },
        orderBy: { date: 'desc' },
      });

      const logDates = allLogs.map((l) => l.date);
      const { currentStreak, longestStreak } = calculateStreak(logDates, habit, req.user!.timezone);

      // Update cached values
      const updatedHabit = await prisma.habit.update({
        where: { id: habitId },
        data: {
          currentStreak,
          longestStreak,
        },
      });

      res.status(200).json({
        status: 'success',
        data: {
          log,
          habit: updatedHabit,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/habits/:id/logs/:date - Uncomplete habit (toggle off) for a given local date
router.delete(
  '/:id/logs/:date',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id;
    const habitId = req.params.id as string;
    const date = req.params.date as string; // Format: YYYY-MM-DD

    try {
      const habit = await prisma.habit.findUnique({
        where: { id: habitId },
      });

      if (!habit) {
        throw new NotFoundError('Habit not found');
      }

      if (habit.userId !== userId) {
        throw new ForbiddenError('You do not have permission to access this habit');
      }

      // Remove the log if it exists
      await prisma.habitLog.deleteMany({
        where: {
          habitId,
          date,
        },
      });

      // Recalculate streaks
      const allLogs = await prisma.habitLog.findMany({
        where: { habitId },
        select: { date: true },
        orderBy: { date: 'desc' },
      });

      const logDates = allLogs.map((l) => l.date);
      const { currentStreak, longestStreak } = calculateStreak(logDates, habit, req.user!.timezone);

      // Update cached values
      const updatedHabit = await prisma.habit.update({
        where: { id: habitId },
        data: {
          currentStreak,
          longestStreak,
        },
      });

      res.status(200).json({
        status: 'success',
        data: {
          habit: updatedHabit,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/habits/:id/streak - Fetch on-demand deep-recalculated streaks
router.get(
  '/:id/streak',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id;
    const habitId = req.params.id as string;

    try {
      const habit = await prisma.habit.findUnique({
        where: { id: habitId },
      });

      if (!habit) {
        throw new NotFoundError('Habit not found');
      }

      if (habit.userId !== userId) {
        throw new ForbiddenError('You do not have permission to access this habit');
      }

      const allLogs = await prisma.habitLog.findMany({
        where: { habitId },
        select: { date: true },
        orderBy: { date: 'desc' },
      });

      const logDates = allLogs.map((l) => l.date);
      const { currentStreak, longestStreak } = calculateStreak(logDates, habit, req.user!.timezone);

      // Sync database values just in case
      await prisma.habit.update({
        where: { id: habitId },
        data: {
          currentStreak,
          longestStreak,
        },
      });

      res.status(200).json({
        status: 'success',
        data: {
          currentStreak,
          longestStreak,
          calculationTimestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
