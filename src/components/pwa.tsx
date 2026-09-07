"use client";

import { useEffect } from "react";

// Registers the service worker that makes the site installable on a phone.
// Browsers only allow it on https or localhost, so on a plain LAN address
// this quietly does nothing (Add to Home Screen still works on iOS).
export function Pwa() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
