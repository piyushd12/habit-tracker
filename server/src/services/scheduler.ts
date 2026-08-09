import { Queue, Worker, Job } from 'bullmq';
import webpush from 'web-push';
import { DateTime } from 'luxon';
import { prisma } from '../config/db.js';
import { redisConnection } from '../config/redis.js';

// Setup VAPID keys for web-push
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@example.com';
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.warn('WARNING: VAPID keys not set. Push notifications will fail to send.');
}

// 1. Define BullMQ Queue and Worker Names
export const NOTIFICATION_QUEUE_NAME = 'push-notifications';
export const notificationQueue = new Queue(NOTIFICATION_QUEUE_NAME, {
  connection: redisConnection,
});

interface NotificationJobData {
  userId: string;
  subscription: {
    endpoint: string;
    keys: {
      auth: string;
      p256dh: string;
    };
  };
  payload: string;
}

// 2. Define BullMQ Worker to process push notifications
export const notificationWorker = new Worker<NotificationJobData>(
  NOTIFICATION_QUEUE_NAME,
  async (job: Job<NotificationJobData>) => {
    const { subscription, payload, userId } = job.data;

    try {
      const sub = {
        endpoint: subscription.endpoint,
        keys: {
          auth: subscription.keys.auth,
          p256dh: subscription.keys.p256dh,
        },
      };

      await webpush.sendNotification(sub, payload);
      console.log(`Successfully sent push notification to user ${userId}`);
    } catch (error: any) {
      // Clean up dead subscriptions (expired or revoked)
      if (error.statusCode === 410 || error.statusCode === 404) {
        console.log(`Subscription for user ${userId} expired. Removing from database...`);
        await prisma.pushSubscription.deleteMany({
          where: { endpoint: subscription.endpoint },
        });
      } else {
        console.error(`Failed to send push notification to user ${userId}:`, error.message || error);
        throw error; // Let BullMQ handle retries
      }
    }
  },
  {
    connection: redisConnection,
    concurrency: 5, // Limit concurrent outgoing notifications
  }
);

// 3. Timezone Bucket Evaluator
export async function checkAndScheduleReminders(): Promise<void> {
  try {
    const nowUtc = DateTime.utc();
    
    // Find all distinct timezones of users who have reminder settings enabled
    const distinctUsers = await prisma.user.findMany({
      where: {
        reminderSettings: {
          enabled: true,
        },
      },
      select: {
        timezone: true,
      },
      distinct: ['timezone'],
    });

    const activeTimezones = distinctUsers.map((u) => u.timezone);

    for (const tz of activeTimezones) {
      // Calculate local time in this timezone
      const localTime = nowUtc.setZone(tz);
      const localHourMinute = localTime.toFormat('HH:mm'); // e.g. "21:00" or "21:30"

      // We query users in this timezone whose target reminder time matches the local time
      const usersToRemind = await prisma.user.findMany({
        where: {
          timezone: tz,
          reminderSettings: {
            enabled: true,
            time: localHourMinute,
          },
        },
        include: {
          pushSubscriptions: true,
          // Get habits that are NOT completed today to customize notification payload
          habits: {
            include: {
              logs: {
                where: {
                  date: localTime.toFormat('yyyy-MM-dd'),
                },
              },
            },
          },
        },
      });

      for (const user of usersToRemind) {
        // Count uncompleted habits today
        const uncompletedHabits = user.habits.filter((h) => h.logs.length === 0);
        
        if (uncompletedHabits.length === 0) {
          // All habits done! No need to remind.
          continue;
        }

        const message = JSON.stringify({
          title: 'Daily Habit Reminder',
          body: `You have ${uncompletedHabits.length} habit(s) left to complete today! Keep your streak going.`,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
        });

        for (const sub of user.pushSubscriptions) {
          await notificationQueue.add(
            `reminder-${user.id}-${sub.id}`,
            {
              userId: user.id,
              subscription: {
                endpoint: sub.endpoint,
                keys: {
                  auth: sub.auth,
                  p256dh: sub.p256dh,
                },
              },
              payload: message,
            },
            {
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 5000,
              },
            }
          );
        }
      }
    }
  } catch (error) {
    console.error('Error in checkAndScheduleReminders:', error);
  }
}

// 4. Scheduler Tick Engine
let schedulerInterval: NodeJS.Timeout | null = null;

export function startScheduler(intervalMs = 60 * 1000): void {
  if (schedulerInterval) return;

  console.log(`Starting reminder scheduler (ticking every ${intervalMs / 1000}s)`);
  
  // Run immediately on start
  checkAndScheduleReminders();

  schedulerInterval = setInterval(() => {
    checkAndScheduleReminders();
  }, intervalMs);
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('Reminder scheduler stopped');
  }
}
