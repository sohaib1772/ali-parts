import { useSyncExternalStore } from "react";

const KEY = "order_seen_v1";

type Map = Record<string, string>;

function read(): Map {
  if (typeof window === "undefined") return {};
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
  return useSyncExternalStore(subscribe, read, () => ({}));
}

export function markOrderSeen(orderId: string, updatedAt: string) {
  const m = read();
  if (m[orderId] === updatedAt) return;
  m[orderId] = updatedAt;
  localStorage.setItem(KEY, JSON.stringify(m));
  emit();
}

export function isOrderUnseen(seen: Map, orderId: string, updatedAt: string | null | undefined, createdAt: string) {
  const ref = updatedAt ?? createdAt;
  const last = seen[orderId];
  // first time seeing: only mark as "update" if updated_at is different from created_at
  if (!last) return !!updatedAt && updatedAt !== createdAt;
  return last !== ref;
}