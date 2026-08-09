import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { validate } from '../middleware/validate.js';
import { reminderSettingsSchema, pushSubscriptionSchema } from '../middleware/validators.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthenticatedRequest } from '../types/index.js';
import { NotFoundError } from '../utils/errors.js';

const router = Router();

// Apply auth middleware to all reminder routes
router.use(requireAuth);

// GET /api/reminders/settings - Fetch user reminder settings
router.get('/settings', async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const userId = req.user!.id;

  try {
    let settings = await prisma.reminderSetting.findUnique({
      where: { userId },
    });

    // Fallback if settings don't exist yet for some reason
    if (!settings) {
      settings = await prisma.reminderSetting.create({
        data: {
          userId,
          time: '20:00',
          enabled: true,
        },
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        settings,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/reminders/settings - Update user reminder settings
router.put(
  '/settings',
  validate(reminderSettingsSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id;
    const { time, enabled } = req.body;

    try {
      const settings = await prisma.reminderSetting.upsert({
        where: { userId },
        update: {
          time,
          enabled,
        },
        create: {
          userId,
          time,
          enabled,
        },
      });

      res.status(200).json({
        status: 'success',
        data: {
          settings,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/reminders/subscribe - Register Web Push Subscription
router.post(
  '/subscribe',
  validate(pushSubscriptionSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.id;
    const { endpoint, keys } = req.body;

    try {
      // Create or update subscription
      const subscription = await prisma.pushSubscription.upsert({
        where: { endpoint },
        update: {
          userId,
          auth: keys.auth,
          p256dh: keys.p256dh,
        },
        create: {
          userId,
          endpoint,
          auth: keys.auth,
          p256dh: keys.p256dh,
        },
      });

      res.status(201).json({
        status: 'success',
        data: {
          subscription,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
