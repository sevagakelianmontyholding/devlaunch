// Minimal service worker: makes DevLaunch installable as an app. It never
// caches anything, so every screen is always live data from this Mac.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
