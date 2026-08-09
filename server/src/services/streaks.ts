import { DateTime } from 'luxon';

/**
 * Validates if the client-provided date string is within a valid completion window (today or yesterday in user's timezone).
 */
export function validateLogDate(clientDateStr: string, userTimezone: string): boolean {
  try {
    const userNow = DateTime.now().setZone(userTimezone);
    const todayStr = userNow.toFormat('yyyy-MM-dd');
    const yesterdayStr = userNow.minus({ days: 1 }).toFormat('yyyy-MM-dd');

    return clientDateStr === todayStr || clientDateStr === yesterdayStr;
  } catch (error) {
    return false;
  }
}

interface HabitDetails {
  createdAt: Date;
  frequency: string;
  specificDays: number[]; // 0 (Sunday) to 6 (Saturday)
}

/**
 * Calculates current and longest streaks based on logged dates.
 * Handles DAILY (every day) and CUSTOM (specific days of the week).
 * 
 * @param logDates Array of logged date strings (YYYY-MM-DD), unique and sorted descending
 * @param habit Habit settings (frequency, specific days, createdAt)
 * @param timezone The user's timezone
 */
export function calculateStreak(
  logDates: string[],
  habit: HabitDetails,
  timezone: string
): { currentStreak: number; longestStreak: number } {
  if (logDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  const userNow = DateTime.now().setZone(timezone);
  const todayStr = userNow.toFormat('yyyy-MM-dd');
  const yesterdayStr = userNow.minus({ days: 1 }).toFormat('yyyy-MM-dd');

  // Determine active scheduled days (0 = Sunday, 6 = Saturday)
  const scheduledDays = habit.frequency === 'DAILY' 
    ? [0, 1, 2, 3, 4, 5, 6] 
    : habit.specificDays;

  if (scheduledDays.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  // Set of logged dates for fast O(1) checks
  const loggedSet = new Set(logDates);

  // --- 1. Compute Current Streak ---
  let currentStreak = 0;
  let currentCursor = userNow;
  let currentStreakActive = true;
  let daysChecked = 0;
  
  // We check up to 365 days backwards to find the current active streak.
  // A streak is active if the user has completed all scheduled days leading up to today.
  // Note: If today is a scheduled day but not yet logged, the streak remains active
  // as long as the previous scheduled day (yesterday or earlier) was completed.
  
  let latestScheduledDayBeforeToday: DateTime | null = null;
  let checkDate = userNow.minus({ days: 1 });
  
  // Find the last scheduled day *before* today
  for (let i = 0; i < 7; i++) {
    const dayOfWeek = checkDate.weekday % 7; // Luxon: Mon=1..Sun=7. Convert to Sun=0..Sat=6
    if (scheduledDays.includes(dayOfWeek)) {
      latestScheduledDayBeforeToday = checkDate;
      break;
    }
    checkDate = checkDate.minus({ days: 1 });
  }

  const todayDayOfWeek = userNow.weekday % 7;
  const isTodayScheduled = scheduledDays.includes(todayDayOfWeek);
  const isTodayLogged = loggedSet.has(todayStr);

  if (latestScheduledDayBeforeToday) {
    const lastScheduledStr = latestScheduledDayBeforeToday.toFormat('yyyy-MM-dd');
    const isLastScheduledLogged = loggedSet.has(lastScheduledStr);

    // If today is scheduled and not logged, and the previous scheduled day is also NOT logged, streak is 0.
    // If today is not scheduled, and the previous scheduled day is NOT logged, streak is 0.
    if (!isLastScheduledLogged && (!isTodayScheduled || !isTodayLogged)) {
      currentStreakActive = false;
    }
  }

  if (currentStreakActive) {
    // Start counting back from today
    let cursor = userNow;
    // We only go back as far as the habit creation date or 365 days
    const creationDateLimit = DateTime.fromJSDate(habit.createdAt).setZone(timezone).startOf('day');
    
    while (cursor >= creationDateLimit && daysChecked < 365) {
      const cursorStr = cursor.toFormat('yyyy-MM-dd');
      const cursorDayOfWeek = cursor.weekday % 7;
      
      if (scheduledDays.includes(cursorDayOfWeek)) {
        if (loggedSet.has(cursorStr)) {
          currentStreak++;
        } else {
          // If cursor is "today", it's okay not to have it logged yet, provided they logged the previous one.
          // Otherwise, any missing scheduled day breaks the current streak.
          if (cursorStr !== todayStr) {
            break;
          }
        }
      }
      cursor = cursor.minus({ days: 1 });
      daysChecked++;
    }
  }

  // --- 2. Compute Longest Streak ---
  // To compute the longest historical streak, we sort logDates ascending and count contiguous runs.
  // Contiguous runs for scheduled habits are runs of scheduled days that are all logged.
  // Let's generate a list of all scheduled days from the first log date to the latest log date.
  const sortedLogs = [...logDates].sort();
  if (sortedLogs.length === 0) {
    return { currentStreak, longestStreak: 0 };
  }

  const startCursor = DateTime.fromISO(sortedLogs[0], { zone: timezone }).startOf('day');
  const endCursor = DateTime.fromISO(sortedLogs[sortedLogs.length - 1], { zone: timezone }).startOf('day');
  
  let longestStreak = 0;
  let tempStreak = 0;
  let cursor = startCursor;

  while (cursor <= endCursor) {
    const cursorStr = cursor.toFormat('yyyy-MM-dd');
    const cursorDayOfWeek = cursor.weekday % 7;

    if (scheduledDays.includes(cursorDayOfWeek)) {
      if (loggedSet.has(cursorStr)) {
        tempStreak++;
        if (tempStreak > longestStreak) {
          longestStreak = tempStreak;
        }
      } else {
        tempStreak = 0;
      }
    }
    cursor = cursor.plus({ days: 1 });
  }

  // The longest streak should be at least the current streak
  longestStreak = Math.max(longestStreak, currentStreak);

  return { currentStreak, longestStreak };
}
export function getLocalTodayStr(timezone: string): string {
  return DateTime.now().setZone(timezone).toFormat('yyyy-MM-dd');
}
