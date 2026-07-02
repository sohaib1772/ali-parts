import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, PackageCheck, Package as PackageIcon, PackageOpen, Truck, MapPin, Home, XCircle } from "lucide-react";
import { orderByIdQuery } from "@/lib/queries";
import { formatIQD, formatArabicDate } from "@/lib/format";
import { statusLabel } from "@/lib/order-status";
import { markOrderSeen } from "@/lib/order-updates";

export const Route = createFileRoute("/_authenticated/orders/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(orderByIdQuery(params.id)),
  component: OrderDetail,
});

const TIMELINE = [
  { key: "received", label: "تم استلام الطلب", icon: PackageIcon },
  { key: "preparing", label: "جاري التجهيز", icon: PackageOpen },
  { key: "packed", label: "تم التغليف", icon: PackageCheck },
  { key: "shipped", label: "تسليم للتوصيل", icon: Truck },
  { key: "out_for_delivery", label: "خرج للتوصيل", icon: MapPin },
  { key: "delivered", label: "تم التسليم", icon: Home },
] as const;

function OrderDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(orderByIdQuery(id));
  const { order, items } = data;
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    const ch = supabase
      .channel(`order-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["order", id] });
          qc.invalidateQueries({ queryKey: ["orders"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, qc]);

  useEffect(() => {
    markOrderSeen(order.id, (order as any).updated_at ?? order.created_at);
  }, [order.id, (order as any).updated_at, order.created_at]);

  const activeIdx = TIMELINE.findIndex((t) => t.key === order.status);
  const cancelled = order.status === "cancelled";

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="sticky top-0 z-20 bg-gradient-navy text-primary-foreground shadow-luxe">
        <div className="mx-auto max-w-md px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.history.back()} className="size-9 rounded-full bg-white/10 grid place-items-center"><ArrowRight className="size-5" /></button>
          <div>
            <div className="text-sm font-bold">تفاصيل الطلب</div>
            <div className="text-[10px] text-gold font-mono">{order.order_number}</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
        {cancelled ? (
          <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 flex items-center gap-3">
            <XCircle className="size-6 text-destructive" />
            <div>
              <div className="font-bold text-destructive">تم إلغاء الطلب</div>
              <div className="text-xs text-muted-foreground">إذا كان لديك استفسار تواصل معنا</div>
            </div>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
            <div className="text-xs font-bold text-gold mb-4">حالة الطلب</div>
            <div className="space-y-3">
              {TIMELINE.map((t, i) => {
                const done = i <= activeIdx;
                const active = i === activeIdx;
                const Icon = t.icon;
                return (
                  <div key={t.key} className="flex items-center gap-3">
                    <div className={`size-10 rounded-full grid place-items-center transition ${done ? "bg-gradient-gold text-navy shadow-gold" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="size-5" />
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm font-bold ${done ? "text-navy" : "text-muted-foreground"}`}>{t.label}</div>
                      {active && <div className="text-[10px] text-gold">الحالة الحالية</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
          <div className="text-xs font-bold text-gold mb-3">المنتجات</div>
          <div className="space-y-3">
            {items.map((it) => (
              <div key={it.id} className="flex gap-3">
                <div className="size-14 rounded-xl bg-muted overflow-hidden flex-shrink-0">
                  {it.image_url && <img src={it.image_url} alt="" className="size-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold line-clamp-1">{it.name_ar}</div>
                  <div className="text-xs text-muted-foreground">× {it.quantity}</div>
                </div>
                <div className="text-sm font-bold self-center">{formatIQD(Number(it.unit_price_iqd) * it.quantity)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
          <div className="text-xs font-bold text-gold mb-3">عنوان التوصيل</div>
          <div className="text-sm space-y-1">
            <div className="font-bold">{(order.address as any)?.full_name}</div>
            <div className="text-muted-foreground">{(order.address as any)?.phone}</div>
            <div className="text-muted-foreground">
              {(order.address as any)?.city} · {(order.address as any)?.area} · {(order.address as any)?.street}
            </div>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
          <div className="flex justify-between text-sm py-1"><span className="text-muted-foreground">المجموع الفرعي</span><span>{formatIQD(order.subtotal_iqd)}</span></div>
          <div className="flex justify-between text-sm py-1"><span className="text-muted-foreground">التوصيل</span><span>{formatIQD(order.shipping_iqd)}</span></div>
          <div className="border-t border-border mt-2 pt-3 flex justify-between items-baseline">
            <span className="font-bold">الإجمالي</span>
            <span className="text-xl font-black text-navy">{formatIQD(order.total_iqd)}</span>
          </div>
        </div>

        <div className="text-center text-xs text-muted-foreground">
          تم الطلب في {formatArabicDate(order.created_at)}
          <br />
          الحالة: {statusLabel(order.status)}
        </div>
      </div>
    </div>
  );
}