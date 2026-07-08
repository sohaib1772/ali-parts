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

    (async () => {
      // Reuse an existing blob URL from this session if we have one.
      const memHit = memoryBlobUrls.get(url);
      if (memHit) {
        if (!cancelled) setResolved(memHit);
        return;
      }
      try {
        const cache = await caches.open(CACHE_NAME);
        let response = await cache.match(url);
        if (!response) {
          const fresh = await fetch(url, { mode: "cors", credentials: "omit" });
          if (!fresh.ok) return;
          // Clone before consuming; put() consumes the body.
          await cache.put(url, fresh.clone());
          response = fresh;
          void trimCache(cache, url);
        }
        const blob = await response.blob();
        if (cancelled) return;
        const objUrl = URL.createObjectURL(blob);
        memoryBlobUrls.set(url, objUrl);
        setResolved(objUrl);
      } catch {
        // network/CORS/quota — silently keep the original url
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return resolved;
}