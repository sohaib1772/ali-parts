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
    const { error } = await supabase.from("cart_items").upsert(
      { user_id: userId!, product_id: product.id, quantity: 1 },
      { onConflict: "user_id,product_id", ignoreDuplicates: false },
    );
    if (error) return toast.error("تعذّر إضافة المنتج");
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
        {!product.in_stock && (
          <div className="absolute inset-0 bg-navy/60 grid place-items-center">
            <span className="px-3 py-1 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">غير متوفر</span>
          </div>
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
          </div>
        </div>
        <div className="flex items-center gap-1.5 pt-1">
          <button
            onClick={addToCart}
            disabled={!product.in_stock}
            className="flex-1 h-9 rounded-xl bg-navy text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-gold hover:text-navy disabled:opacity-50 disabled:pointer-events-none transition"
          >
            <ShoppingCart className="size-3.5" />
            أضف للسلة
          </button>
          <a
            href={whatsappLink(`السلام عليكم، أرغب بالاستفسار عن: ${product.name_ar} (OEM: ${product.oem_number ?? "-"})`, waNumber)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="واتساب"
            className="size-9 rounded-xl bg-whatsapp text-white grid place-items-center hover:opacity-90 transition"
          >
            <WhatsappIcon className="size-4" />
          </a>
        </div>
      </div>
    </Link>
  );
}