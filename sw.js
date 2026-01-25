// Increment this version string to force an update on user devices
const APP_VERSION = 'v2.5.0';
const CACHE_NAME = `pdf-toolkit-${APP_VERSION}`;

// CRITICAL FIX: Only cache LOCAL files during install.
// External files (CDNs) caused CORS errors which killed the SW installation.
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
      // We use map to handle individual file failures gracefully
      return Promise.all(
        ASSETS_TO_CACHE.map(url => {
          return cache.add(url).catch(err => {
            console.warn(`Failed to cache ${url}:`, err);
          });
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const isCdn = event.request.url.includes('cdn') || 
                event.request.url.includes('unpkg') || 
                event.request.url.includes('cdnjs');
  
  const isAsset = event.request.url.includes('icons/') || 
                  event.request.url.includes('manifest.json');

  // Cache Strategy: Stale-While-Revalidate for CDNs and Assets
  if (isCdn || isAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // Return cached response immediately if available
        if (cachedResponse) {
            // Update cache in background
            fetch(event.request).then((response) => {
                if (response && response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
            }).catch(() => {}); // Eat errors in background fetch
            return cachedResponse;
        }
        
        // If not in cache, fetch it
        return fetch(event.request).then((response) => {
          // Check if valid response. Note: Opaque responses (type 'opaque') are common for CDNs and ARE cacheable
          if (!response || (response.status !== 200 && response.type !== 'opaque')) {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        }).catch((err) => {
           console.warn('Fetch failed', err);
           // If offline and not in cache, we can't do anything for CDNs
        });
      })
    );
  } else {
    // Network First for everything else (like index.html) to ensure updates
    event.respondWith(
      fetch(event.request)
        .then((response) => {
           const responseToCache = response.clone();
           caches.open(CACHE_NAME).then((cache) => {
             cache.put(event.request, responseToCache);
           });
           return response;
        })
        .catch(() => caches.match(event.request))
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