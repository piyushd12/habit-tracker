import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../services/api.js';
import type { Habit, FrequencyType } from '../types/index.js';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { 
  Plus, Calendar, Flame, Trophy, CheckCircle2, Circle, 
  Trash2, Edit3, Loader2, Sparkles, X
} from 'lucide-react';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const timezone = user?.timezone || 'UTC';

  // State for Create / Edit Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);

  // Form State
  const [habitName, setHabitName] = useState('');
  const [habitDesc, setHabitDesc] = useState('');
  const [habitFreq, setHabitFreq] = useState<FrequencyType>('DAILY');
  const [specificDays, setSpecificDays] = useState<number[]>([]); // 0=Sun, 6=Sat

  // Fetch Habits List
  const { data: habitsData, isLoading, isError, error } = useQuery({
    queryKey: ['habits'],
    queryFn: async () => {
      const res = await api.get('/habits');
      return res.data.data.habits as Habit[];
    },
  });

  // Create Habit Mutation
  const createMutation = useMutation({
    mutationFn: async (newHabit: { name: string; description: string; frequency: FrequencyType; specificDays: number[] }) => {
      return api.post('/habits', newHabit);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      setIsCreateOpen(false);
      resetForm();
    },
  });

  // Edit Habit Mutation
  const editMutation = useMutation({
    mutationFn: async (updated: { id: string; name: string; description: string; frequency: FrequencyType; specificDays: number[] }) => {
      return api.put(`/habits/${updated.id}`, {
        name: updated.name,
        description: updated.description,
        frequency: updated.frequency,
        specificDays: updated.specificDays,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      setIsEditOpen(false);
      setSelectedHabit(null);
      resetForm();
    },
  });

  // Delete Habit Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/habits/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      setIsEditOpen(false);
      setSelectedHabit(null);
    },
  });

  // Toggle Log Mutation (Idempotent Post / Delete)
  const toggleLogMutation = useMutation({
    mutationFn: async ({ habitId, date, isLogged }: { habitId: string; date: string; isLogged: boolean }) => {
      if (isLogged) {
        // Toggle OFF: delete log
        return api.delete(`/habits/${habitId}/logs/${date}`);
      } else {
        // Toggle ON: create log
        return api.post(`/habits/${habitId}/logs`, { date });
      }
    },
    onMutate: async ({ habitId, date, isLogged }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['habits'] });

      // Snapshot previous value
      const previousHabits = queryClient.getQueryData<Habit[]>(['habits']);

      // Optimistically update cache
      if (previousHabits) {
        queryClient.setQueryData<Habit[]>(['habits'], (old) => {
          if (!old) return [];
          return old.map((h) => {
            if (h.id === habitId) {
              const currentLogs = h.logs || [];
              const updatedLogs = isLogged
                ? currentLogs.filter((l) => l.date !== date)
                : [...currentLogs, { id: 'temp-id', habitId, date, completedAt: new Date().toISOString() }];

              return {
                ...h,
                logs: updatedLogs,
              };
            }
            return h;
          });
        });
      }

      return { previousHabits };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousHabits) {
        queryClient.setQueryData(['habits'], context.previousHabits);
      }
    },
    onSuccess: () => {
      // Invalidate query to pull correctly updated streaks from DB
      queryClient.invalidateQueries({ queryKey: ['habits'] });
    },
  });

  const resetForm = () => {
    setHabitName('');
    setHabitDesc('');
    setHabitFreq('DAILY');
    setSpecificDays([]);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (habit: Habit) => {
    setSelectedHabit(habit);
    setHabitName(habit.name);
    setHabitDesc(habit.description || '');
    setHabitFreq(habit.frequency);
    setSpecificDays(habit.specificDays || []);
    setIsEditOpen(true);
  };

  const handleToggleDay = (dayNum: number) => {
    setSpecificDays((prev) =>
      prev.includes(dayNum) ? prev.filter((d) => d !== dayNum) : [...prev, dayNum]
    );
  };

  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!habitName.trim()) return;
    createMutation.mutate({
      name: habitName,
      description: habitDesc,
      frequency: habitFreq,
      specificDays: habitFreq === 'CUSTOM' ? specificDays : [],
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHabit || !habitName.trim()) return;
    editMutation.mutate({
      id: selectedHabit.id,
      name: habitName,
      description: habitDesc,
      frequency: habitFreq,
      specificDays: habitFreq === 'CUSTOM' ? specificDays : [],
    });
  };

  // Helper: Get list of last 7 calendar days relative to user's timezone
  const getLast7Days = () => {
    const today = DateTime.now().setZone(timezone);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      days.push(today.minus({ days: i }));
    }
    return days;
  };

  // Helper: Get list of last 84 days (12 weeks) for the contribution grid
  const getContributionGridDays = () => {
    const today = DateTime.now().setZone(timezone);
    const days = [];
    // Start from the beginning of the week 11 weeks ago (so Sunday of that week)
    const totalDays = 12 * 7;
    for (let i = totalDays - 1; i >= 0; i--) {
      days.push(today.minus({ days: i }));
    }
    return days;
  };

  // Calculations for stats
  const habitsList = habitsData || [];
  const activeHabitsCount = habitsList.length;
  const longestStreak = habitsList.reduce((max, h) => Math.max(max, h.longestStreak), 0);
  const currentStreak = habitsList.reduce((max, h) => Math.max(max, h.currentStreak), 0);
  
  const todayStr = DateTime.now().setZone(timezone).toFormat('yyyy-MM-dd');
  const todayCompletions = habitsList.filter((h) =>
    (h.logs || []).some((l) => l.date === todayStr)
  ).length;
  const completionRate = activeHabitsCount > 0 
    ? Math.round((todayCompletions / activeHabitsCount) * 100) 
    : 0;

  if (isError) {
    return (
      <div style={{
        height: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '16px',
        textAlign: 'center',
      }}>
        <p style={{ color: 'hsl(var(--error))', fontWeight: 600 }}>Failed to load habits</p>
        <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '14px' }}>
          {error instanceof Error ? error.message : 'Please try again later.'}
        </p>
      </div>
    );
  }

  // Render loading state
  if (isLoading) {
    return (
      <div style={{
        height: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <Loader2 size={36} className="animate-spin" style={{ color: 'hsl(var(--accent))', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'hsl(var(--text-secondary))' }}>Loading your dashboard...</p>
      </div>
    );
  }

  const last7Days = getLast7Days();
  const contribDays = getContributionGridDays();

  // Aggregate completions per day for the contribution grid and chart
  const completionsByDate: { [date: string]: number } = {};
  habitsList.forEach((h) => {
    (h.logs || []).forEach((l) => {
      completionsByDate[l.date] = (completionsByDate[l.date] || 0) + 1;
    });
  });

  const weeklyChartData = last7Days.map((day) => {
    const dateStr = day.toFormat('yyyy-MM-dd');
    return {
      label: day.toFormat('EEE'),
      date: dateStr,
      completions: completionsByDate[dateStr] || 0,
    };
  });

  return (
    <div style={{ padding: '32px 0', maxWidth: '1200px', margin: '0 auto' }} className="fade-in-up">
      {/* 1. Header Section */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '20px',
        marginBottom: '40px'
      }}>
        <div>
          <h1 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '8px' }} className="gradient-text-primary">
            Rituals & Focus
          </h1>
          <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '15px' }}>
            Timezone configured: <span style={{ color: 'white', fontWeight: 600 }}>{timezone}</span>
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          style={{
            padding: '12px 20px',
            background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, #4f46e5 100%)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: 'white',
            fontWeight: 700,
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(93, 58, 230, 0.3)',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <Plus size={18} />
          Create Habit
        </button>
      </div>

      {/* 2. Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '24px',
        marginBottom: '40px'
      }}>
        {/* Total Habits */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(93, 58, 230, 0.1)',
            color: 'hsl(var(--primary))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Calendar size={22} />
          </div>
          <div>
            <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '14px', marginBottom: '4px' }}>Active Habits</p>
            <h3 style={{ fontSize: '24px', fontWeight: 800 }}>{activeHabitsCount}</h3>
          </div>
        </div>

        {/* Current Max Streak */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(249, 115, 22, 0.1)',
            color: '#f97316',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Flame size={22} />
          </div>
          <div>
            <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '14px', marginBottom: '4px' }}>Current Streak</p>
            <h3 style={{ fontSize: '24px', fontWeight: 800 }}>{currentStreak} <span style={{ fontSize: '14px', fontWeight: 400, color: 'hsl(var(--text-muted))' }}>days</span></h3>
          </div>
        </div>

        {/* Longest Streak */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(234, 179, 8, 0.1)',
            color: '#eab308',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Trophy size={22} />
          </div>
          <div>
            <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '14px', marginBottom: '4px' }}>Longest Streak</p>
            <h3 style={{ fontSize: '24px', fontWeight: 800 }}>{longestStreak} <span style={{ fontSize: '14px', fontWeight: 400, color: 'hsl(var(--text-muted))' }}>days</span></h3>
          </div>
        </div>

        {/* Today Completion Rate */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(5, 196, 171, 0.1)',
            color: 'hsl(var(--accent))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '14px', marginBottom: '4px' }}>Completed Today</p>
            <h3 style={{ fontSize: '24px', fontWeight: 800 }}>{completionRate}%</h3>
          </div>
        </div>
      </div>

      {/* 3. Main content grid: Left Habits, Right Analytics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '3fr 2fr',
        gap: '40px',
        alignItems: 'start'
      }}>
        {/* LEFT COLUMN: Habits listing */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '-8px' }}>Active Rituals</h2>

          {habitsList.length === 0 ? (
            <div className="glass-card" style={{
              padding: '60px 40px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px'
            }}>
              <Sparkles size={36} style={{ color: 'hsl(var(--text-muted))' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Create your first habit</h3>
              <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '14px', maxWidth: '360px' }}>
                Consistency is key. Click the "Create Habit" button above to establish your daily or custom routine.
              </p>
            </div>
          ) : (
            habitsList.map((habit) => {
              const activeLogs = habit.logs || [];
              
              return (
                <div key={habit.id} className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Habit Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>{habit.name}</h3>
                      <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '14px', marginBottom: '8px' }}>
                        {habit.description || 'No description provided'}
                      </p>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '100px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: 'hsl(var(--text-secondary))'
                        }}>
                          {habit.frequency === 'DAILY' ? 'DAILY' : habit.frequency === 'WEEKLY' ? 'WEEKLY' : 'CUSTOM'}
                        </span>
                        {habit.frequency === 'CUSTOM' && habit.specificDays && (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '100px',
                            background: 'rgba(5, 196, 171, 0.1)',
                            color: 'hsl(var(--accent))'
                          }}>
                            {habit.specificDays.map((d) => WEEKDAYS[d]).join(', ')}
                          </span>
                        )}
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '100px',
                          background: 'rgba(249, 115, 22, 0.1)',
                          color: '#f97316',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Flame size={12} />
                          {habit.currentStreak}d Streak
                        </span>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '100px',
                          background: 'rgba(234, 179, 8, 0.1)',
                          color: '#eab308',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Trophy size={12} />
                          Max {habit.longestStreak}d
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleOpenEdit(habit)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'hsl(var(--text-muted))',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: 'var(--radius-sm)',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(var(--text-muted))'}
                      >
                        <Edit3 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* 7-day completion checklist */}
                  <div style={{
                    borderTop: '1px solid hsl(var(--border-subtle))',
                    paddingTop: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <span style={{ fontSize: '13px', color: 'hsl(var(--text-secondary))', fontWeight: 600 }}>
                      Recent Tracker
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {last7Days.map((day) => {
                        const dayStr = day.toFormat('yyyy-MM-dd');
                        const isLogged = activeLogs.some((l) => l.date === dayStr);
                        const isToday = dayStr === todayStr;
                        const isYesterday = dayStr === DateTime.now().setZone(timezone).minus({ days: 1 }).toFormat('yyyy-MM-dd');
                        const canToggle = isToday || isYesterday;
                        
                        return (
                          <div
                            key={dayStr}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <span style={{
                              fontSize: '11px',
                              fontWeight: isToday ? 800 : 500,
                              color: isToday ? 'hsl(var(--accent))' : 'hsl(var(--text-muted))'
                            }}>
                              {day.toFormat('ccc')}
                            </span>
                            <button
                              disabled={!canToggle || toggleLogMutation.isPending}
                              onClick={() => toggleLogMutation.mutate({ habitId: habit.id, date: dayStr, isLogged })}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: canToggle ? 'pointer' : 'not-allowed',
                                color: isLogged 
                                  ? 'hsl(var(--accent))' 
                                  : canToggle 
                                    ? 'hsl(var(--text-muted))' 
                                    : 'rgba(255,255,255,0.05)',
                                transition: 'all 0.2s',
                              }}
                            >
                              {isLogged ? (
                                <CheckCircle2 size={24} className="animate-pop" style={{ fill: 'rgba(5, 196, 171, 0.1)' }} />
                              ) : (
                                <Circle size={24} style={{ opacity: canToggle ? 1 : 0.4 }} />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT COLUMN: Analytics/Grid & Guide */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* 7-Day Completion Chart */}
          <div className="glass-panel" style={{ padding: '24px', borderRadius: 'var(--radius-lg)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Weekly Progress</h3>
            <p style={{ fontSize: '13px', color: 'hsl(var(--text-secondary))', marginBottom: '20px' }}>
              Total habit completions over the last 7 days
            </p>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'hsl(var(--text-muted))', fontSize: 12 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: 'hsl(var(--text-muted))', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    contentStyle={{
                      background: 'hsl(var(--bg-elevated))',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      fontSize: '13px',
                    }}
                    labelFormatter={(_, payload) => {
                      const item = payload?.[0]?.payload as { date?: string } | undefined;
                      return item?.date ?? '';
                    }}
                    formatter={(value) => [`${value} completion${value === 1 ? '' : 's'}`, 'Total']}
                  />
                  <Bar
                    dataKey="completions"
                    fill="hsl(var(--accent))"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* GitHub-style Heatmap Grid */}
          <div className="glass-panel" style={{ padding: '24px', borderRadius: 'var(--radius-lg)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Completion Grid</h3>
            <p style={{ fontSize: '13px', color: 'hsl(var(--text-secondary))', marginBottom: '20px' }}>
              Check-off trends for all habits across the last 12 weeks:
            </p>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(12, 1fr)',
              gridAutoRows: 'min-content',
              gap: '4px',
              maxWidth: '100%'
            }}>
              {contribDays.map((day) => {
                const dateStr = day.toFormat('yyyy-MM-dd');
                const completionsCount = completionsByDate[dateStr] || 0;
                
                // Color scaling based on completed count
                let cellColor = 'rgba(255, 255, 255, 0.03)';
                if (completionsCount > 0) {
                  if (completionsCount === 1) cellColor = 'rgba(5, 196, 171, 0.25)';
                  else if (completionsCount === 2) cellColor = 'rgba(5, 196, 171, 0.5)';
                  else cellColor = 'hsl(var(--accent))';
                }

                const tooltipText = `${day.toFormat('LLL dd')}: ${completionsCount} completion${completionsCount === 1 ? '' : 's'}`;

                return (
                  <div
                    key={dateStr}
                    title={tooltipText}
                    className="heatmap-cell"
                    style={{
                      backgroundColor: cellColor,
                      border: '1px solid rgba(255, 255, 255, 0.02)',
                    }}
                  />
                );
              })}
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '16px',
              fontSize: '11px',
              color: 'hsl(var(--text-muted))'
            }}>
              <span>12 weeks ago</span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span>Less</span>
                <div style={{ width: '8px', height: '8px', background: 'rgba(255, 255, 255, 0.03)' }} />
                <div style={{ width: '8px', height: '8px', background: 'rgba(5, 196, 171, 0.25)' }} />
                <div style={{ width: '8px', height: '8px', background: 'rgba(5, 196, 171, 0.5)' }} />
                <div style={{ width: '8px', height: '8px', background: 'hsl(var(--accent))' }} />
                <span>More</span>
              </div>
              <span>Today</span>
            </div>
          </div>

          {/* Quick Guide Panel */}
          <div className="glass-card" style={{ padding: '24px', borderLeft: '3px solid hsl(var(--accent))' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '8px', color: 'hsl(var(--text-primary))' }}>
              Timezone Boundary Protection
            </h4>
            <p style={{ fontSize: '13px', color: 'hsl(var(--text-secondary))', lineHeight: 1.5 }}>
              Completions are tied directly to your local timezone ({timezone}). 
              You can only toggle completions for <strong>Today</strong> or <strong>Yesterday</strong> to protect streak integrity and prevent historical tampering.
            </p>
          </div>
        </div>
      </div>

      {/* --- CREATE HABIT MODAL --- */}
      {isCreateOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="glass-panel fade-in-up" style={{
            width: '100%',
            maxWidth: '500px',
            borderRadius: 'var(--radius-lg)',
            padding: '32px',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 800 }}>Create New Habit</h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                style={{ background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveCreate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>
                  Habit Name
                </label>
                <input
                  type="text"
                  required
                  value={habitName}
                  onChange={(e) => setHabitName(e.target.value)}
                  placeholder="e.g. Morning Meditation"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid hsl(var(--border-subtle))',
                    borderRadius: 'var(--radius-md)',
                    color: 'white',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>
                  Description
                </label>
                <textarea
                  value={habitDesc}
                  onChange={(e) => setHabitDesc(e.target.value)}
                  placeholder="Why is this habit important to you?"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid hsl(var(--border-subtle))',
                    borderRadius: 'var(--radius-md)',
                    color: 'white',
                    outline: 'none',
                    height: '80px',
                    resize: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>
                  Frequency
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {(['DAILY', 'CUSTOM'] as FrequencyType[]).map((freq) => (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => setHabitFreq(freq)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: 'var(--radius-md)',
                        border: habitFreq === freq ? '1px solid hsl(var(--accent))' : '1px solid hsl(var(--border-subtle))',
                        background: habitFreq === freq ? 'rgba(5, 196, 171, 0.1)' : 'rgba(255,255,255,0.01)',
                        color: habitFreq === freq ? 'hsl(var(--accent))' : 'hsl(var(--text-secondary))',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {freq === 'DAILY' ? 'Every Day' : 'Custom Days'}
                    </button>
                  ))}
                </div>
              </div>

              {habitFreq === 'CUSTOM' && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>
                    Select Days
                  </label>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                    {WEEKDAYS.map((dayName, idx) => {
                      const isSelected = specificDays.includes(idx);
                      return (
                        <button
                          key={dayName}
                          type="button"
                          onClick={() => handleToggleDay(idx)}
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '100px',
                            border: isSelected ? '1px solid hsl(var(--accent))' : '1px solid hsl(var(--border-subtle))',
                            background: isSelected ? 'rgba(5, 196, 171, 0.2)' : 'transparent',
                            color: isSelected ? 'hsl(var(--accent))' : 'hsl(var(--text-muted))',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          {dayName[0]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={createMutation.isPending}
                style={{
                  padding: '14px',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '14px',
                  background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, #4f46e5 100%)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginTop: '10px'
                }}
              >
                {createMutation.isPending && <Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />}
                Create Ritual
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT / DELETE HABIT MODAL --- */}
      {isEditOpen && selectedHabit && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="glass-panel fade-in-up" style={{
            width: '100%',
            maxWidth: '500px',
            borderRadius: 'var(--radius-lg)',
            padding: '32px',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 800 }}>Edit Habit Settings</h3>
              <button
                onClick={() => setIsEditOpen(false)}
                style={{ background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>
                  Habit Name
                </label>
                <input
                  type="text"
                  required
                  value={habitName}
                  onChange={(e) => setHabitName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid hsl(var(--border-subtle))',
                    borderRadius: 'var(--radius-md)',
                    color: 'white',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>
                  Description
                </label>
                <textarea
                  value={habitDesc}
                  onChange={(e) => setHabitDesc(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid hsl(var(--border-subtle))',
                    borderRadius: 'var(--radius-md)',
                    color: 'white',
                    outline: 'none',
                    height: '80px',
                    resize: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>
                  Frequency
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {(['DAILY', 'CUSTOM'] as FrequencyType[]).map((freq) => (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => setHabitFreq(freq)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: 'var(--radius-md)',
                        border: habitFreq === freq ? '1px solid hsl(var(--accent))' : '1px solid hsl(var(--border-subtle))',
                        background: habitFreq === freq ? 'rgba(5, 196, 171, 0.1)' : 'rgba(255,255,255,0.01)',
                        color: habitFreq === freq ? 'hsl(var(--accent))' : 'hsl(var(--text-secondary))',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {freq === 'DAILY' ? 'Every Day' : 'Custom Days'}
                    </button>
                  ))}
                </div>
              </div>

              {habitFreq === 'CUSTOM' && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>
                    Select Days
                  </label>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                    {WEEKDAYS.map((dayName, idx) => {
                      const isSelected = specificDays.includes(idx);
                      return (
                        <button
                          key={dayName}
                          type="button"
                          onClick={() => handleToggleDay(idx)}
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '100px',
                            border: isSelected ? '1px solid hsl(var(--accent))' : '1px solid hsl(var(--border-subtle))',
                            background: isSelected ? 'rgba(5, 196, 171, 0.2)' : 'transparent',
                            color: isSelected ? 'hsl(var(--accent))' : 'hsl(var(--text-muted))',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          {dayName[0]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Are you sure you want to permanently delete this habit and all its logged history? This cannot be undone.')) {
                      deleteMutation.mutate(selectedHabit.id);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    background: 'rgba(239, 68, 68, 0.05)',
                    color: 'hsl(var(--error))',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Trash2 size={16} />
                  Delete
                </button>
                <button
                  type="submit"
                  disabled={editMutation.isPending}
                  style={{
                    flex: 2,
                    padding: '12px',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    color: 'white',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, #4f46e5 100%)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {editMutation.isPending && <Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
