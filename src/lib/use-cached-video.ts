import { useEffect, useState } from "react";

const CACHE_NAME = "app-videos-v1";
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

/**
 * Lightweight video URL hook. It no longer downloads full videos in the
 * background because that made navigation heavy on weak devices/connections.
 */
export function useCachedVideo(url: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(url ?? null);

  useEffect(() => {
    if (!url) {
      setResolved(null);
      return;
    }
    setResolved(url);
  }, [url]);

  return resolved;
}