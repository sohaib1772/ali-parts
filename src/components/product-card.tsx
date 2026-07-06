import { Link } from "@tanstack/react-router";
import { Heart, ShoppingCart } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatIQD, whatsappLink } from "@/lib/format";
import type { Product } from "@/lib/queries";
import { useAuth } from "@/lib/use-auth";
import { useSetting } from "@/lib/admin";
import { WhatsappIcon } from "./icons";

export function ProductCard({ product }: { product: Product }) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const img = product.images?.[0];
  const waNumber = useSetting("whatsapp_number");
  const stockQty = (product as any).stock_qty ?? 0;
  const available = product.in_stock && stockQty > 0;
  const condition = (product as any).condition === "used" ? "used" : "new";

  const requireAuth = () => {
    if (!userId) {
      toast.error("سجّل الدخول أولاً لإكمال هذه الخطوة");
      return false;
    }
    return true;
  };

  const addToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!requireAuth()) return;
    const { error } = await (supabase as any).rpc("add_cart_item", {
      p_product_id: product.id,
      p_quantity: 1,
      p_side: null,
    });
    if (error) {
      toast.error("تعذر إضافة المنتج للسلة");
      return;
    }
    window.dispatchEvent(new CustomEvent("cart:changed", { detail: { delta: 1, bump: true } }));
    toast.success("تمت الإضافة إلى السلة");
    qc.invalidateQueries({ queryKey: ["cart"] });
  };

  const toggleFav = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!requireAuth()) return;
    const { data: existing } = await supabase
      .from("favorites").select("id").eq("user_id", userId!).eq("product_id", product.id).maybeSingle();
    if (existing) {
      await supabase.from("favorites").delete().eq("id", existing.id);
      toast.success("أزيل من المفضلة");
    } else {
      await supabase.from("favorites").insert({ user_id: userId!, product_id: product.id });
      toast.success("أضيف للمفضلة");
    }
    qc.invalidateQueries({ queryKey: ["favorites"] });
  };

  return (
    <Link
      to="/product/$id"
      params={{ id: product.id }}
      className="group relative flex flex-col rounded-2xl bg-card border border-border/60 shadow-card overflow-hidden hover:shadow-luxe transition-all duration-300"
    >
      <div className="relative aspect-square bg-muted overflow-hidden">
        {img ? (
          <img src={img} alt={product.name_ar} loading="lazy" className="size-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="size-full bg-gradient-to-br from-muted to-secondary grid place-items-center">
            <span className="text-4xl opacity-30">⚙️</span>
          </div>
        )}
        <button
          onClick={toggleFav}
          aria-label="مفضلة"
          className="absolute top-2 start-2 size-8 rounded-full bg-card/90 backdrop-blur grid place-items-center shadow hover:bg-gold hover:text-navy transition"
        >
          <Heart className="size-4" />
        </button>
        {product.is_deal && (
          <span className="absolute top-2 end-2 px-2 py-0.5 rounded-full bg-gradient-gold text-navy text-[10px] font-bold shadow-gold">عرض</span>
        )}
        <span
          className={`absolute top-2 ${product.is_deal ? "end-14" : "end-2"} px-2 py-0.5 rounded-full text-[10px] font-bold shadow ${
            condition === "used" ? "bg-amber-500 text-white" : "bg-emerald-600 text-white"
          }`}
        >
          {condition === "used" ? "مستعمل" : "جديد"}
        </span>
        {!available && (
          <div className="absolute inset-0 bg-navy/60 grid place-items-center">
            <span className="px-3 py-1 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">غير متوفر</span>
          </div>
        )}
        {available && (
          <span
            className={`absolute bottom-2 start-2 px-2 py-0.5 rounded-full text-[10px] font-bold shadow ${
              stockQty <= 5 ? "bg-destructive text-destructive-foreground" : "bg-success text-white"
            }`}
          >
            {stockQty <= 5 ? `متبقي ${stockQty}` : `متوفر · ${stockQty}`}
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <h3 className="text-sm font-semibold line-clamp-2 leading-tight">{product.name_ar}</h3>
        {product.oem_number && (
          <div className="text-[10px] text-muted-foreground font-mono tracking-tight">OEM: {product.oem_number}</div>
        )}
        <div className="mt-auto space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-extrabold text-navy">{formatIQD(product.price_iqd)}</span>
            {available ? (
              <span className="ms-auto text-[10px] font-bold text-success">
                متوفر · {stockQty} قطعة
              </span>
            ) : (
              <span className="ms-auto text-[10px] font-bold text-destructive">غير متوفر</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 pt-1">
          <button
            onClick={addToCart}
            disabled={!available}
            className="flex-1 h-9 rounded-xl bg-navy text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-gold hover:text-navy disabled:opacity-50 disabled:pointer-events-none transition"
          >
            <ShoppingCart className="size-3.5" />
            أضف للسلة
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.open(whatsappLink(`السلام عليكم، أرغب بالاستفسار عن: ${product.name_ar} (OEM: ${product.oem_number ?? "-"})`, waNumber), "_blank", "noopener,noreferrer");
            }}
            aria-label="واتساب"
            className="size-9 rounded-xl bg-whatsapp text-white grid place-items-center hover:opacity-90 transition"
          >
            <WhatsappIcon className="size-4" />
          </button>
        </div>
      </div>
    </Link>
  );
}