// Minimal Firebase Cloud Messaging service worker to enable registration
// Vite serves files in /public at the site root with correct MIME type
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAMJjeucsuWiIrOKJ19AK6VT9zLS7ZB6MY",
  authDomain: "medtrackmamdouh.firebaseapp.com",
  projectId: "medtrackmamdouh",
  storageBucket: "medtrackmamdouh.firebasestorage.app",
  messagingSenderId: "588115249832",
  appId: "1:588115249832:web:1e8a2f5dd57db68047909d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const n = payload.notification || {};
  const title = n.title || 'إشعار جديد';
  const options = {
    body: n.body || '',
    icon: n.icon || undefined,
    data: payload.data || {}
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
