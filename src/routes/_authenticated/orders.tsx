import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Package, ChevronLeft, X } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { OrderTracking } from "@/components/order-tracking";
import { ordersQuery } from "@/lib/queries";
import { useAuth } from "@/lib/use-auth";
import { formatIQD, formatArabicDate } from "@/lib/format";
import { statusLabel, statusColor, statusIcon } from "@/lib/order-status";
import { isOrderUnseen, useOrderSeenMap } from "@/lib/order-updates";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  const { userId } = useAuth();
  const { data: orders = [] } = useQuery(ordersQuery(userId));
  const seen = useOrderSeenMap();
  const qc = useQueryClient();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const statusRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    for (const o of orders as any[]) {
      if (!statusRef.current.has(o.id)) statusRef.current.set(o.id, o.status);
    }
  }, [orders]);

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
        { event: "UPDATE", schema: "public", table: "orders", filter: `user_id=eq.${userId}` },
        (payload: any) => {
          const next = payload.new;
          const prev = statusRef.current.get(next.id);
          if (prev && prev !== next.status) {
            const label = statusLabel(next.status);
            if (next.status === "cancelled") toast.error(`تم إلغاء الطلب ${next.order_number ?? ""}`);
            else toast.success(`تحديث الطلب: ${label}`);
            setPulseId(next.id);
            setTimeout(() => setPulseId((p) => (p === next.id ? null : p)), 3000);
          }
          statusRef.current.set(next.id, next.status);
          qc.invalidateQueries({ queryKey: ["orders", userId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `user_id=eq.${userId}` },
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
              <OrderTracking status={o.status} pulse={pulseId === o.id} />
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