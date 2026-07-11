// Service Worker for KPOS PWA
// @ts-nocheck

const CACHE_NAME = 'kpos-v3';
const STATIC_ASSETS = [
    '/',
    '/login',
    '/pos',
    '/offline.html',
    '/manifest.json',
];

// Install event — cache static assets and take over immediately
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate event — delete old caches (including any Workbox caches)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
        )
    );
    self.clients.claim();
});

// Push event — show browser notification
self.addEventListener('push', (event) => {
    let payload = { title: 'KPOS', body: 'New notification', tag: 'kpos', icon: '/favicon.svg' };
    if (event.data) {
        try {
            const data = event.data.json();
            payload = { title: data.title || 'KPOS', body: data.body || '', tag: data.tag || 'kpos', icon: '/favicon.svg', ...data };
        } catch {}
    }
    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            tag: payload.tag,
            icon: payload.icon,
            badge: '/favicon.svg',
            data: payload.data,
        })
    );
});

// Notification click — focus existing tab or open new one
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            const existing = windowClients.find((c) => c.url.includes(self.location.origin));
            if (existing) return existing.focus();
            return clients.openWindow('/');
        })
    );
});

// Fetch event — network first, offline.html fallback for navigation
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    // Skip non-http(s) schemes (e.g. chrome-extension://)
    if (!event.request.url.startsWith('http')) return;
    if (event.request.url.includes('/api/')) return;

    const isNavigation = event.request.mode === 'navigate';

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                return response;
            })
            .catch(async () => {
                const cached = await caches.match(event.request);
                if (cached) return cached;
                if (isNavigation) return caches.match('/offline.html');
            })
    );
});
