import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Package, ChevronLeft, X, Eye } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { OrderTracking } from "@/components/order-tracking";
import { ordersQuery } from "@/lib/queries";
import { useAuth } from "@/lib/use-auth";
import { formatIQD, formatArabicDate } from "@/lib/format";
import { statusLabel, statusColor, statusIcon } from "@/lib/order-status";
import { isOrderUnseen, useOrderSeenMap } from "@/lib/order-updates";
import { toast } from "sonner";
import { readGuestOrders } from "@/lib/guest-cart";

export const Route = createFileRoute("/_authenticated/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  const { userId } = useAuth();
  const { data: authedOrders = [] } = useQuery({ ...ordersQuery(userId), enabled: !!userId });
  const guestQ = useQuery({
    queryKey: ["guest-orders-list"],
    enabled: !userId,
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const refs = readGuestOrders();
      if (refs.length === 0) return [] as any[];
      const results = await Promise.all(
        refs.map(async (r) => {
          try {
            const { data, error } = await supabase.rpc("get_guest_order", {
              p_order_number: r.order_number,
              p_guest_token: r.guest_token,
            });
            if (error) return null;
            return data as any;
          } catch {
            return null;
          }
        }),
      );
      return results.filter(Boolean).sort((a: any, b: any) =>
        String(b.created_at).localeCompare(String(a.created_at)),
      );
    },
  });
  const orders: any[] = userId ? (authedOrders as any[]) : ((guestQ.data as any[]) ?? []);
  const isGuest = !userId;
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

  // Toast on guest order status change while list is open.
  useEffect(() => {
    if (!isGuest) return;
    for (const o of orders as any[]) {
      const prev = statusRef.current.get(o.id);
      if (prev && prev !== o.status) {
        if (o.status === "cancelled") toast.error(`تم إلغاء الطلب ${o.order_number ?? ""}`);
        else toast.success(`تحديث الطلب: ${statusLabel(o.status)}`);
        setPulseId(o.id);
        setTimeout(() => setPulseId((p) => (p === o.id ? null : p)), 3000);
      }
      statusRef.current.set(o.id, o.status);
    }
  }, [orders, isGuest]);

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
            <p className="text-sm text-muted-foreground mb-6">
              {isGuest
                ? "لم يتم إجراء أي طلب من هذا الجهاز بعد. سجّل الدخول لعرض طلبات حسابك."
                : "ستظهر طلباتك هنا بعد إتمام أول عملية شراء"}
            </p>
            <Link to="/" className="inline-flex px-6 py-3 rounded-2xl bg-gradient-gold text-navy font-bold shadow-gold">ابدأ التسوق</Link>
          </div>
        ) : (
          orders.map((o: any) => {
            const updated = isOrderUnseen(seen, o.id, o.updated_at, o.created_at);
            const StatusIcon = statusIcon(o.status);
            const hasUpdateAfterCreate = !!o.updated_at && o.updated_at !== o.created_at;
            return (
            <div
              key={o.id}
              className={`bg-card rounded-2xl border p-4 shadow-card transition ${updated ? "border-gold ring-1 ring-gold/40" : "border-border"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono text-muted-foreground">{o.order_number}</span>
                {updated && !isGuest && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">تحديث جديد</span>
                )}
                {isGuest && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-navy text-primary-foreground">ضيف</span>
                )}
                <span className={`ms-auto inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${statusColor(o.status)}`}>
                  <StatusIcon className="size-3" />
                  {statusLabel(o.status)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mb-1">{formatArabicDate(o.created_at)}</div>
              {hasUpdateAfterCreate && (
                <div className="text-[10px] text-gold font-semibold mb-2">
                  آخر تحديث: {formatArabicDate(o.updated_at)}
                </div>
              )}
              <div className="flex justify-between items-baseline mb-3">
                <span className="text-lg font-black text-navy">{formatIQD(o.total_iqd)}</span>
                <ChevronLeft className="size-4 text-muted-foreground" />
              </div>
              <OrderTracking status={o.status} pulse={pulseId === o.id} />
              <div className="mt-3 flex items-center gap-2">
                <Link
                  to="/orders/$id"
                  params={{ id: o.id }}
                  className="flex-1 h-9 rounded-xl bg-gradient-gold text-navy text-xs font-bold flex items-center justify-center gap-1.5 shadow-gold hover:brightness-105 transition"
                >
                  <Eye className="size-3.5" />
                  عرض التفاصيل والتتبع
                </Link>
                {!isGuest && (o.status === "received" || o.status === "preparing") && (
                  <button
                    onClick={(e) => cancelOrder(e, o.id)}
                    disabled={cancellingId === o.id}
                    className="h-9 px-3 rounded-xl border border-destructive/40 text-destructive text-xs font-bold flex items-center justify-center gap-1 hover:bg-destructive/10 disabled:opacity-50 shrink-0"
                  >
                    <X className="size-3.5" />
                    {cancellingId === o.id ? "جاري..." : "إلغاء"}
                  </button>
                )}
              </div>
            </div>
            );
          })
        )}
      </div>
    </PageShell>
  );
}
