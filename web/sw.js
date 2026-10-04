// Service Worker for PWA - Advanced Caching Strategy
const CACHE_NAME = 'autoverify-v12';
const STATIC_CACHE = 'static-v12';
const DYNAMIC_CACHE = 'dynamic-v12';

// Static assets to cache immediately
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './web-utils.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    'https://telegram.org/js/telegram-web-app.js'
];


// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            console.log('[SW] Caching static assets');
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
                    .map(key => caches.delete(key))
            );
        })
    );
    return self.clients.claim();
});

// Fetch event - Network First, fallback to Cache
self.addEventListener('fetch', (event) => {
    // Skip caching for API requests and POST method
    if (event.request.url.includes('/api/') || event.request.method !== 'GET') {
        return; 
    }

    event.respondWith(
        fetch(event.request)
            .then((res) => {
                // Only cache successful GET responses
                if (!res || res.status !== 200 || res.type !== 'basic') {
                    return res;
                }
                // Clone response for caching
                const resClone = res.clone();
                caches.open(DYNAMIC_CACHE).then((cache) => {
                    cache.put(event.request, resClone);
                });
                return res;
            })
            .catch(() => {
                // Fallback to cache if network fails
                return caches.match(event.request);
            })
    );
});
