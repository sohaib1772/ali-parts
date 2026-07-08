import { useEffect, useRef, useState } from "react";

const CACHE_NAME = "app-videos-v1";
const memoryBlobUrls = new Map<string, string>();
const inflightWarm = new Set<string>();
const prefetchQueue: string[] = [];
let prefetchRunning = 0;
const MAX_PREFETCH_CONCURRENCY = 1;
let prefetchPaused = false;

/**
 * Temporarily pause background prefetching (e.g. while the active video is
 * still buffering) so it doesn't compete for bandwidth and cause stutter.
 */
export function setPrefetchPaused(paused: boolean): void {
  prefetchPaused = paused;
  if (!paused) drainPrefetchQueue();
}

function drainPrefetchQueue(): void {
  if (prefetchPaused) return;
  while (prefetchRunning < MAX_PREFETCH_CONCURRENCY && prefetchQueue.length) {
    const url = prefetchQueue.shift()!;
    if (memoryBlobUrls.has(url)) { inflightWarm.delete(url); continue; }
    prefetchRunning += 1;
    fetchAndCache(url).finally(() => {
      prefetchRunning -= 1;
      inflightWarm.delete(url);
      drainPrefetchQueue();
    });
  }
}

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

async function readCachedBlob(url: string): Promise<string | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(url);
    if (!res) return null;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    memoryBlobUrls.set(url, objUrl);
    return objUrl;
  } catch {
    return null;
  }
}

async function fetchAndCache(url: string): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const existing = await cache.match(url);
    if (existing) return;
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return;
    const len = Number(res.headers.get("content-length") ?? 0);
    // Only cache reasonably-sized videos (< 25MB) to avoid quota abuse.
    if (len > 25 * 1024 * 1024) return;
    await cache.put(url, res.clone());
  } catch {
    /* ignore */
  }
}

function warmCache(url: string): void {
  if (typeof window === "undefined" || !("caches" in window)) return;
  if (inflightWarm.has(url)) return;
  inflightWarm.add(url);
  const kickoff = () => {
    fetchAndCache(url).finally(() => inflightWarm.delete(url));
  };
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout?: number }) => number)
    | undefined;
  if (ric) ric(kickoff, { timeout: 4000 });
  else window.setTimeout(kickoff, 2500);
}

/**
 * Eagerly prefetch a video into Cache Storage without waiting for idle time.
 * Safe to call multiple times — dedupes against in-flight warms.
 */
export function prefetchVideo(url: string | null | undefined): void {
  if (!url) return;
  if (typeof window === "undefined" || !("caches" in window)) return;
  if (memoryBlobUrls.has(url)) return;
  if (inflightWarm.has(url)) return;
  inflightWarm.add(url);
  prefetchQueue.push(url);
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout?: number }) => number)
    | undefined;
  if (ric) ric(() => drainPrefetchQueue(), { timeout: 2000 });
  else window.setTimeout(() => drainPrefetchQueue(), 300);
}

/**
 * Attach to an element to prefetch a video when it approaches the viewport.
 * Uses IntersectionObserver with a generous rootMargin so the video is
 * warmed BEFORE the user scrolls to it — playback starts near-instantly.
 */
export function usePrefetchNearbyVideo(
  url: string | null | undefined,
  options?: { rootMargin?: string; root?: Element | null },
): (node: Element | null) => void {
  const rootMargin = options?.rootMargin ?? "200% 0px";
  const root = options?.root ?? null;
  const observerRef = useRef<IntersectionObserver | null>(null);
  const nodeRef = useRef<Element | null>(null);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  return (node: Element | null) => {
    if (nodeRef.current === node) return;
    observerRef.current?.disconnect();
    nodeRef.current = node;
    if (!node || !url) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      prefetchVideo(url);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            prefetchVideo(url);
            io.disconnect();
            observerRef.current = null;
            break;
          }
        }
      },
      { root, rootMargin, threshold: 0 },
    );
    io.observe(node);
    observerRef.current = io;
  };
}

/**
 * Smart video URL hook:
 * - Returns the network URL immediately so playback starts without delay.
 * - If a cached copy exists (from a prior visit), swaps to a local blob URL
 *   for instant, offline-friendly playback.
 * - Warms the Cache Storage entry silently during idle time so the NEXT visit
 *   is instant even on weak connections.
 */
export function useCachedVideo(url: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(url ?? null);

  useEffect(() => {
    if (!url) {
      setResolved(null);
      return;
    }
    // 1) In-memory blob URL from this session — instant reuse.
    const mem = memoryBlobUrls.get(url);
    if (mem) {
      setResolved(mem);
      return;
    }
    // 2) Start with the raw URL so playback begins immediately.
    setResolved(url);
    // 3) Try Cache Storage for a persisted blob (from a previous visit).
    let cancelled = false;
    readCachedBlob(url).then((blob) => {
      if (!cancelled && blob) setResolved(blob);
    });
    // 4) Warm the cache in the background for next time.
    warmCache(url);
    return () => { cancelled = true; };
  }, [url]);

  return resolved;
}