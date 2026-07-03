import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CreditCard, Truck, MapPin, Loader2, Plus, Sparkles, StickyNote } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { addressesQuery, cartQuery, profileQuery } from "@/lib/queries";
import { formatIQD } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/checkout")({
  component: CheckoutPage,
});

function CheckoutPage() {
  const { userId } = useAuth();
  const { data: items = [] } = useQuery(cartQuery(userId));
  const { data: addresses = [] } = useQuery(addressesQuery(userId));
  const { data: profile } = useQuery(profileQuery(userId));
  const [selectedAddr, setSelectedAddr] = useState<string | null>(null);
  const [payment, setPayment] = useState<"cod" | "transfer">("cod");
  const [placing, setPlacing] = useState(false);
  const [pointsInput, setPointsInput] = useState<string>("");
  const [orderNote, setOrderNote] = useState<string>("");
  const navigate = useNavigate();
  const qc = useQueryClient();

  const activeAddr = addresses.find((a: any) => a.id === (selectedAddr ?? addresses.find((x: any) => x.is_default)?.id ?? addresses[0]?.id));
  const subtotal = items.reduce((s, i: any) => s + Number(i.product?.price_iqd ?? 0) * i.quantity, 0);
  const shippingCost = items.reduce(
    (max, i: any) => Math.max(max, Number(i.product?.shipping_iqd ?? 0)),
    0,
  );
  const pointsBalance = Number((profile as any)?.points_balance ?? 0);
  const maxPointsBySubtotal = Math.floor(subtotal / 10); // 100 points = 1000 IQD, so max = subtotal/10
  const maxPoints = Math.max(0, Math.min(pointsBalance, maxPointsBySubtotal));
  const parsedPoints = Math.max(0, Math.min(maxPoints, Math.floor(Number(pointsInput) || 0)));
  const pointsDiscount = parsedPoints * 10; // 1 point = 10 IQD
  const total = Math.max(0, subtotal + shippingCost - pointsDiscount);

  const placeOrder = async () => {
    if (!activeAddr) return toast.error("اختر عنواناً أولاً");
    if (items.length === 0) return toast.error("السلة فارغة");
    setPlacing(true);
    try {
      const { data: orderId, error } = await supabase.rpc("place_order", {
        p_address: {
          label: activeAddr.label, full_name: activeAddr.full_name, phone: activeAddr.phone,
          city: activeAddr.city, area: activeAddr.area, street: activeAddr.street, notes: activeAddr.notes,
        },
        p_payment: payment,
        p_points_used: parsedPoints,
        p_notes: orderNote.trim() || "",
      });
      if (error || !orderId) throw error;

      qc.invalidateQueries({ queryKey: ["cart"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("تم تأكيد الطلب بنجاح");
      navigate({ to: "/order-success/$id", params: { id: orderId as string } });
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

        {pointsBalance > 0 && subtotal > 0 && (
          <Section title="استخدام نقاط الولاء" icon={<Sparkles className="size-4 text-gold" />}>
            <div className="text-xs text-muted-foreground mb-2">
              رصيدك: <span className="font-bold text-navy">{pointsBalance} نقطة</span> · كل 100 نقطة = 1,000 دينار
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={maxPoints}
                value={pointsInput}
                onChange={(e) => setPointsInput(e.target.value)}
                placeholder="0"
                className="flex-1 h-11 rounded-xl border-2 border-border px-3 text-sm font-bold bg-background"
              />
              <button
                type="button"
                onClick={() => setPointsInput(String(maxPoints))}
                className="px-3 h-11 rounded-xl bg-gold/10 text-gold text-xs font-bold border border-gold/30"
              >
                استخدم الحد الأقصى ({maxPoints})
              </button>
            </div>
            {parsedPoints > 0 && (
              <div className="mt-2 text-xs text-success font-bold">خصم: {formatIQD(pointsDiscount)}</div>
            )}
          </Section>
        )}

        <Section title="ملاحظة على الطلب" icon={<StickyNote className="size-4 text-gold" />}>
          <textarea
            value={orderNote}
            onChange={(e) => setOrderNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="أي تعليمات إضافية للتوصيل أو التجهيز..."
            className="w-full rounded-xl border-2 border-border bg-background p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-gold"
          />
        </Section>

        <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
          <div className="text-xs font-bold text-gold mb-3">ملخص الطلب</div>
          <div className="flex justify-between text-sm py-1"><span className="text-muted-foreground">{items.length} منتج</span><span>{formatIQD(subtotal)}</span></div>
          <div className="flex justify-between text-sm py-1"><span className="text-muted-foreground">التوصيل</span><span>{formatIQD(shippingCost)}</span></div>
          {parsedPoints > 0 && (
            <div className="flex justify-between text-sm py-1"><span className="text-muted-foreground">خصم نقاط ({parsedPoints})</span><span className="text-success">- {formatIQD(pointsDiscount)}</span></div>
          )}
          <div className="border-t border-border mt-2 pt-3 flex justify-between items-baseline">
            <span className="font-bold">الإجمالي</span>
            <span className="text-2xl font-black text-navy">{formatIQD(total)}</span>
          </div>
          {subtotal > 0 && (
            <div className="mt-2 text-[11px] text-muted-foreground">
              ستكسب <span className="font-bold text-gold">{Math.floor(subtotal / 10000) * 100} نقطة</span> عند تسليم الطلب
            </div>
          )}
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