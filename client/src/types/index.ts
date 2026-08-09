export interface User {
  id: string;
  email: string;
  timezone: string;
  createdAt: string;
}

export type FrequencyType = 'DAILY' | 'WEEKLY' | 'CUSTOM';

export interface HabitLog {
  id: string;
  habitId: string;
  date: string; // YYYY-MM-DD
  completedAt: string;
}

export interface Habit {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  frequency: FrequencyType;
  specificDays: number[]; // 0 (Sun) to 6 (Sat)
  currentStreak: number;
  longestStreak: number;
  createdAt: string;
  updatedAt: string;
  logs?: HabitLog[];
}

export interface ReminderSetting {
  id: string;
  userId: string;
  time: string; // HH:MM
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
}
