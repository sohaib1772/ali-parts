import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Check, Package, Truck, PackageCheck, XCircle, ClipboardCheck } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { statusColor, statusLabel } from "@/lib/order-status";

type Notif = {
  id: string;
  order_id: string | null;
  title: string;
  body: string | null;
  status: string | null;
  read_at: string | null;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

function statusIcon(s: string | null) {
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

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "الآن";
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  return `منذ ${Math.floor(diff / 86400)} ي`;
}

function NotificationsPage() {
  const { userId } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!userId) return;
    const { data } = await (supabase as any)
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data as Notif[]) ?? []);
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
  }, [userId]);

  const markAllRead = async () => {
    if (!userId) return;
    await (supabase as any)
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    load();
  };

  const markRead = async (id: string) => {
    await (supabase as any)
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
  };

  const unread = items.filter((n) => !n.read_at).length;

  return (
    <PageShell title="الإشعارات">
      <div className="px-4 pt-4 pb-6">
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
              const Icon = statusIcon(n.status);
              const isUnread = !n.read_at;
              const content = (
                <div
                  className={`flex gap-3 rounded-2xl border p-3 shadow-card transition ${
                    isUnread ? "bg-card border-gold/40" : "bg-muted/30 border-border"
                  }`}
                >
                  <div className={`size-11 rounded-xl grid place-items-center flex-shrink-0 ${
                    isUnread ? "bg-gradient-gold text-navy" : "bg-muted text-muted-foreground"
                  }`}>
                    <Icon className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-bold text-foreground">{n.title}</div>
                      {isUnread && <span className="mt-1.5 size-2 rounded-full bg-gold flex-shrink-0" />}
                    </div>
                    {n.body && <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>}
                    <div className="flex items-center gap-2 mt-1.5">
                      {n.status && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(n.status)}`}>
                          {statusLabel(n.status)}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
              return (
                <div key={n.id} onClick={() => isUnread && markRead(n.id)}>
                  {n.order_id ? (
                    <Link to="/orders/$id" params={{ id: n.order_id }} className="block">
                      {content}
                    </Link>
                  ) : content}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}