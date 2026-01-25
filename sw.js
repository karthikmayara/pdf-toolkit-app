// Increment this version string to force an update on user devices
const APP_VERSION = 'v2.3.0';
const CACHE_NAME = `pdf-toolkit-${APP_VERSION}`;

// ONLY cache local files during install. 
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
          console.warn('Cache addAll failed', err);
          // Don't fail install if icons aren't generated yet
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  const isCdn = event.request.url.includes('cdn') || 
                event.request.url.includes('unpkg') || 
                event.request.url.includes('cdnjs');
  
  // Cache icons folder and manifest
  const isAsset = event.request.url.includes('icons/') || 
                  event.request.url.includes('manifest.json');

  if (isCdn || isAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        
        return fetch(event.request).then((response) => {
          if (!response || (response.status !== 200 && response.type !== 'opaque') || response.type === 'error') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        }).catch((err) => {
           // Network failure
        });
      })
    );
  } else {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});