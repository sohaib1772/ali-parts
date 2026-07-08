import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const CHANNEL = "price-updates";
const EVENT = "prices_changed";
const BC_NAME = "app-price-sync";
const LOG_KEY = "price_sync_log";
const MAX_LOG = 100;

export type PriceSyncEntry = {
  ts: number;
  tab: string;
  kind:
    | "broadcast_sent"
    | "received_realtime"
    | "received_broadcast_channel"
    | "received_visibility"
    | "invalidated";
  info?: Record<string, unknown>;
};

// Stable id per tab so logs can be correlated across sessions.
function getTabId(): string {
  if (typeof window === "undefined") return "ssr";
  const w = window as unknown as { __priceSyncTabId?: string };
  if (!w.__priceSyncTabId) {
    w.__priceSyncTabId = Math.random().toString(36).slice(2, 8);
  }
  return w.__priceSyncTabId;
}

function logEntry(kind: PriceSyncEntry["kind"], info?: Record<string, unknown>) {
  const entry: PriceSyncEntry = { ts: Date.now(), tab: getTabId(), kind, info };
  // Console line for live debugging.
  // eslint-disable-next-line no-console
  console.info(
    `[price-sync] ${new Date(entry.ts).toISOString()} tab=${entry.tab} ${kind}`,
    info ?? "",
  );
  // Persist a ring buffer in sessionStorage so it survives navigations.
  try {
    if (typeof sessionStorage !== "undefined") {
      const raw = sessionStorage.getItem(LOG_KEY);
      const arr: PriceSyncEntry[] = raw ? JSON.parse(raw) : [];
      arr.push(entry);
      while (arr.length > MAX_LOG) arr.shift();
      sessionStorage.setItem(LOG_KEY, JSON.stringify(arr));
    }
  } catch {}
  // Expose a global for quick inspection from DevTools.
  try {
    const w = window as unknown as { __priceSync?: { log: PriceSyncEntry[] } };
    if (!w.__priceSync) w.__priceSync = { log: [] };
    w.__priceSync.log.push(entry);
    if (w.__priceSync.log.length > MAX_LOG) w.__priceSync.log.shift();
  } catch {}
}

/** Return the recent sync log (from sessionStorage). Useful for a debug UI. */
export function readPriceSyncLog(): PriceSyncEntry[] {
  try {
    if (typeof sessionStorage === "undefined") return [];
    const raw = sessionStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as PriceSyncEntry[]) : [];
  } catch {
    return [];
  }
}

const PRICE_KEYS = [
  ["products"],
  ["product"],
  ["cart"],
  ["admin", "products"],
  ["favorites"],
] as const;

function invalidateAll(
  qc: ReturnType<typeof useQueryClient>,
  source: "realtime" | "broadcast_channel" | "visibility",
) {
  const t0 = performance.now();
  for (const key of PRICE_KEYS) {
    qc.invalidateQueries({ queryKey: key as unknown as readonly unknown[] });
  }
  qc.refetchQueries({ type: "active" }).finally(() => {
    logEntry("invalidated", {
      source,
      duration_ms: Math.round(performance.now() - t0),
      keys: PRICE_KEYS.map((k) => k.join(":")),
    });
  });
}

/**
 * Broadcast a "prices changed" event to all connected clients (other tabs,
 * other devices) and to the same browser via BroadcastChannel. Call this
 * from the admin panel after a bulk price update or restore succeeds.
 */
export async function broadcastPricesChanged() {
  const startedAt = Date.now();
  try {
    const ch = supabase.channel(CHANNEL);
    await new Promise<void>((resolve) => {
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
      setTimeout(() => resolve(), 1500);
    });
    await ch.send({ type: "broadcast", event: EVENT, payload: { at: Date.now() } });
    await supabase.removeChannel(ch);
    logEntry("broadcast_sent", { transport: "realtime", elapsed_ms: Date.now() - startedAt });
  } catch {
    logEntry("broadcast_sent", { transport: "realtime", error: true });
  }
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(BC_NAME);
      bc.postMessage({ event: EVENT, at: Date.now() });
      bc.close();
      logEntry("broadcast_sent", { transport: "broadcast_channel" });
    }
  } catch {}
}

/**
 * Subscribe every client to price-change broadcasts and refresh the caches
 * that render prices (product cards, product detail, cart, checkout).
 * Also refetches on tab focus so a tab returning from background catches up.
 */
export function usePriceSyncListener() {
  const qc = useQueryClient();

  useEffect(() => {
    const ch = supabase.channel(CHANNEL);
    ch.on("broadcast", { event: EVENT }, (msg) => {
      const at = (msg?.payload as { at?: number } | undefined)?.at;
      logEntry("received_realtime", {
        latency_ms: typeof at === "number" ? Date.now() - at : undefined,
      });
      invalidateAll(qc, "realtime");
    }).subscribe();

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel(BC_NAME);
        bc.onmessage = (ev) => {
          const at = (ev.data as { at?: number } | undefined)?.at;
          logEntry("received_broadcast_channel", {
            latency_ms: typeof at === "number" ? Date.now() - at : undefined,
          });
          invalidateAll(qc, "broadcast_channel");
        };
      }
    } catch {}

    const onFocus = () => {
      if (document.visibilityState === "visible") {
        logEntry("received_visibility");
        invalidateAll(qc, "visibility");
      }
    };
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      supabase.removeChannel(ch);
      bc?.close();
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [qc]);
}