import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Package, ChevronLeft, X, Inbox, PackageCheck, Package as PackageBox, Truck, Bike, Home, XCircle } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { ordersQuery } from "@/lib/queries";
import { useAuth } from "@/lib/use-auth";
import { formatIQD, formatArabicDate } from "@/lib/format";
import { statusLabel, statusColor } from "@/lib/order-status";
import { statusIcon } from "@/lib/order-status";
import { isOrderUnseen, useOrderSeenMap } from "@/lib/order-updates";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/orders")({
  component: OrdersPage,
});

const TRACK_STEPS = [
  { key: "received", label: "استلام", icon: Inbox },
  { key: "preparing", label: "تجهيز", icon: PackageCheck },
  { key: "packed", label: "تغليف", icon: PackageBox },
  { key: "shipped", label: "شحن", icon: Truck },
  { key: "out_for_delivery", label: "خرج", icon: Bike },
  { key: "delivered", label: "تسليم", icon: Home },
] as const;

function OrderTracker({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700">
        <XCircle className="size-4 shrink-0" />
        <span className="text-xs font-bold">تم إلغاء الطلب</span>
      </div>
    );
  }
  const activeIdx = TRACK_STEPS.findIndex((s) => s.key === status);
  const progress = activeIdx < 0 ? 0 : ((activeIdx) / (TRACK_STEPS.length - 1)) * 100;
  return (
    <div className="mt-3">
      <div className="relative mb-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="absolute inset-y-0 right-0 bg-gradient-to-l from-gold via-gold to-amber-400 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex items-start justify-between gap-1">
        {TRACK_STEPS.map((s, i) => {
          const done = i <= activeIdx;
          const active = i === activeIdx;
          const Icon = s.icon;
          return (
            <div key={s.key} className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <div
                className={`size-6 rounded-full grid place-items-center transition ${
                  active
                    ? "bg-gold text-navy ring-2 ring-gold/40 shadow-sm"
                    : done
                      ? "bg-gold/90 text-navy"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="size-3" />
              </div>
              <span
                className={`text-[9px] font-bold leading-tight text-center truncate w-full ${
                  active ? "text-gold" : done ? "text-navy" : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrdersPage() {
  const { userId } = useAuth();
  const { data: orders = [] } = useQuery(ordersQuery(userId));
  const seen = useOrderSeenMap();
  const qc = useQueryClient();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const cancelOrder = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("هل تريد إلغاء هذا الطلب؟")) return;
    setCancellingId(id);
    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", id);
    setCancellingId(null);
    if (error) {
      toast.error("تعذّر إلغاء الطلب");
    } else {
      toast.success("تم إلغاء الطلب");
      qc.invalidateQueries({ queryKey: ["orders", userId] });
    }
  };

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`orders-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["orders", userId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc]);

  return (
    <PageShell title="طلباتي">
      <div className="px-4 pt-4 space-y-3">
        {orders.length === 0 ? (
          <div className="py-20 text-center">
            <div className="size-20 rounded-full bg-muted grid place-items-center mx-auto mb-4">
              <Package className="size-10 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-bold mb-2">لا توجد طلبات بعد</h2>
            <p className="text-sm text-muted-foreground mb-6">ستظهر طلباتك هنا بعد إتمام أول عملية شراء</p>
            <Link to="/" className="inline-flex px-6 py-3 rounded-2xl bg-gradient-gold text-navy font-bold shadow-gold">ابدأ التسوق</Link>
          </div>
        ) : (
          orders.map((o: any) => {
            const updated = isOrderUnseen(seen, o.id, o.updated_at, o.created_at);
            const StatusIcon = statusIcon(o.status);
            return (
            <Link
              key={o.id}
              to="/orders/$id"
              params={{ id: o.id }}
              className={`block bg-card rounded-2xl border p-4 shadow-card hover:shadow-luxe transition ${updated ? "border-gold ring-1 ring-gold/40" : "border-border"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono text-muted-foreground">{o.order_number}</span>
                {updated && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">تحديث جديد</span>
                )}
                <span className={`ms-auto inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${statusColor(o.status)}`}>
                  <StatusIcon className="size-3" />
                  {statusLabel(o.status)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mb-2">{formatArabicDate(o.created_at)}</div>
              <div className="flex justify-between items-baseline">
                <span className="text-lg font-black text-navy">{formatIQD(o.total_iqd)}</span>
                <ChevronLeft className="size-4 text-muted-foreground" />
              </div>
              <OrderTracker status={o.status} />
              {(o.status === "received" || o.status === "preparing") && (
                <button
                  onClick={(e) => cancelOrder(e, o.id)}
                  disabled={cancellingId === o.id}
                  className="mt-3 w-full h-9 rounded-xl border border-destructive/40 text-destructive text-xs font-bold flex items-center justify-center gap-1 hover:bg-destructive/10 disabled:opacity-50"
                >
                  <X className="size-3.5" />
                  {cancellingId === o.id ? "جاري الإلغاء..." : "إلغاء الطلب"}
                </button>
              )}
            </Link>
            );
          })
        )}
      </div>
    </PageShell>
  );
}