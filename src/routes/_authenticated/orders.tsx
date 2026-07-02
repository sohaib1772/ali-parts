import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Package, ChevronLeft } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { ordersQuery } from "@/lib/queries";
import { useAuth } from "@/lib/use-auth";
import { formatIQD, formatArabicDate } from "@/lib/format";
import { statusLabel, statusColor } from "@/lib/order-status";
import { isOrderUnseen, useOrderSeenMap } from "@/lib/order-updates";

export const Route = createFileRoute("/_authenticated/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  const { userId } = useAuth();
  const { data: orders = [] } = useQuery(ordersQuery(userId));
  const seen = useOrderSeenMap();

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
                <span className={`ms-auto text-[10px] font-bold px-2 py-1 rounded-full ${statusColor(o.status)}`}>{statusLabel(o.status)}</span>
              </div>
              <div className="text-xs text-muted-foreground mb-2">{formatArabicDate(o.created_at)}</div>
              <div className="flex justify-between items-baseline">
                <span className="text-lg font-black text-navy">{formatIQD(o.total_iqd)}</span>
                <ChevronLeft className="size-4 text-muted-foreground" />
              </div>
            </Link>
            );
          })
        )}
      </div>
    </PageShell>
  );
}