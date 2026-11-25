'use strict';

// Maintenance kill-switch. Any legacy Flutter app-shell worker that updates to
// this version clears its own caches and unregisters, so a visitor who still had
// the app cached is moved onto the maintenance page instead of a stale shell.
// It intercepts nothing (no fetch handler), so the network always wins.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => /^flutter/i.test(key)).map((key) => caches.delete(key)),
      );
    } catch (e) {
      /* cache cleanup is best effort */
    }
    try {
      await self.registration.unregister();
    } catch (e) {
      /* unregister is best effort */
    }
  })());
});
