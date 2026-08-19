import { prisma } from '../src/config/db.js';
import bcrypt from 'bcryptjs';
import { DateTime } from 'luxon';

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Clean up existing database tables (Order is important to avoid FK violations)
  console.log('Cleaning up existing database records...');
  await prisma.refreshToken.deleteMany({});
  await prisma.pushSubscription.deleteMany({});
  await prisma.reminderSetting.deleteMany({});
  await prisma.habitLog.deleteMany({});
  await prisma.habit.deleteMany({});
  await prisma.user.deleteMany({});

  // 2. Create default demo user
  console.log('Creating demo user...');
  const hashedPassword = await bcrypt.hash('password123', 12);
  const timezone = 'Asia/Kolkata'; // Standard local testing timezone

  const user = await prisma.user.create({
    data: {
      email: 'demo@example.com',
      passwordHash: hashedPassword,
      timezone,
      reminderSettings: {
        create: {
          time: '21:00',
          enabled: true,
        },
      },
    },
  });

  console.log(`Demo user created: ${user.email} (Password: password123)`);

  // 3. Define reference dates relative to user's timezone
  const userNow = DateTime.now().setZone(timezone);
  const todayStr = userNow.toFormat('yyyy-MM-dd');
  const yesterdayStr = userNow.minus({ days: 1 }).toFormat('yyyy-MM-dd');

  // Helper to generate dynamic past dates
  const getPastDateStr = (daysAgo: number): string => {
    return userNow.minus({ days: daysAgo }).toFormat('yyyy-MM-dd');
  };

  // 4. Create Habit 1: Morning Meditation (Daily - Perfect Streak)
  console.log('Seeding "Morning Meditation" habit...');
  const meditation = await prisma.habit.create({
    data: {
      userId: user.id,
      name: 'Morning Meditation',
      description: '15 minutes of mindfulness to start the day calm and focused.',
      frequency: 'DAILY',
      specificDays: [],
      currentStreak: 15,
      longestStreak: 15,
    },
  });

  // Seed perfect logs for last 15 days (including today)
  const meditationLogs = [];
  for (let i = 0; i < 15; i++) {
    meditationLogs.push({
      habitId: meditation.id,
      date: getPastDateStr(i),
      completedAt: DateTime.now().minus({ days: i, hours: 14 }).toJSDate(), // completed in the morning
    });
  }
  await prisma.habitLog.createMany({ data: meditationLogs });

  // 5. Create Habit 2: Drink 3L Water (Daily - Broken Streak / Realistic)
  console.log('Seeding "Drink 3L Water" habit...');
  // This user did it for 5 days, missed it 5 days ago, then did it for the last 4 days (not completed today yet)
  const water = await prisma.habit.create({
    data: {
      userId: user.id,
      name: 'Drink 3L Water',
      description: 'Stay hydrated throughout the day.',
      frequency: 'DAILY',
      specificDays: [],
      currentStreak: 4, // Completed yesterday, 2, 3, 4 days ago
      longestStreak: 5, // Previous streak of 5 days
    },
  });

  // Logs for yesterday, 2, 3, and 4 days ago
  const waterRecentLogs = [1, 2, 3, 4].map((i) => ({
    habitId: water.id,
    date: getPastDateStr(i),
    completedAt: DateTime.now().minus({ days: i, hours: 2 }).toJSDate(),
  }));

  // Old logs: 6, 7, 8, 9, 10 days ago (missed day 5)
  const waterOldLogs = [6, 7, 8, 9, 10].map((i) => ({
    habitId: water.id,
    date: getPastDateStr(i),
    completedAt: DateTime.now().minus({ days: i, hours: 3 }).toJSDate(),
  }));

  await prisma.habitLog.createMany({
    data: [...waterRecentLogs, ...waterOldLogs],
  });

  // 6. Create Habit 3: Gym Workout (Custom - Mon, Wed, Fri Schedule)
  console.log('Seeding "Gym Workout" habit...');
  // Monday = 1, Wednesday = 3, Friday = 5
  const workout = await prisma.habit.create({
    data: {
      userId: user.id,
      name: 'Gym Workout',
      description: 'Strength training and cardio session.',
      frequency: 'CUSTOM',
      specificDays: [1, 3, 5],
      currentStreak: 6, // Completed last 6 scheduled sessions
      longestStreak: 6,
    },
  });

  // Log last 6 scheduled Mon/Wed/Fri days
  const workoutLogs = [];
  let dayCursor = userNow;
  let loggedWorkoutCount = 0;

  // Search back for Mon/Wed/Fri days
  while (loggedWorkoutCount < 6) {
    const weekday = dayCursor.weekday; // Mon=1, Wed=3, Fri=5
    if ([1, 3, 5].includes(weekday)) {
      workoutLogs.push({
        habitId: workout.id,
        date: dayCursor.toFormat('yyyy-MM-dd'),
        completedAt: dayCursor.minus({ hours: 4 }).toJSDate(),
      });
      loggedWorkoutCount++;
    }
    dayCursor = dayCursor.minus({ days: 1 });
  }

  await prisma.habitLog.createMany({ data: workoutLogs });

  console.log('🎉 Database seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
