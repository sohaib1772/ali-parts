import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Trash2, ShoppingBag, StickyNote } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const { data: items = [], isLoading, isError, refetch } = useQuery(cartQuery(userId));
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pendingIds, setPendingIds] = useState<Record<string, boolean>>({});
  const markPending = (id: string, on: boolean) =>
    setPendingIds((p) => ({ ...p, [id]: on }));

  const total = items.reduce((s, i: any) => s + Number(i.product?.price_iqd ?? 0) * i.quantity, 0);

  const setQty = async (id: string, q: number) => {
    if (q <= 0) return remove(id);
    markPending(id, true);
    const { error } = await supabase.from("cart_items").update({ quantity: q }).eq("id", id);
    if (error) {
      toast.error("تعذر تحديث الكمية. حاول مرة أخرى.");
    } else {
      await qc.invalidateQueries({ queryKey: ["cart"] });
    }
    markPending(id, false);
  };
  const remove = async (id: string) => {
    markPending(id, true);
    const { error } = await supabase.from("cart_items").delete().eq("id", id);
    if (error) {
      toast.error("تعذر حذف المنتج. حاول مرة أخرى.");
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
    if (error) {
      toast.error("تعذر حفظ الملاحظة.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["cart"] });
  };

  const changeSide = async (row: any, newSide: "LH" | "RH" | "PAIR" | null) => {
    if (row.side === newSide) return;
    // Merge with an existing line for the same (product, side) — treat null as its own slot.
    let existingQuery = supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", userId!)
      .eq("product_id", row.product_id);
    existingQuery = newSide ? existingQuery.eq("side", newSide) : existingQuery.is("side", null);
    const { data: existing } = await existingQuery.maybeSingle();
    if (existing && existing.id !== row.id) {
      await supabase
        .from("cart_items")
        .update({ quantity: existing.quantity + row.quantity })
        .eq("id", existing.id);
      await supabase.from("cart_items").delete().eq("id", row.id);
      toast.success("تم دمج السطر مع نفس الجهة");
    } else {
      const { error } = await supabase.from("cart_items").update({ side: newSide }).eq("id", row.id);
      if (error) {
        toast.error("تعذر تغيير الجهة");
        return;
      }
      toast.success(newSide ? `تم التغيير إلى ${newSide}` : "أُلغيت الجهة");
    }
    qc.invalidateQueries({ queryKey: ["cart"] });
  };

  if (isLoading) {
    return (
      <PageShell title="السلة">
        <div className="px-4 pt-4 pb-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-card rounded-2xl border border-border p-3 shadow-card flex gap-3 animate-pulse">
              <div className="size-20 rounded-xl bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
                <div className="h-8 bg-muted rounded w-24 mt-3" />
              </div>
            </div>
          ))}
          <div className="bg-card rounded-2xl border border-border p-4 shadow-card space-y-2 animate-pulse">
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-6 bg-muted rounded w-1/2 mt-3" />
          </div>
        </div>
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell title="السلة">
        <div className="px-6 py-20 text-center">
          <h2 className="text-lg font-bold mb-2 text-destructive">تعذر تحميل السلة</h2>
          <p className="text-sm text-muted-foreground mb-6">تحقق من الاتصال ثم أعد المحاولة.</p>
          <button onClick={() => refetch()} className="px-6 py-3 rounded-2xl bg-gradient-gold text-navy font-bold shadow-gold">
            إعادة المحاولة
          </button>
        </div>
      </PageShell>
    );
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
              <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-muted p-0.5">
                {(["LH", "RH", "PAIR"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => changeSide(it, it.side === s ? null : s)}
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black transition ${
                      it.side === s
                        ? "bg-navy text-primary-foreground shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s === "LH" ? "LH · يسار" : s === "RH" ? "RH · يمين" : "تخم"}
                  </button>
                ))}
                {!it.side && (
                  <span className="px-2 text-[10px] text-muted-foreground">اختياري</span>
                )}
              </div>
              <div className="text-navy font-extrabold text-sm mt-1">{formatIQD(it.product?.price_iqd)}</div>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center bg-muted rounded-lg">
                  <button onClick={() => setQty(it.id, it.quantity - 1)} className="size-7 grid place-items-center"><Minus className="size-3.5" /></button>
                  <span className="w-8 text-center text-sm font-bold">{it.quantity}</span>
                  <button onClick={() => setQty(it.id, it.quantity + 1)} className="size-7 grid place-items-center"><Plus className="size-3.5" /></button>
                </div>
                <button onClick={() => remove(it.id)} className="ms-auto size-8 grid place-items-center text-destructive"><Trash2 className="size-4" /></button>
              </div>
              <ItemNote initial={it.note ?? ""} onSave={(v) => saveNote(it.id, v)} />
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

function ItemNote({ initial, onSave }: { initial: string; onSave: (v: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(!!initial);
  const [value, setValue] = useState(initial);
  const original = useRef(initial);
  useEffect(() => {
    setValue(initial);
    original.current = initial;
  }, [initial]);
  const commit = () => {
    if (value === original.current) return;
    original.current = value;
    onSave(value);
  };
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-gold font-bold"
      >
        <StickyNote className="size-3.5" /> إضافة ملاحظة
      </button>
    );
  }
  return (
    <div className="mt-2">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
        <StickyNote className="size-3.5 text-gold" /> ملاحظة لهذا المنتج
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        rows={2}
        maxLength={300}
        placeholder="لون، مقاس، تفاصيل إضافية..."
        className="w-full rounded-lg border border-border bg-background p-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-gold"
      />
    </div>
  );
}