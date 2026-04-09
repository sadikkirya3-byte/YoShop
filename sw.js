const CACHE_NAME = 'yobill-v12'; // Increment cache version to apply changes
const urlsToCache = [
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',
  'assets/icons/icon-192x192.png',
  'assets/icons/icon-512x512.png',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.29/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js'
];

self.addEventListener('install', (event) => {
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        // Cache files individually. If one fails, it won't stop the others.
        return Promise.all(
          urlsToCache.map((url) => {
            return cache.add(url).catch((err) => {
              console.error('Failed to cache:', url, err);
            });
          })
        );
      })
  );
});

self.addEventListener('fetch', (event) => {
  // Stale-While-Revalidate strategy
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request, { ignoreSearch: true });
      const networkPromise = fetch(event.request).then((networkResponse) => {
        // Update cache with the new network response
        // Only cache successful same-origin or CORS responses
        if (networkResponse && networkResponse.status === 200) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      }).catch(() => {
        // If network fails and no cached response, and it's a navigation request,
        // try to return the offline page (index.html)
        if (!cachedResponse && event.request.mode === 'navigate') {
          return cache.match('/index.html');
        }
        // If network fails and there's no cached response, and it's not a navigation request,
        // or if it's a navigation request but index.html isn't cached, throw an error or return a generic offline response.
        throw new Error('Network request failed and no cache available.');
      });

      // Return cached response immediately if available, otherwise wait for network
      return cachedResponse || networkPromise;
    })
  );
});

// Listen for message from client to force update
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});