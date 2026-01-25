// Increment this version string to force an update on user devices
const APP_VERSION = 'v2.6.0';
const CACHE_NAME = `pdf-toolkit-${APP_VERSION}`;

// STRICT: Only cache LOCAL files during install.
// Do NOT put CDNs here. They cause CORS errors that kill the installation.
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
      // We use map -> catch to ensure that if one local file is missing, 
      // it doesn't crash the entire installation.
      return Promise.all(
        ASSETS_TO_CACHE.map(url => {
          return cache.add(url).catch(err => {
            console.warn(`Failed to cache ${url} during install:`, err);
          });
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  // Logic to identify third-party assets (CDNs)
  const isCdn = url.includes('cdn') || 
                url.includes('unpkg') || 
                url.includes('cdnjs') ||
                url.includes('fonts.googleapis') ||
                url.includes('fonts.gstatic');
  
  const isLocalAsset = url.includes('icons/') || 
                       url.includes('manifest.json');

  // Strategy: Stale-While-Revalidate for CDNs and Assets
  // This allows the app to load instantly from cache, while updating in the background.
  if (isCdn || isLocalAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // 1. Return cached response immediately if found
        if (cachedResponse) {
            // Background update (lazy cache) - keep cache fresh
            fetch(event.request).then((response) => {
                if (response && response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
            }).catch(() => { /* mute background errors */ });
            
            return cachedResponse;
        }
        
        // 2. If not in cache, fetch from network
        return fetch(event.request).then((response) => {
          // Cache valid responses (opaque is okay for CDNs)
          if (!response || (response.status !== 200 && response.type !== 'opaque')) {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        }).catch(() => {
           // Return undefined if offline and not cached (browser handles error)
        });
      })
    );
  } else {
    // Network First for HTML/Main App to ensure version updates
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
            console.log('Cleaning up old cache:', cacheName);
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