import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { formatIQD } from "@/lib/format";
import { useAuth } from "@/lib/use-auth";
import { cartQuery } from "@/lib/queries";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cart")({
  component: CartPage,
});

function CartPage() {
  const { userId } = useAuth();
  const { data: items = [], isLoading } = useQuery(cartQuery(userId));
  const qc = useQueryClient();
  const navigate = useNavigate();

  const total = items.reduce((s, i: any) => s + Number(i.product?.price_iqd ?? 0) * i.quantity, 0);

  const setQty = async (id: string, q: number) => {
    if (q <= 0) return remove(id);
    await supabase.from("cart_items").update({ quantity: q }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["cart"] });
  };
  const remove = async (id: string) => {
    await supabase.from("cart_items").delete().eq("id", id);
    toast.success("أزيل من السلة");
    qc.invalidateQueries({ queryKey: ["cart"] });
  };

  if (isLoading) {
    return <PageShell title="السلة"><div className="p-8 text-center text-muted-foreground">جاري التحميل…</div></PageShell>;
  }

  if (items.length === 0) {
    return (
      <PageShell title="السلة">
        <div className="px-6 py-20 text-center">
          <div className="size-20 rounded-full bg-muted grid place-items-center mx-auto mb-4">
            <ShoppingBag className="size-10 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-bold mb-2">سلتك فارغة</h2>
          <p className="text-sm text-muted-foreground mb-6">أضف قطعاً لبدء التسوق</p>
          <Link to="/" className="inline-flex items-center px-6 py-3 rounded-2xl bg-gradient-gold text-navy font-bold shadow-gold">
            تصفح المنتجات
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="السلة">
      <div className="px-4 pt-4 pb-6 space-y-3">
        {items.map((it: any) => (
          <div key={it.id} className="bg-card rounded-2xl border border-border p-3 shadow-card flex gap-3">
            <div className="size-20 rounded-xl bg-muted overflow-hidden flex-shrink-0">
              {it.product?.images?.[0] && <img src={it.product.images[0]} alt="" className="size-full object-cover" />}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold line-clamp-2">{it.product?.name_ar}</h3>
              {it.product?.oem_number && <div className="text-[10px] text-muted-foreground font-mono">OEM: {it.product.oem_number}</div>}
              {it.side && (
                <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-black bg-navy text-primary-foreground rounded-full px-2 py-0.5">
                  {it.side === "LH" ? "LH · يسار" : "RH · يمين"}
                </div>
              )}
              <div className="text-navy font-extrabold text-sm mt-1">{formatIQD(it.product?.price_iqd)}</div>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center bg-muted rounded-lg">
                  <button onClick={() => setQty(it.id, it.quantity - 1)} className="size-7 grid place-items-center"><Minus className="size-3.5" /></button>
                  <span className="w-8 text-center text-sm font-bold">{it.quantity}</span>
                  <button onClick={() => setQty(it.id, it.quantity + 1)} className="size-7 grid place-items-center"><Plus className="size-3.5" /></button>
                </div>
                <button onClick={() => remove(it.id)} className="ms-auto size-8 grid place-items-center text-destructive"><Trash2 className="size-4" /></button>
              </div>
            </div>
          </div>
        ))}

        <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
          <div className="flex justify-between text-sm mb-2"><span className="text-muted-foreground">المجموع الفرعي</span><span className="font-bold">{formatIQD(total)}</span></div>
          <div className="flex justify-between text-sm mb-3"><span className="text-muted-foreground">التوصيل</span><span className="font-bold">يحسب لاحقاً</span></div>
          <div className="border-t border-border pt-3 flex justify-between items-baseline">
            <span className="font-bold">الإجمالي</span>
            <span className="text-xl font-black text-navy">{formatIQD(total)}</span>
          </div>
        </div>

        <button onClick={() => navigate({ to: "/checkout" })} className="w-full h-14 rounded-2xl bg-gradient-gold text-navy font-black shadow-gold hover:brightness-105 transition">
          متابعة الدفع
        </button>
      </div>
    </PageShell>
  );
}