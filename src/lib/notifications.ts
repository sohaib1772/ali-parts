import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";

/**
 * Single source of truth for every "unread" badge in the app.
 *
 * The badge used to be derived from localStorage (`order_seen_v1`), which made
 * it per-device: it disagreed between phone and desktop and reset whenever
 * storage was cleared. Everything here reads `notifications.read_at IS NULL`
 * for the signed-in user instead — the same condition `/notifications` uses —
 * so the count is per-USER, survives storage clears, and agrees on every
 * device the account is signed in on.
 *
 * Only unread rows are fetched (there is a partial index on
 * `notifications(user_id) WHERE read_at IS NULL`), so this stays cheap even for
 * accounts with a long notification history.
 */

export type UnreadNotification = {
  id: string;
  order_id: string | null;
  type: string;
};

/** Badges cap their display well below this, so a bound is safe here. */
const UNREAD_FETCH_LIMIT = 200;

export const unreadNotificationsKey = (userId: string | null) =>
  ["notifications", "unread", userId] as const;

export const unreadNotificationsQuery = (userId: string | null) =>
  queryOptions({
    queryKey: unreadNotificationsKey(userId),
    queryFn: async () => {
      if (!userId) return [] as UnreadNotification[];
      const { data, error } = await supabase
        .from("notifications")
        .select("id, order_id, type")
        .eq("user_id", userId)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(UNREAD_FETCH_LIMIT);
      if (error) throw error;
      return (data ?? []) as UnreadNotification[];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

/**
 * One realtime channel per user, shared by every component that renders a
 * badge. Without the ref-counting each consumer (header bell, bottom nav,
 * orders list) would open its own duplicate subscription to the same rows.
 */
const listeners = new Map<string, Set<() => void>>();
const channels = new Map<string, ReturnType<typeof supabase.channel>>();

function subscribeUnread(userId: string, cb: () => void) {
  let set = listeners.get(userId);
  if (!set) {
    set = new Set();
    listeners.set(userId, set);
    const ch = supabase
      .channel(`notifications-unread-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => listeners.get(userId)?.forEach((l) => l()),
      )
      .subscribe();
    channels.set(userId, ch);
  }
  set.add(cb);
  return () => {
    const current = listeners.get(userId);
    if (!current) return;
    current.delete(cb);
    if (current.size > 0) return;
    listeners.delete(userId);
    const ch = channels.get(userId);
    if (ch) {
      supabase.removeChannel(ch);
      channels.delete(userId);
    }
  };
}

/** Live list of the signed-in user's unread notifications. */
export function useUnreadNotifications(): UnreadNotification[] {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery(unreadNotificationsQuery(userId));

  useEffect(() => {
    if (!userId) return;
    return subscribeUnread(userId, () => {
      qc.invalidateQueries({ queryKey: unreadNotificationsKey(userId) });
    });
  }, [userId, qc]);

  return data ?? [];
}

export type UnreadCounts = {
  /** Every unread notification — what the header bell shows. */
  total: number;
  /** Unread notifications tied to an order — what the طلباتي tab shows. */
  orders: number;
  /** Order ids with at least one unread notification. */
  orderIds: Set<string>;
};

export function useUnreadCounts(): UnreadCounts {
  const unread = useUnreadNotifications();
  return useMemo(() => {
    const orderIds = new Set<string>();
    for (const n of unread) if (n.order_id) orderIds.add(n.order_id);
    return {
      total: unread.length,
      orders: unread.reduce((sum, n) => sum + (n.order_id ? 1 : 0), 0),
      orderIds,
    };
  }, [unread]);
}

/**
 * Mark every unread notification for one order as read. Called when the user
 * opens that order — the server-side `read_at` write is what makes the badge
 * clear on their other devices too.
 */
export async function markOrderNotificationsRead(userId: string, orderId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("order_id", orderId)
    .is("read_at", null);
  if (error) throw error;
}
