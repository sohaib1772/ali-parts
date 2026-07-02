import { useSyncExternalStore } from "react";

const KEY = "order_seen_v1";

type Map = Record<string, string>;

let cache: Map = {};
let cacheRaw: string | null = null;
const EMPTY: Map = {};

function read(): Map {
  if (typeof window === "undefined") return EMPTY;
  const raw = localStorage.getItem(KEY);
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  try {
    cache = raw ? (JSON.parse(raw) as Map) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function readRaw(): Map {
  if (typeof window === "undefined") return EMPTY;
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Map;
  } catch {
    return {};
  }
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useOrderSeenMap(): Map {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function markOrderSeen(orderId: string, updatedAt: string) {
  const m = { ...readRaw() };
  if (m[orderId] === updatedAt) return;
  m[orderId] = updatedAt;
  localStorage.setItem(KEY, JSON.stringify(m));
  cacheRaw = null; // invalidate so next read() returns fresh snapshot
  emit();
}

export function isOrderUnseen(seen: Map, orderId: string, updatedAt: string | null | undefined, createdAt: string) {
  const ref = updatedAt ?? createdAt;
  const last = seen[orderId];
  // first time seeing: only mark as "update" if updated_at is different from created_at
  if (!last) return !!updatedAt && updatedAt !== createdAt;
  return last !== ref;
}