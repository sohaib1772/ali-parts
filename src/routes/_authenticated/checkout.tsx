import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CreditCard, Truck, MapPin, Loader2, Plus } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { addressesQuery, cartQuery } from "@/lib/queries";
import { formatIQD } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/checkout")({
  component: CheckoutPage,
});

function CheckoutPage() {
  const { userId } = useAuth();
  const { data: items = [] } = useQuery(cartQuery(userId));
  const { data: addresses = [] } = useQuery(addressesQuery(userId));
  const [selectedAddr, setSelectedAddr] = useState<string | null>(null);
  const [payment, setPayment] = useState<"cod" | "transfer">("cod");
  const [placing, setPlacing] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const activeAddr = addresses.find((a: any) => a.id === (selectedAddr ?? addresses.find((x: any) => x.is_default)?.id ?? addresses[0]?.id));
  const subtotal = items.reduce((s, i: any) => s + Number(i.product?.price_iqd ?? 0) * i.quantity, 0);
  const shippingCost = items.reduce(
    (max, i: any) => Math.max(max, Number(i.product?.shipping_iqd ?? 0)),
    0,
  );
  const total = subtotal + shippingCost;

  const placeOrder = async () => {
    if (!activeAddr) return toast.error("اختر عنواناً أولاً");
    if (items.length === 0) return toast.error("السلة فارغة");
    setPlacing(true);
    try {
      const { data: order, error } = await supabase.from("orders").insert({
        user_id: userId!,
        address: {
          full_name: activeAddr.full_name, phone: activeAddr.phone, city: activeAddr.city,
          area: activeAddr.area, street: activeAddr.street, notes: activeAddr.notes,
        },
        payment_method: payment,
        subtotal_iqd: subtotal,
        shipping_iqd: shippingCost,
        total_iqd: total,
      }).select().single();
      if (error || !order) throw error;

      const orderItems = items.map((i: any) => ({
        order_id: order.id, product_id: i.product?.id ?? null,
        name_ar: i.product?.name_ar ?? "", oem_number: i.product?.oem_number ?? null,
        image_url: i.product?.images?.[0] ?? null,
        unit_price_iqd: Number(i.product?.price_iqd ?? 0), quantity: i.quantity,
      }));
      await supabase.from("order_items").insert(orderItems);
      await supabase.from("cart_items").delete().eq("user_id", userId!);

      qc.invalidateQueries({ queryKey: ["cart"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success("تم تأكيد الطلب بنجاح");
      navigate({ to: "/order-success/$id", params: { id: order.id } });
    } catch {
      toast.error("تعذّر إتمام الطلب");
      setPlacing(false);
    }
  };

  return (
    <PageShell title="إتمام الطلب">
      <div className="px-4 pt-4 space-y-4">
        <Section title="عنوان التوصيل" icon={<MapPin className="size-4 text-gold" />}>
          {addresses.length === 0 ? (
            <Link to="/addresses" className="flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-dashed border-gold text-gold font-bold">
              <Plus className="size-4" /> إضافة عنوان
            </Link>
          ) : (
            <div className="space-y-2">
              {addresses.map((a: any) => {
                const active = activeAddr?.id === a.id;
                return (
                  <button key={a.id} onClick={() => setSelectedAddr(a.id)} className={`w-full text-start rounded-xl p-3 border-2 transition ${active ? "border-gold bg-gold/5" : "border-border bg-muted/30"}`}>
                    <div className="font-bold text-sm">{a.full_name} · {a.phone}</div>
                    <div className="text-xs text-muted-foreground">{a.city} · {a.area} · {a.street}</div>
                  </button>
                );
              })}
              <Link to="/addresses" className="block text-xs text-gold text-center font-bold">إدارة العناوين</Link>
            </div>
          )}
        </Section>

        <Section title="كلفة التوصيل" icon={<Truck className="size-4 text-gold" />}>
          <div className="text-sm text-muted-foreground">
            {shippingCost > 0 ? (
              <>كلفة التوصيل: <span className="font-bold text-navy">{formatIQD(shippingCost)}</span></>
            ) : (
              "توصيل مجاني"
            )}
          </div>
        </Section>

        <Section title="طريقة الدفع" icon={<CreditCard className="size-4 text-gold" />}>
          <div className="grid grid-cols-2 gap-2">
            <PayOption active={payment === "cod"} onClick={() => setPayment("cod")} label="الدفع عند الاستلام" />
            <PayOption active={payment === "transfer"} onClick={() => setPayment("transfer")} label="حوالة" />
          </div>
        </Section>

        <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
          <div className="text-xs font-bold text-gold mb-3">ملخص الطلب</div>
          <div className="flex justify-between text-sm py-1"><span className="text-muted-foreground">{items.length} منتج</span><span>{formatIQD(subtotal)}</span></div>
          <div className="flex justify-between text-sm py-1"><span className="text-muted-foreground">التوصيل</span><span>{formatIQD(shippingCost)}</span></div>
          <div className="border-t border-border mt-2 pt-3 flex justify-between items-baseline">
            <span className="font-bold">الإجمالي</span>
            <span className="text-2xl font-black text-navy">{formatIQD(total)}</span>
          </div>
        </div>

        <button
          onClick={placeOrder}
          disabled={placing || items.length === 0}
          className="w-full h-14 rounded-2xl bg-gradient-gold text-navy font-black shadow-gold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {placing && <Loader2 className="size-5 animate-spin" />}
          تأكيد الطلب
        </button>
      </div>
    </PageShell>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
      <div className="flex items-center gap-2 mb-3">{icon}<span className="text-sm font-bold">{title}</span></div>
      {children}
    </div>
  );
}

function PayOption({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`rounded-xl p-3 border-2 text-sm font-bold transition ${active ? "border-gold bg-gold/5" : "border-border"}`}>
      {label}
    </button>
  );
}