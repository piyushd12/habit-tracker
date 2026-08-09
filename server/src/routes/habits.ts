import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { validate } from '../middleware/validate.js';
import { createHabitSchema, updateHabitSchema } from '../middleware/validators.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthenticatedRequest } from '../types/index.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import { calculateStreak } from '../services/streaks.js';

const router = Router();

// Apply auth middleware to all habit routes
router.use(requireAuth);

// GET /api/habits - Fetch all habits for current user
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const habits = await prisma.habit.findMany({
      where: { userId },
      include: {
        logs: {
          orderBy: { date: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      status: 'success',
      data: {
        habits,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/habits - Create a new habit
router.post(
  '/',
  validate(createHabitSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id;
    const { name, description, frequency, specificDays } = req.body;

    try {
      const habit = await prisma.habit.create({
        data: {
          userId,
          name,
          description,
          frequency,
          specificDays,
          currentStreak: 0,
          longestStreak: 0,
        },
      });

      res.status(201).json({
        status: 'success',
        data: {
          habit,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/habits/:id - Fetch single habit details with its completion log history
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const userId = req.user!.id;
  const habitId = req.params.id as string;

  try {
    const habit = await prisma.habit.findUnique({
      where: { id: habitId },
      include: {
        logs: {
          orderBy: { date: 'desc' },
        },
      },
    });

    if (!habit) {
      throw new NotFoundError('Habit not found');
    }

    if (habit.userId !== userId) {
      throw new ForbiddenError('You do not have permission to access this habit');
    }

    res.status(200).json({
      status: 'success',
      data: {
        habit,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/habits/:id - Update habit details
router.put(
  '/:id',
  validate(updateHabitSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id;
    const habitId = req.params.id as string;
    const { name, description, frequency, specificDays } = req.body;

    try {
      const existingHabit = await prisma.habit.findUnique({
        where: { id: habitId },
      });

      if (!existingHabit) {
        throw new NotFoundError('Habit not found');
      }

      if (existingHabit.userId !== userId) {
        throw new ForbiddenError('You do not have permission to modify this habit');
      }

      // Update the habit details
      let updatedHabit = await prisma.habit.update({
        where: { id: habitId },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(frequency !== undefined && { frequency }),
          ...(specificDays !== undefined && { specificDays }),
        },
      });

      // If frequency or schedule changed, recalculate streaks
      if (
        (frequency !== undefined && frequency !== existingHabit.frequency) ||
        (specificDays !== undefined && JSON.stringify(specificDays) !== JSON.stringify(existingHabit.specificDays))
      ) {
        const logs = await prisma.habitLog.findMany({
          where: { habitId },
          select: { date: true },
          orderBy: { date: 'desc' },
        });

        const logDates = logs.map((l) => l.date);
        const { currentStreak, longestStreak } = calculateStreak(logDates, updatedHabit, req.user!.timezone);

        updatedHabit = await prisma.habit.update({
          where: { id: habitId },
          data: {
            currentStreak,
            longestStreak,
          },
        });
      }

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

// DELETE /api/habits/:id - Delete a habit
router.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const userId = req.user!.id;
  const habitId = req.params.id as string;

  try {
    const existingHabit = await prisma.habit.findUnique({
      where: { id: habitId },
    });

    if (!existingHabit) {
      throw new NotFoundError('Habit not found');
    }

    if (existingHabit.userId !== userId) {
      throw new ForbiddenError('You do not have permission to delete this habit');
    }

    await prisma.habit.delete({
      where: { id: habitId },
    });

    res.status(200).json({
      status: 'success',
      message: 'Habit deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
