import { createFileRoute, Link, useRouter, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Heart, Minus, Plus, Share2, Shield, ShoppingCart, Truck, CheckCircle2, XCircle } from "lucide-react";
import { productByIdQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { formatIQD, formatUSD, whatsappLink } from "@/lib/format";
import { useAuth } from "@/lib/use-auth";
import { useSetting } from "@/lib/admin";
import { toast } from "sonner";
import { WhatsappIcon } from "@/components/icons";

export const Route = createFileRoute("/product/$id")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(productByIdQuery(params.id)).catch(() => { throw notFound(); });
  },
  head: ({ params }) => ({
    meta: [{ title: `المنتج · Ali Parts` }, { name: "description", content: `تفاصيل المنتج ${params.id}` }],
  }),
  component: ProductPage,
  errorComponent: ({ reset }) => {
    const router = useRouter();
    return (
      <div className="p-8 text-center">
        <p className="mb-4">حدث خطأ في تحميل المنتج</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="px-4 py-2 rounded-xl bg-navy text-primary-foreground">إعادة المحاولة</button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-8 text-center">المنتج غير موجود</div>,
});

function ProductPage() {
  const { id } = Route.useParams();
  const { data: product } = useSuspenseQuery(productByIdQuery(id));
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const router = useRouter();
  const waNumber = useSetting("whatsapp_number");

  const img = product.images?.[activeImg];

  const requireAuth = () => {
    if (!userId) {
      toast.error("سجّل الدخول أولاً");
      return false;
    }
    return true;
  };

  const addToCart = async () => {
    if (!requireAuth()) return;
    const { data: existing } = await supabase.from("cart_items").select("id, quantity").eq("user_id", userId!).eq("product_id", product.id).maybeSingle();
    if (existing) {
      await supabase.from("cart_items").update({ quantity: existing.quantity + qty }).eq("id", existing.id);
    } else {
      await supabase.from("cart_items").insert({ user_id: userId!, product_id: product.id, quantity: qty });
    }
    toast.success("تمت الإضافة إلى السلة");
    qc.invalidateQueries({ queryKey: ["cart"] });
  };

  const buyNow = async () => {
    if (!requireAuth()) return;
    await addToCart();
    router.navigate({ to: "/checkout" });
  };

  const toggleFav = async () => {
    if (!requireAuth()) return;
    const { data: existing } = await supabase.from("favorites").select("id").eq("user_id", userId!).eq("product_id", product.id).maybeSingle();
    if (existing) {
      await supabase.from("favorites").delete().eq("id", existing.id);
      toast.success("أزيل من المفضلة");
    } else {
      await supabase.from("favorites").insert({ user_id: userId!, product_id: product.id });
      toast.success("أضيف للمفضلة");
    }
    qc.invalidateQueries({ queryKey: ["favorites"] });
  };

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: product.name_ar, url }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("نُسخ الرابط");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="relative bg-card">
        <button onClick={() => router.history.back()} className="absolute top-4 start-4 z-10 size-10 rounded-full bg-white/90 shadow-card grid place-items-center">
          <ArrowRight className="size-5" />
        </button>
        <button onClick={share} className="absolute top-4 end-4 z-10 size-10 rounded-full bg-white/90 shadow-card grid place-items-center">
          <Share2 className="size-5" />
        </button>
        <div className="aspect-square bg-muted grid place-items-center">
          {img ? (
            <img src={img} alt={product.name_ar} className="size-full object-cover" />
          ) : (
            <span className="text-8xl opacity-30">⚙️</span>
          )}
        </div>
        {product.images && product.images.length > 1 && (
          <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
            {product.images.map((im, i) => (
              <button key={i} onClick={() => setActiveImg(i)} className={`size-14 rounded-xl overflow-hidden border-2 flex-shrink-0 ${activeImg === i ? "border-gold" : "border-transparent"}`}>
                <img src={im} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
        <div>
          <h1 className="text-xl font-extrabold leading-tight">{product.name_ar}</h1>
          {product.oem_number && (
            <div className="mt-2 inline-flex items-center gap-2 bg-muted rounded-lg px-3 py-1 text-xs font-mono">
              OEM: <span className="font-bold">{product.oem_number}</span>
            </div>
          )}
        </div>

        <div className="flex items-end gap-3">
          <div>
            <div className="text-3xl font-black text-navy">{formatIQD(product.price_iqd)}</div>
            <div className="text-sm text-muted-foreground">{formatUSD(product.price_usd)}</div>
          </div>
          <div className="ms-auto">
            {product.in_stock ? (
              <span className="inline-flex items-center gap-1 text-success text-xs font-bold bg-success/10 border border-success/30 px-2.5 py-1 rounded-full">
                <CheckCircle2 className="size-3.5" /> متوفر
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-destructive text-xs font-bold bg-destructive/10 border border-destructive/30 px-2.5 py-1 rounded-full">
                <XCircle className="size-3.5" /> غير متوفر
              </span>
            )}
          </div>
        </div>

        {product.description_ar && (
          <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
            <div className="text-xs font-bold text-gold mb-2">الوصف</div>
            <p className="text-sm text-foreground/80 leading-relaxed">{product.description_ar}</p>
          </div>
        )}

        {product.compatible_models && product.compatible_models.length > 0 && (
          <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
            <div className="text-xs font-bold text-gold mb-2">السيارات المتوافقة</div>
            <div className="flex flex-wrap gap-2">
              {product.compatible_models.map((m) => (
                <span key={m} className="text-xs px-2.5 py-1 rounded-full bg-navy text-primary-foreground">{m}</span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card rounded-2xl border border-border p-3 shadow-card text-center">
            <Shield className="size-5 text-gold mx-auto mb-1" />
            <div className="text-xs font-bold">قطع أصلية</div>
          </div>
          <div className="bg-card rounded-2xl border border-border p-3 shadow-card text-center">
            <Truck className="size-5 text-gold mx-auto mb-1" />
            <div className="text-xs font-bold">توصيل سريع</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-bold">الكمية:</span>
          <div className="flex items-center bg-card border border-border rounded-xl">
            <button onClick={() => setQty(Math.max(1, qty - 1))} className="size-9 grid place-items-center"><Minus className="size-4" /></button>
            <span className="w-10 text-center font-bold">{qty}</span>
            <button onClick={() => setQty(qty + 1)} className="size-9 grid place-items-center"><Plus className="size-4" /></button>
          </div>
          <button onClick={toggleFav} className="ms-auto size-10 rounded-xl bg-card border border-border grid place-items-center">
            <Heart className="size-5" />
          </button>
          <a href={whatsappLink(`استفسار: ${product.name_ar}`)} target="_blank" rel="noreferrer" className="size-10 rounded-xl bg-whatsapp text-white grid place-items-center">
            <WhatsappIcon className="size-5" />
          </a>
        </div>

        <Link to="/" className="text-xs text-muted-foreground text-center block pt-2">
          عد للرئيسية
        </Link>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md flex gap-2">
          <button
            onClick={addToCart}
            disabled={!product.in_stock}
            className="flex-1 h-12 rounded-2xl border-2 border-navy text-navy font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition hover:bg-navy hover:text-primary-foreground"
          >
            <ShoppingCart className="size-4" /> أضف للسلة
          </button>
          <button
            onClick={buyNow}
            disabled={!product.in_stock}
            className="flex-1 h-12 rounded-2xl bg-gradient-gold text-navy font-black shadow-gold disabled:opacity-40 hover:brightness-105 transition"
          >
            اشترِ الآن
          </button>
        </div>
      </div>
    </div>
  );
}