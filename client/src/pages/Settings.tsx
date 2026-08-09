import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../services/api.js';
import { Globe, Bell, Shield, CheckCircle, AlertTriangle, Loader2, Save } from 'lucide-react';

const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC (GMT+00:00)' },
  { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
  { value: 'Europe/London', label: 'London (GMT+00:00)' },
  { value: 'Europe/Paris', label: 'Paris (GMT+01:00)' },
  { value: 'Asia/Kolkata', label: 'India Standard Time (GMT+05:30)' },
  { value: 'Asia/Singapore', label: 'Singapore (GMT+08:00)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (GMT+09:00)' },
  { value: 'Australia/Sydney', label: 'Sydney (GMT+10:00)' },
];

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const base64Encode = (arrayBuffer: ArrayBuffer) => {
  return btoa(
    Array.from(new Uint8Array(arrayBuffer))
      .map((val) => String.fromCharCode(val))
      .join('')
  );
};

export const Settings: React.FC = () => {
  const { user, updateUserTimezone } = useAuth();

  // Settings State
  const [selectedTimezone, setSelectedTimezone] = useState(user?.timezone || 'UTC');
  const [reminderTime, setReminderTime] = useState('20:00');
  const [reminderEnabled, setReminderEnabled] = useState(true);

  // Status & Feedback States
  const [timezoneStatus, setTimezoneStatus] = useState<{ success?: string; error?: string }>({});
  const [reminderStatus, setReminderStatus] = useState<{ success?: string; error?: string }>({});
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  
  const [isTimezoneLoading, setIsTimezoneLoading] = useState(false);
  const [isReminderLoading, setIsReminderLoading] = useState(false);
  const [isPushLoading, setIsPushLoading] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  // Load current settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get('/reminders/settings');
        setReminderTime(res.data.data.settings.time);
        setReminderEnabled(res.data.data.settings.enabled);
      } catch (err) {
        console.error('Failed to load reminder settings', err);
      }
    };
    fetchSettings();

    // Check current push notification permission status
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        setPushStatus('Enabled');
      } else if (Notification.permission === 'denied') {
        setPushStatus('Blocked by browser');
      } else {
        setPushStatus('Not enabled');
      }
    } else {
      setPushStatus('Not supported by this browser');
    }
  }, []);

  // Update Timezone Handler
  const handleSaveTimezone = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTimezoneLoading(true);
    setTimezoneStatus({});

    try {
      await api.put('/auth/timezone', { timezone: selectedTimezone });
      updateUserTimezone(selectedTimezone);
      setTimezoneStatus({ success: 'Timezone updated successfully!' });
    } catch (err: any) {
      setTimezoneStatus({ error: err.response?.data?.message || 'Failed to update timezone.' });
    } finally {
      setIsTimezoneLoading(false);
    }
  };

  // Update Reminders Handler
  const handleSaveReminders = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsReminderLoading(true);
    setReminderStatus({});

    try {
      await api.put('/reminders/settings', {
        time: reminderTime,
        enabled: reminderEnabled,
      });
      setReminderStatus({ success: 'Reminder settings saved!' });
    } catch (err: any) {
      setReminderStatus({ error: err.response?.data?.message || 'Failed to save reminders.' });
    } finally {
      setIsReminderLoading(false);
    }
  };

  // Subscribe to Web Push Handler
  const handleEnablePush = async () => {
    setIsPushLoading(true);
    setPushError(null);

    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push notifications are not supported in this browser.');
      }

      // 1. Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission denied by user.');
      }

      // 2. Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      
      // Wait until SW is ready
      await navigator.serviceWorker.ready;

      // 3. Subscribe to push messaging
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error('VAPID Public Key configuration is missing.');
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      // 4. Encode keys and send to backend
      const p256dh = subscription.getKey('p256dh');
      const auth = subscription.getKey('auth');

      if (!p256dh || !auth) {
        throw new Error('Subscription keys not generated correctly by browser.');
      }

      const subscriptionData = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: base64Encode(p256dh),
          auth: base64Encode(auth),
        },
      };

      await api.post('/reminders/subscribe', subscriptionData);
      setPushStatus('Enabled');
    } catch (err: any) {
      setPushError(err.message || 'An error occurred during push registration.');
    } finally {
      setIsPushLoading(false);
    }
  };

  return (
    <div style={{ padding: '32px 0', maxWidth: '800px', margin: '0 auto' }} className="fade-in-up">
      <h1 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '8px' }} className="gradient-text-primary">
        Account Settings
      </h1>
      <p style={{ color: 'hsl(var(--text-secondary))', marginBottom: '40px' }}>
        Configure your schedule, local boundaries, and reminder systems.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {/* 1. Timezone Settings */}
        <div className="glass-card" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <Globe size={20} style={{ color: 'hsl(var(--primary))' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Timezone Boundaries</h3>
          </div>
          
          <p style={{ fontSize: '14px', color: 'hsl(var(--text-secondary))', marginBottom: '20px', lineHeight: 1.5 }}>
            Your timezone sets the day boundaries (`00:00` to `23:59`) for completing your habits. 
            Changing this will shift the definition of "Today" and "Yesterday" relative to your logs.
          </p>

          {timezoneStatus.success && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: 'var(--radius-md)',
              color: 'hsl(var(--success))',
              fontSize: '14px',
              marginBottom: '20px'
            }}>
              <CheckCircle size={16} />
              <span>{timezoneStatus.success}</span>
            </div>
          )}

          {timezoneStatus.error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 'var(--radius-md)',
              color: 'hsl(var(--error))',
              fontSize: '14px',
              marginBottom: '20px'
            }}>
              <AlertTriangle size={16} />
              <span>{timezoneStatus.error}</span>
            </div>
          )}

          <form onSubmit={handleSaveTimezone} style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selectedTimezone}
              onChange={(e) => setSelectedTimezone(e.target.value)}
              style={{
                flex: 1,
                minWidth: '240px',
                padding: '12px',
                background: 'rgba(23, 28, 42, 0.95)',
                border: '1px solid hsl(var(--border-subtle))',
                borderRadius: 'var(--radius-md)',
                color: 'white',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {COMMON_TIMEZONES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            
            <button
              type="submit"
              disabled={isTimezoneLoading}
              style={{
                padding: '12px 20px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid hsl(var(--border-subtle))',
                borderRadius: 'var(--radius-md)',
                color: 'white',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
            >
              {isTimezoneLoading ? <Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
              Update Boundaries
            </button>
          </form>
        </div>

        {/* 2. Reminder Settings */}
        <div className="glass-card" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <Bell size={20} style={{ color: 'hsl(var(--accent))' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Daily Reminder Trigger</h3>
          </div>

          <p style={{ fontSize: '14px', color: 'hsl(var(--text-secondary))', marginBottom: '20px', lineHeight: 1.5 }}>
            Configure when you would like to be reminded about outstanding daily habits. Reminders are only triggered if you have uncompleted items.
          </p>

          {reminderStatus.success && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: 'var(--radius-md)',
              color: 'hsl(var(--success))',
              fontSize: '14px',
              marginBottom: '20px'
            }}>
              <CheckCircle size={16} />
              <span>{reminderStatus.success}</span>
            </div>
          )}

          <form onSubmit={handleSaveReminders} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="checkbox"
                id="enableReminders"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  accentColor: 'hsl(var(--accent))',
                  cursor: 'pointer'
                }}
              />
              <label htmlFor="enableReminders" style={{ fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                Enable daily reminder notification email/push triggers
              </label>
            </div>

            {reminderEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '14px', color: 'hsl(var(--text-secondary))' }}>Send reminder daily at:</span>
                <input
                  type="time"
                  required
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    background: 'rgba(23, 28, 42, 0.95)',
                    border: '1px solid hsl(var(--border-subtle))',
                    borderRadius: 'var(--radius-md)',
                    color: 'white',
                    outline: 'none',
                    fontSize: '14px'
                  }}
                />
                <span style={{ fontSize: '13px', color: 'hsl(var(--text-muted))' }}>(in local timezone)</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isReminderLoading}
              style={{
                alignSelf: 'flex-start',
                padding: '12px 20px',
                background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, #4f46e5 100%)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'white',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(93, 58, 230, 0.2)'
              }}
            >
              {isReminderLoading ? <Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
              Save Reminder Settings
            </button>
          </form>
        </div>

        {/* 3. Push Notifications Setup */}
        <div className="glass-card" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <Shield size={20} style={{ color: 'hsl(var(--accent))' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Push Subscriptions</h3>
          </div>

          <p style={{ fontSize: '14px', color: 'hsl(var(--text-secondary))', marginBottom: '20px', lineHeight: 1.5 }}>
            Subscribe this browser to receive web push notifications when reminders trigger.
          </p>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '24px',
            fontSize: '14px'
          }}>
            <span style={{ color: 'hsl(var(--text-secondary))' }}>Current Status:</span>
            <span style={{
              fontWeight: 700,
              color: pushStatus === 'Enabled' ? 'hsl(var(--success))' : 'hsl(var(--warning))'
            }}>
              {pushStatus}
            </span>
          </div>

          {pushError && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 'var(--radius-md)',
              color: 'hsl(var(--error))',
              fontSize: '14px',
              marginBottom: '20px'
            }}>
              <AlertTriangle size={16} />
              <span>{pushError}</span>
            </div>
          )}

          {pushStatus !== 'Enabled' && (
            <button
              onClick={handleEnablePush}
              disabled={isPushLoading}
              style={{
                padding: '12px 20px',
                background: 'linear-gradient(135deg, hsl(var(--accent)) 0%, #059669 100%)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'white',
                fontWeight: 700,
                fontSize: '14px',
                cursor: isPushLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(5, 196, 171, 0.2)'
              }}
            >
              {isPushLoading ? <Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> : null}
              Enable Push Notifications
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
