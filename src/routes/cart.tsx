import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Trash2, ShoppingBag, StickyNote } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { formatIQD } from "@/lib/format";
import { useAuth } from "@/lib/use-auth";
import { cartQuery, productsByIdsQuery } from "@/lib/queries";
import { useAdjustedPrice } from "@/lib/admin";
import { computeShipping } from "@/lib/shipping";
import { toast } from "sonner";
import {
  getGuestCartSnapshot,
  removeGuestCartItem,
  updateGuestCartItem,
  type GuestCartItem,
} from "@/lib/guest-cart";

export const Route = createFileRoute("/cart")({
  component: CartPage,
});

const EMPTY_GUEST_CART: GuestCartItem[] = [];
function useGuestCart(): GuestCartItem[] {
  return useSyncExternalStore(
    (cb) => {
      const onChange = () => cb();
      window.addEventListener("guest-cart:changed", onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener("guest-cart:changed", onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    () => getGuestCartSnapshot(),
    () => EMPTY_GUEST_CART,
  );
}

function CartPage() {
  const { userId, loading } = useAuth();
  if (loading) {
    return (
      <PageShell title="السلة">
        <div className="px-4 pt-4 pb-6">
          <div className="h-24 rounded-2xl bg-muted animate-pulse" />
        </div>
      </PageShell>
    );
  }
  return userId ? <AuthedCart userId={userId} /> : <GuestCart />;
}

function AuthedCart({ userId }: { userId: string }) {
  const { data: items = [], isLoading, isError, refetch } = useQuery(cartQuery(userId));
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pendingIds, setPendingIds] = useState<Record<string, boolean>>({});
  const markPending = (id: string, on: boolean) => setPendingIds((p) => ({ ...p, [id]: on }));
  const adjust = useAdjustedPrice();

  const total = items.reduce((s, i: any) => s + adjust(i.product?.price_iqd) * i.quantity, 0);
  const shippingCost = computeShipping(items as any);
  const grandTotal = total + shippingCost;

  const setQty = async (id: string, q: number) => {
    if (q <= 0) return remove(id);
    markPending(id, true);
    const { error } = await supabase.from("cart_items").update({ quantity: q }).eq("id", id);
    if (error) toast.error("تعذر تحديث الكمية.");
    else await qc.invalidateQueries({ queryKey: ["cart"] });
    markPending(id, false);
  };
  const remove = async (id: string) => {
    markPending(id, true);
    const { error } = await supabase.from("cart_items").delete().eq("id", id);
    if (error) {
      toast.error("تعذر حذف المنتج.");
      markPending(id, false);
      return;
    }
    toast.success("أزيل من السلة");
    await qc.invalidateQueries({ queryKey: ["cart"] });
    markPending(id, false);
  };
  const saveNote = async (id: string, note: string) => {
    const value = note.trim() || null;
    const { error } = await supabase.from("cart_items").update({ note: value }).eq("id", id);
    if (error) return toast.error("تعذر حفظ الملاحظة.");
    qc.invalidateQueries({ queryKey: ["cart"] });
  };
  const changeSide = async (row: any, newSide: "LH" | "RH" | "PAIR" | null) => {
    if (row.side === newSide) return;
    let existingQuery = supabase
      .from("cart_items").select("id, quantity")
      .eq("user_id", userId).eq("product_id", row.product_id);
    existingQuery = newSide ? existingQuery.eq("side", newSide) : existingQuery.is("side", null);
    const { data: existing } = await existingQuery.maybeSingle();
    if (existing && existing.id !== row.id) {
      await supabase.from("cart_items").update({ quantity: existing.quantity + row.quantity }).eq("id", existing.id);
      await supabase.from("cart_items").delete().eq("id", row.id);
      toast.success("تم دمج السطر مع نفس الجهة");
    } else {
      const { error } = await supabase.from("cart_items").update({ side: newSide }).eq("id", row.id);
      if (error) return toast.error("تعذر تغيير الجهة");
      toast.success(newSide ? `تم التغيير إلى ${newSide}` : "أُلغيت الجهة");
    }
    qc.invalidateQueries({ queryKey: ["cart"] });
  };

  if (isLoading) return <PageShell title="السلة"><div className="px-4 pt-4"><div className="h-24 rounded-2xl bg-muted animate-pulse" /></div></PageShell>;
  if (isError) return (
    <PageShell title="السلة">
      <div className="px-6 py-20 text-center">
        <p className="text-sm text-muted-foreground mb-6">تعذر تحميل السلة</p>
        <button onClick={() => refetch()} className="px-6 py-3 rounded-2xl bg-gradient-gold text-navy font-bold shadow-gold">إعادة المحاولة</button>
      </div>
    </PageShell>
  );
  if (items.length === 0) return <EmptyCart />;

  return (
    <PageShell title="السلة">
      <div className="px-4 pt-4 pb-6 space-y-3">
        {items.map((it: any) => (
          <ItemRow
            key={it.id}
            image={it.product?.images?.[0]}
            name={it.product?.name_ar}
            oem={it.product?.oem_number}
            price={adjust(it.product?.price_iqd)}
            quantity={it.quantity}
            side={it.side}
            note={it.note ?? ""}
            pending={!!pendingIds[it.id]}
            onQty={(q) => setQty(it.id, q)}
            onRemove={() => remove(it.id)}
            onSide={(s) => changeSide(it, s)}
            onNote={(v) => saveNote(it.id, v)}
          />
        ))}
        <Summary subtotal={total} shipping={shippingCost} total={grandTotal} />
        <button onClick={() => navigate({ to: "/checkout" })} className="w-full h-14 rounded-2xl bg-gradient-gold text-navy font-black shadow-gold">
          متابعة الدفع
        </button>
      </div>
    </PageShell>
  );
}

function GuestCart() {
  const guestItems = useGuestCart();
  const productIds = guestItems.map((i) => i.product_id);
  const { data: products = [] } = useQuery(productsByIdsQuery(productIds));
  const adjust = useAdjustedPrice();
  const navigate = useNavigate();

  const productMap = new Map(products.map((p) => [p.id, p]));
  const enriched = guestItems.map((i, idx) => ({ ...i, idx, product: productMap.get(i.product_id) }));

  const total = enriched.reduce((s, i) => s + adjust(i.product?.price_iqd ?? 0) * i.quantity, 0);
  const shippingCost = computeShipping(
    enriched.map((i) => ({ quantity: i.quantity, product: i.product })) as any,
  );
  const grandTotal = total + shippingCost;

  if (guestItems.length === 0) return <EmptyCart />;

  return (
    <PageShell title="السلة">
      <div className="px-4 pt-4 pb-6 space-y-3">
        {enriched.map((it) => (
          <ItemRow
            key={it.idx}
            image={it.product?.images?.[0]}
            name={it.product?.name_ar ?? "منتج"}
            oem={it.product?.oem_number}
            price={adjust(it.product?.price_iqd ?? 0)}
            quantity={it.quantity}
            side={it.side}
            note={it.note ?? ""}
            pending={false}
            onQty={(q) => (q <= 0 ? removeGuestCartItem(it.idx) : updateGuestCartItem(it.idx, { quantity: q }))}
            onRemove={() => removeGuestCartItem(it.idx)}
            onSide={(s) => updateGuestCartItem(it.idx, { side: s })}
            onNote={(v) => updateGuestCartItem(it.idx, { note: v.trim() || null })}
          />
        ))}
        <Summary subtotal={total} shipping={shippingCost} total={grandTotal} />
        <button
          onClick={() => navigate({ to: "/checkout" })}
          className="w-full h-14 rounded-2xl bg-gradient-gold text-navy font-black shadow-gold"
        >
          متابعة الدفع
        </button>
        <p className="text-center text-[11px] text-muted-foreground pt-2">
          يمكنك إكمال الطلب مباشرة بدون تسجيل دخول
        </p>
      </div>
    </PageShell>
  );
}

function EmptyCart() {
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

function Summary({ subtotal, shipping, total }: { subtotal: number; shipping: number; total: number }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
      <div className="flex justify-between text-sm mb-2"><span className="text-muted-foreground">المجموع الفرعي</span><span className="font-bold">{formatIQD(subtotal)}</span></div>
      <div className="flex justify-between text-sm mb-3"><span className="text-muted-foreground">التوصيل</span><span className="font-bold">{shipping > 0 ? formatIQD(shipping) : "مجاني"}</span></div>
      <div className="border-t border-border pt-3 flex justify-between items-baseline">
        <span className="font-bold">الإجمالي</span>
        <span className="text-xl font-black text-navy">{formatIQD(total)}</span>
      </div>
    </div>
  );
}

function ItemRow({
  image, name, oem, price, quantity, side, note, pending,
  onQty, onRemove, onSide, onNote,
}: {
  image?: string; name: string; oem?: string | null; price: number; quantity: number;
  side: "LH" | "RH" | "PAIR" | null | undefined; note: string; pending: boolean;
  onQty: (q: number) => void; onRemove: () => void;
  onSide: (s: "LH" | "RH" | "PAIR" | null) => void; onNote: (v: string) => void;
}) {
  return (
    <div className={`relative bg-card rounded-2xl border border-border p-3 shadow-card flex gap-3 transition ${pending ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="size-20 rounded-xl bg-muted overflow-hidden flex-shrink-0">
        {image && <img src={image} alt="" loading="lazy" decoding="async" className="size-full object-cover" />}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold line-clamp-2">{name}</h3>
        {oem && <div className="text-[10px] text-muted-foreground font-mono">OEM: {oem}</div>}
        <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-muted p-0.5">
          {(["LH", "RH", "PAIR"] as const).map((s) => (
            <button key={s} onClick={() => onSide(side === s ? null : s)}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black transition ${side === s ? "bg-navy text-primary-foreground shadow" : "text-muted-foreground"}`}>
              {s === "LH" ? "LH · يسار" : s === "RH" ? "RH · يمين" : "تخم"}
            </button>
          ))}
        </div>
        <div className="text-navy font-extrabold text-sm mt-1">{formatIQD(price)}</div>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex items-center bg-muted rounded-lg">
            <button onClick={() => onQty(quantity - 1)} className="size-7 grid place-items-center"><Minus className="size-3.5" /></button>
            <span className="w-8 text-center text-sm font-bold">{quantity}</span>
            <button onClick={() => onQty(quantity + 1)} className="size-7 grid place-items-center"><Plus className="size-3.5" /></button>
          </div>
          <button onClick={onRemove} className="ms-auto size-8 grid place-items-center text-destructive"><Trash2 className="size-4" /></button>
        </div>
        <ItemNote initial={note} onSave={onNote} />
      </div>
    </div>
  );
}

function ItemNote({ initial, onSave }: { initial: string; onSave: (v: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(!!initial);
  const [value, setValue] = useState(initial);
  const original = useRef(initial);
  useEffect(() => { setValue(initial); original.current = initial; }, [initial]);
  const commit = () => { if (value === original.current) return; original.current = value; onSave(value); };
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1 text-[11px] text-gold font-bold">
      <StickyNote className="size-3.5" /> إضافة ملاحظة
    </button>
  );
  return (
    <div className="mt-2">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
        <StickyNote className="size-3.5 text-gold" /> ملاحظة لهذا المنتج
      </div>
      <textarea value={value} onChange={(e) => setValue(e.target.value)} onBlur={commit} rows={2} maxLength={300}
        placeholder="لون، مقاس، تفاصيل إضافية..."
        className="w-full rounded-lg border border-border bg-background p-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-gold" />
    </div>
  );
}