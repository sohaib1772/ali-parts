import { useEffect, useState } from "react";

const CACHE_NAME = "app-videos-v1";
const MAX_ENTRIES = 8; // keep last N videos cached
const memoryBlobUrls = new Map<string, string>();

export async function clearVideoCache(): Promise<number> {
  let count = 0;
  // Revoke in-memory blob URLs from this session.
  for (const url of memoryBlobUrls.values()) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
  memoryBlobUrls.clear();
  if (typeof window === "undefined" || !("caches" in window)) return 0;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    count = keys.length;
    await Promise.all(keys.map((k) => cache.delete(k)));
    await caches.delete(CACHE_NAME);
  } catch {
    // ignore
  }
  return count;
}

export async function getVideoCacheSize(): Promise<number> {
  if (typeof window === "undefined" || !("caches" in window)) return 0;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    return keys.length;
  } catch {
    return 0;
  }
}

async function trimCache(cache: Cache, keepUrl: string) {
  try {
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES) return;
    const removable = keys.filter((r) => r.url !== keepUrl);
    const excess = keys.length - MAX_ENTRIES;
    for (let i = 0; i < excess && i < removable.length; i++) {
      await cache.delete(removable[i]);
    }
  } catch {
    // ignore
  }
}

/**
 * Returns a URL for the given video, backed by the Cache Storage API so that
 * repeat visits play instantly even on weak connections. Falls back to the
 * original URL if caching is unavailable or fails.
 */
export function useCachedVideo(url: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(url ?? null);

  useEffect(() => {
    if (!url) {
      setResolved(null);
      return;
    }
    // Serve original immediately so playback can start while we cache.
    setResolved(url);

    if (typeof window === "undefined" || !("caches" in window)) return;

    let cancelled = false;
    let idleHandle: number | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      // Reuse an existing blob URL from this session if we have one.
      const memHit = memoryBlobUrls.get(url);
      if (memHit) {
        if (!cancelled) setResolved(memHit);
        return;
      }
      try {
        const cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(url);
        if (hit) {
          // Repeat visit: swap to a local blob URL for instant playback.
          const blob = await hit.blob();
          if (cancelled) return;
          const objUrl = URL.createObjectURL(blob);
          memoryBlobUrls.set(url, objUrl);
          setResolved(objUrl);
          return;
        }
        // First visit: don't double-download. Let the <video> element load
        // over the network normally, then quietly warm the cache from the
        // browser's HTTP cache so the next visit is instant.
        setTimeout(async () => {
          if (cancelled) return;
          try {
          const fresh = await fetch(url, { mode: "cors", credentials: "omit" });
          if (!fresh.ok) return;
            await cache.put(url, fresh);
          void trimCache(cache, url);
          } catch { /* ignore */ }
        }, 8000);
      } catch {
        // network/CORS/quota — silently keep the original url
      }
    };

    // Defer to idle time so the fetch doesn't compete with the page load.
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      idleHandle = w.requestIdleCallback(() => { void run(); }, { timeout: 3000 });
    } else {
      timeoutHandle = setTimeout(() => { void run(); }, 1500);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== undefined && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle) clearTimeout(timeoutHandle);
    };
  }, [url]);

  return resolved;
}