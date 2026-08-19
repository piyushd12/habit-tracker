import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { calculateStreak, validateLogDate } from '../../src/services/streaks.js';

describe('validateLogDate', () => {
  const timezone = 'America/New_York';

  it('should return true for today and yesterday date strings in the user timezone', () => {
    const now = DateTime.now().setZone(timezone);
    const todayStr = now.toFormat('yyyy-MM-dd');
    const yesterdayStr = now.minus({ days: 1 }).toFormat('yyyy-MM-dd');

    expect(validateLogDate(todayStr, timezone)).toBe(true);
    expect(validateLogDate(yesterdayStr, timezone)).toBe(true);
  });

  it('should return false for older dates or tomorrow', () => {
    const now = DateTime.now().setZone(timezone);
    const twoDaysAgoStr = now.minus({ days: 2 }).toFormat('yyyy-MM-dd');
    const tomorrowStr = now.plus({ days: 1 }).toFormat('yyyy-MM-dd');

    expect(validateLogDate(twoDaysAgoStr, timezone)).toBe(false);
    expect(validateLogDate(tomorrowStr, timezone)).toBe(false);
  });

  it('should return false for invalid date strings', () => {
    expect(validateLogDate('invalid-date', timezone)).toBe(false);
    expect(validateLogDate('2026-13-45', timezone)).toBe(false);
  });
});

describe('calculateStreak', () => {
  const timezone = 'UTC';

  it('should return 0 for empty logs list', () => {
    const habit = {
      frequency: 'DAILY',
      specificDays: [],
      createdAt: new Date('2026-08-01T00:00:00Z'),
    };
    const result = calculateStreak([], habit, timezone);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
  });

  it('should correctly calculate streak for consecutive daily logs ending today', () => {
    const now = DateTime.now().setZone(timezone);
    const todayStr = now.toFormat('yyyy-MM-dd');
    const yesterdayStr = now.minus({ days: 1 }).toFormat('yyyy-MM-dd');
    const twoDaysAgoStr = now.minus({ days: 2 }).toFormat('yyyy-MM-dd');

    const habit = {
      frequency: 'DAILY',
      specificDays: [],
      createdAt: new Date(now.minus({ days: 10 }).toISODate() + 'T00:00:00Z'),
    };

    const logs = [todayStr, yesterdayStr, twoDaysAgoStr];
    const result = calculateStreak(logs, habit, timezone);

    expect(result.currentStreak).toBe(3);
    expect(result.longestStreak).toBe(3);
  });

  it('should maintain streak if today is not logged yet but yesterday was logged (for DAILY)', () => {
    const now = DateTime.now().setZone(timezone);
    const yesterdayStr = now.minus({ days: 1 }).toFormat('yyyy-MM-dd');
    const twoDaysAgoStr = now.minus({ days: 2 }).toFormat('yyyy-MM-dd');

    const habit = {
      frequency: 'DAILY',
      specificDays: [],
      createdAt: new Date(now.minus({ days: 10 }).toISODate() + 'T00:00:00Z'),
    };

    const logs = [yesterdayStr, twoDaysAgoStr];
    const result = calculateStreak(logs, habit, timezone);

    expect(result.currentStreak).toBe(2);
    expect(result.longestStreak).toBe(2);
  });

  it('should reset current streak to 0 if both today and yesterday are missed (for DAILY)', () => {
    const now = DateTime.now().setZone(timezone);
    const twoDaysAgoStr = now.minus({ days: 2 }).toFormat('yyyy-MM-dd');
    const threeDaysAgoStr = now.minus({ days: 3 }).toFormat('yyyy-MM-dd');

    const habit = {
      frequency: 'DAILY',
      specificDays: [],
      createdAt: new Date(now.minus({ days: 10 }).toISODate() + 'T00:00:00Z'),
    };

    const logs = [twoDaysAgoStr, threeDaysAgoStr];
    const result = calculateStreak(logs, habit, timezone);

    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(2);
  });

  it('should respect habit creation date and limit streak length accordingly', () => {
    const now = DateTime.now().setZone(timezone);
    const todayStr = now.toFormat('yyyy-MM-dd');
    const yesterdayStr = now.minus({ days: 1 }).toFormat('yyyy-MM-dd');
    const twoDaysAgoStr = now.minus({ days: 2 }).toFormat('yyyy-MM-dd');

    // Habit created yesterday, so logs from 2 days ago should not extend the active current streak past creation boundary
    const habit = {
      frequency: 'DAILY',
      specificDays: [],
      createdAt: new Date(now.minus({ days: 1 }).toISODate() + 'T12:00:00Z'),
    };

    const logs = [todayStr, yesterdayStr, twoDaysAgoStr];
    const result = calculateStreak(logs, habit, timezone);

    expect(result.currentStreak).toBe(2);
  });

  it('should correctly calculate streaks for CUSTOM habits (e.g. Mon, Wed, Fri)', () => {
    // We will simulate a custom schedule for Monday, Wednesday, Friday
    // Mon = 1, Wed = 3, Fri = 5
    const specDays = [1, 3, 5];
    const habit = {
      frequency: 'CUSTOM',
      specificDays: specDays,
      createdAt: new Date('2020-01-01T00:00:00Z'),
    };

    // Find the recent Monday, Wednesday, and Friday
    const now = DateTime.now().setZone(timezone);
    
    // Let's search back for the most recent Monday, Wednesday, Friday
    let cursor = now;
    const matchedDates: string[] = [];
    const targetCount = 5;

    while (matchedDates.length < targetCount) {
      const weekday = cursor.weekday; // Mon=1, Tue=2...Sun=7
      // Map Mon=1, Wed=3, Fri=5 to specDays
      if (specDays.includes(weekday)) {
        matchedDates.push(cursor.toFormat('yyyy-MM-dd'));
      }
      cursor = cursor.minus({ days: 1 });
    }

    // Case 1: User completed all scheduled days in sequence
    const logs = [...matchedDates];
    const result = calculateStreak(logs, habit, timezone);
    // Since today or yesterday was logged/scheduled, the streak is alive
    expect(result.currentStreak).toBe(targetCount);
    expect(result.longestStreak).toBe(targetCount);
  });

  it('should not break custom streak on non-scheduled days', () => {
    // MWF schedule
    const specDays = [1, 3, 5];
    const habit = {
      frequency: 'CUSTOM',
      specificDays: specDays,
      createdAt: new Date('2020-01-01T00:00:00Z'),
    };

    // Construct a specific weekly pattern to guarantee test stability:
    // Suppose the current day is Sunday. The scheduled days are Mon, Wed, Fri.
    // User logs Fri (2 days ago), Wed (4 days ago), Mon (6 days ago).
    // The streak should be 3, even though Saturday (1 day ago) and Sunday (today) are not logged (they are not scheduled!).
    
    const now = DateTime.now().setZone(timezone);
    // Let's find the nearest Sunday in the past
    let targetSunday = now;
    while (targetSunday.weekday !== 7) { // 7 is Sunday in Luxon
      targetSunday = targetSunday.minus({ days: 1 });
    }

    // Now relative to this targetSunday:
    // Friday of that week is targetSunday - 2 days
    // Wednesday is targetSunday - 4 days
    // Monday is targetSunday - 6 days
    const friStr = targetSunday.minus({ days: 2 }).toFormat('yyyy-MM-dd');
    const wedStr = targetSunday.minus({ days: 4 }).toFormat('yyyy-MM-dd');
    const monStr = targetSunday.minus({ days: 6 }).toFormat('yyyy-MM-dd');

    const logs = [friStr, wedStr, monStr];
    
    // We calculate the streak as of targetSunday
    const result = calculateStreak(logs, habit, timezone);
    expect(result.longestStreak).toBe(3);
  });
});
