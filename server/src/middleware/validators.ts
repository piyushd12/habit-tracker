import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    timezone: z.string().min(1, 'Timezone is required').default('UTC'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const createHabitSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, 'Habit name is required'),
    description: z.string().trim().optional().nullable(),
    frequency: z.enum(['DAILY', 'WEEKLY', 'CUSTOM']),
    specificDays: z.array(z.number().min(0).max(6)).optional().default([]),
  }).refine((data) => {
    if (data.frequency === 'CUSTOM' && (!data.specificDays || data.specificDays.length === 0)) {
      return false;
    }
    return true;
  }, {
    message: 'specificDays is required and cannot be empty when frequency is CUSTOM',
    path: ['specificDays'],
  }),
});

export const updateHabitSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, 'Habit name is required').optional(),
    description: z.string().trim().optional().nullable(),
    frequency: z.enum(['DAILY', 'WEEKLY', 'CUSTOM']).optional(),
    specificDays: z.array(z.number().min(0).max(6)).optional(),
  }),
});

export const logCompletionSchema = z.object({
  body: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  }),
});

export const reminderSettingsSchema = z.object({
  body: z.object({
    time: z.string().regex(/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM 24-hour format'),
    enabled: z.boolean(),
  }),
});

export const pushSubscriptionSchema = z.object({
  body: z.object({
    endpoint: z.string().url('Endpoint must be a valid URL'),
    keys: z.object({
      p256dh: z.string().min(1, 'p256dh key is required'),
      auth: z.string().min(1, 'auth key is required'),
    }),
  }),
});
