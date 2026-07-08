import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const CHANNEL = "price-updates";
const EVENT = "prices_changed";
const BC_NAME = "app-price-sync";

const PRICE_KEYS = [
  ["products"],
  ["product"],
  ["cart"],
  ["admin", "products"],
  ["favorites"],
] as const;

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  for (const key of PRICE_KEYS) {
    qc.invalidateQueries({ queryKey: key as unknown as readonly unknown[] });
  }
  qc.refetchQueries({ type: "active" });
}

/**
 * Broadcast a "prices changed" event to all connected clients (other tabs,
 * other devices) and to the same browser via BroadcastChannel. Call this
 * from the admin panel after a bulk price update or restore succeeds.
 */
export async function broadcastPricesChanged() {
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
  } catch {
    // ignore — local BroadcastChannel will still fire below
  }
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(BC_NAME);
      bc.postMessage({ event: EVENT, at: Date.now() });
      bc.close();
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
    ch.on("broadcast", { event: EVENT }, () => invalidateAll(qc)).subscribe();

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel(BC_NAME);
        bc.onmessage = () => invalidateAll(qc);
      }
    } catch {}

    const onFocus = () => {
      if (document.visibilityState === "visible") invalidateAll(qc);
    };
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      supabase.removeChannel(ch);
      bc?.close();
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [qc]);
}