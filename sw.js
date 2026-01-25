// Increment this version string to force an update on user devices
const APP_VERSION = 'v2.0.4';
const CACHE_NAME = `pdf-toolkit-${APP_VERSION}`;

// ONLY cache local files during install. 
// External CDNs are cached at runtime to prevent installation failures due to CORS/Redirects.
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  //'./icon.svg'
];

self.addEventListener('install', (event) => {
  // skipWaiting ensures the new SW activates immediately, replacing the broken one
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Cache-first strategy for CDN libraries and Assets to ensure offline access
  const isCdn = event.request.url.includes('cdn') || 
                event.request.url.includes('unpkg') || 
                event.request.url.includes('cdnjs');
  
  const isAsset = event.request.url.includes('assets/') || 
                  event.request.url.includes('icon.svg');

  if (isCdn || isAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        
        // Important: For CORS requests (like scripts), we might need to handle opaque responses
        return fetch(event.request).then((response) => {
          // Allow caching of opaque responses (status 0, type 'opaque') for CDNs
          // Standard check: response.status === 200 OR response.type === 'opaque'
          if (!response || (response.status !== 200 && response.type !== 'opaque') || response.type === 'error') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        }).catch((err) => {
           console.warn('Fetch failed for', event.request.url, err);
           // Fallback? For now just return undefined to let browser handle error
        });
      })
    );
  } else {
    // Network first for local files (like index.html), fallback to cache
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});

self.addEventListener('activate', (event) => {
  // Claim clients immediately so the new SW controls the page without a reload
  event.waitUntil(self.clients.claim());
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
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