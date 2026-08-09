// Service Worker for Habit Tracker Push Notifications

self.addEventListener('push', (event) => {
  if (!event.data) {
    console.log('Push event received but no data payload found.');
    return;
  }

  try {
    const payload = event.data.json();
    const title = payload.title || 'Daily Habit Reminder';
    const options = {
      body: payload.body || 'Keep your streak going! Check off your habits.',
      icon: payload.icon || '/favicon.ico',
      badge: payload.badge || '/favicon.ico',
      data: {
        url: payload.url || '/'
      }
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (error) {
    console.error('Error handling push notification in service worker:', error);
    
    // Fallback notification if parsing JSON failed
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('Habit Tracker Reminder', {
        body: text || 'You have habits to complete today!',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a tab is already open, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If no tab is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
