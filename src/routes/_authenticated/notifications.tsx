import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Check, Package, Truck, PackageCheck, XCircle, ClipboardCheck, Tag, ArrowLeftRight, ShieldAlert, Megaphone } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { unreadNotificationsKey } from "@/lib/notifications";
import { statusColor, statusLabel } from "@/lib/order-status";

type Notif = {
  id: string;
  order_id: string | null;
  product_id?: string | null;
  image_url?: string | null;
  title: string;
  body: string | null;
  status: string | null;
  type?: string | null;
  read_at: string | null;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

function statusIcon(s: string | null, type?: string | null) {
  if (type === "admin_new_order") return Package;
  if (type === "admin_new_replacement") return ArrowLeftRight;
  if (type === "promo" || type === "new_product") return Tag;
  if (type === "replacement_status") return ArrowLeftRight;
  if (type === "account_status") return ShieldAlert;
  if (type === "admin_broadcast") return Megaphone;
  switch (s) {
    case "received": return ClipboardCheck;
    case "preparing": return Package;
    case "packed": return Package;
    case "shipped": return Truck;
    case "out_for_delivery": return Truck;
    case "delivered": return PackageCheck;
    case "cancelled": return XCircle;
    default: return Bell;
  }
}

function notifBadge(n: Notif): { label: string; color: string } | null {
  if (n.type === "admin_new_order") {
    return { label: "طلب جديد للادارة", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" };
  }
  if (n.type === "admin_new_replacement") {
    return { label: "طلب استبدال للادارة", color: "bg-teal-500/10 text-teal-600 dark:text-teal-400" };
  }
  if (n.type === "new_product") {
    return { label: "منتج جديد", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
  }
  if (n.status) {
    return { label: statusLabel(n.status), color: statusColor(n.status) };
  }
  if (n.type === "promo") {
    return { label: "عرض جديد", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
  }
  if (n.type === "replacement_status") {
    return { label: "طلب استبدال", color: "bg-teal-500/10 text-teal-600 dark:text-teal-400" };
  }
  if (n.type === "banner_reply") {
    return { label: "رد في العروض", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
  }
  if (n.type === "banner_comment") {
    return { label: "تعليق في العروض", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" };
  }
  if (n.type === "account_status") {
    return { label: "حالة الحساب", color: "bg-red-500/10 text-red-600 dark:text-red-400" };
  }
  if (n.type === "admin_broadcast") {
    return { label: "إشعار عام", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" };
  }
  return null;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "الآن";
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  return `منذ ${Math.floor(diff / 86400)} ي`;
}

function NotificationsPage() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  // Refresh the shared unread count immediately rather than waiting for the
  // realtime echo, so the bell and طلباتي badges clear on the same tick.
  const refreshBadges = () =>
    qc.invalidateQueries({ queryKey: unreadNotificationsKey(userId) });
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(30);
  const [hasMore, setHasMore] = useState(false);

  const load = async () => {
    if (!userId) return;
    const { data } = await (supabase as any)
      .from("notifications")
      .select("id, order_id, product_id, image_url, title, body, status, type, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    const rows = (data as Notif[]) ?? [];
    setHasMore(rows.length > limit);
    setItems(rows.slice(0, limit));
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!userId) return;
    const ch = supabase
      .channel("notifications-user")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, limit]);

  const markAllRead = async () => {
    if (!userId) return;
    await (supabase as any)
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    load();
    refreshBadges();
  };

  const markRead = async (id: string) => {
    await (supabase as any)
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    refreshBadges();
  };

  const unread = items.filter((n) => !n.read_at).length;

  return (
    <PageShell wide title="الإشعارات">
      <div className="px-4 pt-4 pb-6 md:max-w-3xl md:mx-auto">
        {unread > 0 && (
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold text-muted-foreground">{unread} إشعار غير مقروء</div>
            <button
              onClick={markAllRead}
              className="inline-flex items-center gap-1 text-xs font-bold text-navy hover:text-gold"
            >
              <Check className="size-3.5" /> تعليم الكل كمقروء
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">جاري التحميل…</div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center">
            <div className="size-20 rounded-full bg-muted grid place-items-center mx-auto mb-4">
              <Bell className="size-10 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-bold mb-2">لا توجد إشعارات</h2>
            <p className="text-sm text-muted-foreground">ستصلك إشعارات عند تحديث حالة طلباتك</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((n) => {
              const Icon = statusIcon(n.status, n.type);
              const isUnread = !n.read_at;
              const badge = notifBadge(n);
              const content = (
                <div
                  className={`flex gap-3 rounded-2xl border p-3 shadow-card transition ${
                    isUnread ? "bg-card border-gold/40" : "bg-muted/30 border-border"
                  }`}
                >
                  {n.image_url ? (
                    <img
                      src={n.image_url}
                      alt=""
                      className="size-11 rounded-xl object-cover flex-shrink-0 border border-border"
                      loading="lazy"
                    />
                  ) : (
                    <div className={`size-11 rounded-xl grid place-items-center flex-shrink-0 ${
                      isUnread ? "bg-gradient-gold text-navy" : "bg-muted text-muted-foreground"
                    }`}>
                      <Icon className="size-5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-bold text-foreground">{n.title}</div>
                      {isUnread && <span className="mt-1.5 size-2 rounded-full bg-gold flex-shrink-0" />}
                    </div>
                    {n.body && <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>}
                    <div className="flex items-center gap-2 mt-1.5">
                      {badge && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.color}`}>
                          {badge.label}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                    </div>
                  </div>
                </div>
              );

              const renderLinkedContent = () => {
                if (n.type === "admin_new_order" || n.type === "admin_new_replacement") {
                  return (
                    <Link to="/admin" className="block">
                      {content}
                    </Link>
                  );
                }
                if (n.order_id) {
                  return (
                    <Link to="/orders/$id" params={{ id: n.order_id }} className="block">
                      {content}
                    </Link>
                  );
                }
                if (n.type === "promo" || n.type === "banner_comment" || n.type === "banner_reply") {
                  return (
                    <Link to="/offers" className="block">
                      {content}
                    </Link>
                  );
                }
                if (n.type === "new_product" || n.type === "product" || (n as any).product_id) {
                  const pid = (n as any).product_id;
                  if (pid) {
                    return (
                      <Link to="/product/$id" params={{ id: pid }} className="block">
                        {content}
                      </Link>
                    );
                  }
                  return (
                    <Link to="/products" className="block">
                      {content}
                    </Link>
                  );
                }
                if (n.type === "replacement_status") {
                  return (
                    <Link to="/replacements" className="block">
                      {content}
                    </Link>
                  );
                }
                if (n.type === "account_status") {
                  return (
                    <Link to="/account" className="block">
                      {content}
                    </Link>
                  );
                }
                return content;
              };

              return (
                <div key={n.id} onClick={() => isUnread && markRead(n.id)}>
                  {renderLinkedContent()}
                </div>
              );
            })}
            {hasMore && (
              <button
                type="button"
                onClick={() => setLimit((n) => n + 30)}
                className="w-full h-10 rounded-xl border border-border text-xs font-bold hover:bg-muted"
              >
                تحميل المزيد
              </button>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}