import { createFileRoute, Link, useRouter, useNavigate, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, Suspense } from "react";
import { ArrowRight, Heart, Minus, Plus, Share2, Shield, ShoppingCart, Truck, CheckCircle2, XCircle, Facebook, X as CloseIcon, Clock, RefreshCw, Loader2, Paperclip, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { productByIdQuery, carModelsQuery, brandsQuery, productsByCategoryQuery } from "@/lib/queries";
import type { Product } from "@/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatIQD, whatsappLink } from "@/lib/format";
import { useAuth } from "@/lib/use-auth";
import { useSetting, useAdjustedPrice } from "@/lib/admin";
import { toast } from "sonner";
import { WhatsappIcon } from "@/components/icons";
import { uploadWithProgress } from "@/lib/upload-with-progress";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/product/$id")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(productByIdQuery(params.id)).catch(() => { throw notFound(); });
  },
  head: ({ params }) => ({
    meta: [{ title: `المنتج · Ali Parts` }, { name: "description", content: `تفاصيل المنتج ${params.id}` }],
  }),
  component: ProductPage,
  // Only show the skeleton if data actually takes a moment; when the router
  // preloaded on intent the navigation should feel instant.
  pendingMs: 400,
  pendingMinMs: 0,
  pendingComponent: ProductPending,
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

function ProductPending() {
  return (
    <div className="h-[100dvh] overflow-y-auto overflow-x-hidden bg-background">
      <div className="px-4 pt-4">
        <Skeleton className="w-full aspect-square rounded-3xl" />
        <div className="flex gap-2 mt-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="size-16 rounded-xl" />
          ))}
        </div>
        <div className="mt-5 space-y-3">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-1/3" />
          <div className="pt-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
          <Skeleton className="h-12 w-full rounded-2xl mt-4" />
        </div>
      </div>
    </div>
  );
}

function ProductPage() {
  const { id } = Route.useParams();
  const { data: product } = useSuspenseQuery(productByIdQuery(id));
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const [side, setSide] = useState<"LH" | "RH" | "PAIR" | null>(null);
  const router = useRouter();
  const navigate = useNavigate();
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      navigate({ to: "/" });
    }
  };
  const waNumber = useSetting("whatsapp_number");
  const adjust = useAdjustedPrice();

  // Show a "طلب استبدال" shortcut if this product was delivered in one of the user's orders
  const { data: deliveredOrder, isPending: deliveredPending } = useQuery({
    queryKey: ["product-delivered-order", id, userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, order_id, orders!inner(id, user_id, status, order_number, created_at)")
        .eq("product_id", id)
        .eq("orders.user_id", userId!)
        .eq("orders.status", "delivered")
        .order("created_at", { ascending: false, referencedTable: "orders" as any })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data as any;
    },
  });
  const deliveredOrderId: string | null = deliveredOrder?.order_id ?? null;
  const deliveredOrderItemId: string | null = deliveredOrder?.id ?? null;

  const img = product.images?.[activeImg];
  const stockQty = (product as any).stock_qty ?? 0;
  const available = product.in_stock && stockQty > 0;
  const condition = (product as any).condition === "used" ? "used" : "new";

  const requireAuth = () => {
    if (!userId) {
      toast.error("سجّل الدخول أولاً");
      return false;
    }
    return true;
  };

  const addToCart = async () => {
    if (!requireAuth()) return false;
    const q = supabase
      .from("cart_items")
      .select("id, quantity, side")
      .eq("user_id", userId!)
      .eq("product_id", product.id);
    const { data: existing } = await (side ? q.eq("side", side) : q.is("side", null)).maybeSingle();
    if (existing && existing.quantity === qty) {
      toast.error("هذا المنتج مضاف مسبقاً بنفس الكمية، غيّر الكمية أولاً");
      return false;
    }
    const { error } = await (supabase as any).rpc("add_cart_item", {
      p_product_id: product.id,
      p_quantity: qty,
      p_side: side ?? null,
    });
    if (error) {
      toast.error("تعذر إضافة المنتج للسلة");
      return false;
    }
    window.dispatchEvent(new CustomEvent("cart:changed", { detail: { delta: qty, bump: true } }));
    toast.success("تمت الإضافة إلى السلة");
    qc.invalidateQueries({ queryKey: ["cart"] });
    return true;
  };

  const buyNow = async () => {
    if (!requireAuth()) return;
    if (await addToCart()) router.navigate({ to: "/checkout" });
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
    setShareOpen(true);
  };
  const [shareOpen, setShareOpen] = useState(false);
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `${product.name_ar}${product.oem_number ? ` (OEM: ${product.oem_number})` : ""}`;
  const waShareHref = whatsappLink(`${shareText}\n${shareUrl}`, "");

  // ─── Quick replacement flow (from product page) ──────────────────────────
  const REASON_PRESETS = [
    "المنتج معطوب أو مكسور",
    "لا يطابق المواصفات",
    "المقاس أو الجهة (LH/RH) خطأ",
    "استلمت منتجًا مختلفًا",
  ] as const;
  const MAX_FILES = 6;
  const MAX_FILE_MB = 10;
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [reasonChoice, setReasonChoice] = useState<string>(REASON_PRESETS[0]);
  const [reasonText, setReasonText] = useState("");
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<
    { name: string; progress: number; status: "pending" | "uploading" | "done" | "error" }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openReplaceQuick = () => {
    if (!userId) {
      toast.error("سجّل الدخول أولاً");
      return;
    }
    setReasonChoice(REASON_PRESETS[0]);
    setReasonText("");
    setPickedFiles([]);
    setSubmittedId(null);
    setUploadProgress([]);
    setReplaceOpen(true);
  };

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    const slots = MAX_FILES - pickedFiles.length;
    const next: File[] = [];
    for (const f of Array.from(list).slice(0, slots)) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`${f.name}: يتجاوز ${MAX_FILE_MB} ميغابايت`);
        continue;
      }
      next.push(f);
    }
    setPickedFiles((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submitQuickReplace = async () => {
    if (submitting) return;
    if (!userId || !deliveredOrderId || !deliveredOrderItemId) return;
    const isOther = reasonChoice === "أخرى";
    const finalReason = (isOther ? reasonText : `${reasonChoice}${reasonText ? " — " + reasonText : ""}`).trim();
    if (finalReason.length < 5) {
      toast.error("يرجى كتابة سبب الاستبدال (5 أحرف على الأقل)");
      return;
    }
    setSubmitting(true);
    setUploadProgress(
      pickedFiles.map((f) => ({ name: f.name, progress: 0, status: "pending" as const })),
    );
    const { data: inserted, error: insertErr } = await supabase
      .from("replacement_requests" as any)
      .insert({
        user_id: userId,
        order_id: deliveredOrderId,
        order_item_id: deliveredOrderItemId,
        product_id: product.id,
        product_name_ar: product.name_ar,
        reason: finalReason,
      } as any)
      .select("id")
      .single();
    if (insertErr || !inserted) {
      setSubmitting(false);
      setUploadProgress([]);
      toast.error("تعذّر إرسال طلب الاستبدال");
      return;
    }
    const reqId = (inserted as any).id as string;

    const uploaded: string[] = [];
    for (let i = 0; i < pickedFiles.length; i++) {
      const file = pickedFiles[i];
      const extMatch = file.name.match(/\.([a-zA-Z0-9]+)$/);
      const ext = extMatch ? extMatch[1] : "bin";
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || `file.${ext}`;
      const key = `${userId}/${reqId}/${Date.now()}-${crypto.randomUUID().slice(0, 6)}-${safeName}`;
      setUploadProgress((q) =>
        q.map((it, idx) => (idx === i ? { ...it, status: "uploading" } : it)),
      );
      try {
        await uploadWithProgress("replacement-attachments", key, file, (pct) => {
          setUploadProgress((q) =>
            q.map((it, idx) => (idx === i ? { ...it, progress: Math.round(pct * 100) } : it)),
          );
        });
        setUploadProgress((q) =>
          q.map((it, idx) => (idx === i ? { ...it, progress: 100, status: "done" } : it)),
        );
        uploaded.push(key);
      } catch {
        setUploadProgress((q) =>
          q.map((it, idx) => (idx === i ? { ...it, status: "error" } : it)),
        );
      }
    }
    if (uploaded.length > 0) {
      await supabase.from("replacement_requests" as any).update({ attachments: uploaded } as any).eq("id", reqId);
    }
    setSubmitting(false);
    setSubmittedId(reqId);
    toast.success("تم إرسال طلب الاستبدال");
  };
  const fbShareHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("نُسخ الرابط");
    } catch {
      toast.error("تعذّر النسخ");
    }
  };

  return (
    <div className="h-[100dvh] overflow-y-auto overflow-x-hidden overscroll-contain bg-background pb-32" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
      <div className="relative bg-card">
        <button onClick={goBack} aria-label="رجوع" className="absolute top-4 start-4 z-20 size-10 rounded-full bg-white/90 shadow-card grid place-items-center">
          <ArrowRight className="size-5" />
        </button>
        <button onClick={share} className="absolute top-4 end-4 z-10 size-10 rounded-full bg-white/90 shadow-card grid place-items-center">
          <Share2 className="size-5" />
        </button>
        <div
          className="aspect-square bg-muted grid place-items-center select-none"
          onContextMenu={(e) => e.preventDefault()}
          style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
        >
          {img ? (
            <img
              src={img}
              alt={product.name_ar}
              draggable={false}
              decoding="async"
              fetchPriority="high"
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
              className="size-full object-cover pointer-events-none select-none"
              style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
            />
          ) : (
            <span className="text-8xl opacity-30">⚙️</span>
          )}
        </div>
        {product.images && product.images.length > 1 && (
          <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
            {product.images.map((im, i) => (
              <button key={i} onClick={() => setActiveImg(i)} className={`size-14 rounded-xl overflow-hidden border-2 flex-shrink-0 ${activeImg === i ? "border-gold" : "border-transparent"}`}>
                <img
                  src={im}
                  alt=""
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  onContextMenu={(e) => e.preventDefault()}
                  onDragStart={(e) => e.preventDefault()}
                  className="size-full object-cover pointer-events-none select-none"
                />
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
            <div className="text-3xl font-black text-navy">{formatIQD(adjust(product.price_iqd))}</div>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${
                condition === "used"
                  ? "text-amber-700 bg-amber-500/10 border-amber-500/40"
                  : "text-emerald-700 bg-emerald-500/10 border-emerald-500/40"
              }`}
            >
              {condition === "used" ? "مستعمل" : "جديد"}
            </span>
            {available ? (
              <span className="inline-flex items-center gap-1 text-success text-xs font-bold bg-success/10 border border-success/30 px-2.5 py-1 rounded-full">
                <CheckCircle2 className="size-3.5" /> متوفر · {stockQty} قطعة
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

        <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-gold">الجهة <span className="text-muted-foreground font-normal">(اختياري)</span></div>
            {side && (
              <button
                type="button"
                onClick={() => setSide(null)}
                className="text-[10px] font-bold text-muted-foreground hover:text-destructive"
              >
                إلغاء الاختيار
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setSide("LH")}
              className={`h-11 rounded-xl font-black text-sm border-2 transition ${side === "LH" ? "bg-navy text-primary-foreground border-navy" : "bg-card text-navy border-border"}`}
            >
              LH · يسار
            </button>
            <button
              type="button"
              onClick={() => setSide("RH")}
              className={`h-11 rounded-xl font-black text-sm border-2 transition ${side === "RH" ? "bg-navy text-primary-foreground border-navy" : "bg-card text-navy border-border"}`}
            >
              RH · يمين
            </button>
            <button
              type="button"
              onClick={() => setSide("PAIR")}
              className={`h-11 rounded-xl font-black text-sm border-2 transition ${side === "PAIR" ? "bg-gradient-gold text-navy border-gold" : "bg-card text-navy border-border"}`}
            >
              تخم · طقم
            </button>
          </div>
        </div>

        {product.compatible_models && product.compatible_models.length > 0 && (
          <Suspense fallback={<CompatibleModelsSkeleton count={product.compatible_models.length} />}>
            <CompatibleModels modelIds={product.compatible_models} />
          </Suspense>
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

        <div className="bg-gradient-to-br from-gold/15 to-gold/5 rounded-2xl border-2 border-gold/40 p-4 shadow-card">
          <div className="flex items-start gap-3">
            <div className="size-11 rounded-xl bg-gradient-gold text-navy grid place-items-center shrink-0 shadow-gold">
              <Clock className="size-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-extrabold text-navy">التوصيل خلال 72 ساعة</div>
              <div className="text-[11px] text-foreground/70 mt-0.5 leading-relaxed">
                يصلك المنتج خلال 72 ساعة كحد أقصى من وقت تأكيد الطلب.
              </div>
            </div>
          </div>
        </div>

        <a
          href={whatsappLink(`السلام عليكم، لدي استفسار/مشكلة بخصوص: ${product.name_ar}`, waNumber)}
          target="_blank"
          rel="noreferrer"
          className="block bg-card rounded-2xl border border-border p-4 shadow-card hover:border-whatsapp/60 transition"
        >
          <div className="flex items-start gap-3">
            <div className="size-11 rounded-xl bg-whatsapp text-white grid place-items-center shrink-0">
              <WhatsappIcon className="size-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-extrabold">عندك مشكلة أو استفسار؟</div>
              <div className="text-[11px] text-foreground/70 mt-0.5 leading-relaxed">
                تواصل مع قسم المبيعات مباشرة عبر واتساب وسنساعدك فوراً.
              </div>
            </div>
          </div>
        </a>

        {userId && deliveredPending && (
          <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
            <div className="flex items-start gap-3">
              <Skeleton className="size-11 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
              </div>
            </div>
          </div>
        )}
        {deliveredOrderId && (
          <button
            type="button"
            onClick={openReplaceQuick}
            className="w-full text-start block bg-card rounded-2xl border border-gold/60 p-4 shadow-card hover:bg-gold/5 transition"
          >
            <div className="flex items-start gap-3">
              <div className="size-11 rounded-xl bg-gold/15 text-gold grid place-items-center shrink-0">
                <RefreshCw className="size-5" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-extrabold text-navy">استبدل هذا المنتج بخطوات سريعة</div>
                <div className="text-[11px] text-foreground/70 mt-0.5 leading-relaxed">
                  اختر السبب وأرفق صورة أو مستند، ونرسل الطلب مباشرة — بدون التنقل بين الصفحات.
                </div>
              </div>
            </div>
          </button>
        )}

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
          <a href={whatsappLink(`استفسار: ${product.name_ar}`, waNumber)} target="_blank" rel="noreferrer" className="size-10 rounded-xl bg-whatsapp text-white grid place-items-center">
            <WhatsappIcon className="size-5" />
          </a>
        </div>

        <Link to="/" className="text-xs text-muted-foreground text-center block pt-2">
          عد للرئيسية
        </Link>
      </div>

      {product.category_id && (
        <div className="mx-auto max-w-md px-4 pt-2 pb-4">
          <h2 className="text-sm font-extrabold mb-3 flex items-center gap-2">
            <span className="inline-block w-1 h-4 bg-gold rounded" />
            منتجات مشابهة
          </h2>
          <Suspense fallback={<RelatedProductsSkeleton />}>
            <RelatedProducts categoryId={product.category_id} excludeId={product.id} />
          </Suspense>
        </div>
      )}

      <div className="fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md flex items-center gap-2">
          <div className="flex-shrink-0">
            {available ? (
              <span className="inline-flex items-center gap-1 text-success text-xs font-bold bg-success/10 border border-success/30 px-2 py-1 rounded-full">
                <CheckCircle2 className="size-3.5" /> {stockQty} قطعة
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-destructive text-xs font-bold bg-destructive/10 border border-destructive/30 px-2 py-1 rounded-full">
                <XCircle className="size-3.5" /> غير متوفر
              </span>
            )}
          </div>
          <button
            onClick={addToCart}
            disabled={!available}
            className="flex-1 h-12 rounded-2xl border-2 border-navy text-navy font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition hover:bg-navy hover:text-primary-foreground"
          >
            <ShoppingCart className="size-4" /> أضف للسلة
          </button>
          <button
            onClick={buyNow}
            disabled={!available}
            className="flex-1 h-12 rounded-2xl bg-gradient-gold text-navy font-black shadow-gold disabled:opacity-40 hover:brightness-105 transition"
          >
            اشترِ الآن
          </button>
        </div>
      </div>

      {shareOpen && (
        <div
          className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm grid place-items-end sm:place-items-center"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="w-full sm:max-w-sm bg-card rounded-t-3xl sm:rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-luxe animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold">مشاركة المنتج</h3>
              <button onClick={() => setShareOpen(false)} className="size-8 rounded-full bg-muted grid place-items-center">
                <CloseIcon className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <a
                href={waShareHref}
                target="_blank"
                rel="noreferrer"
                onClick={() => setShareOpen(false)}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-muted hover:bg-whatsapp/10 transition"
              >
                <span className="size-12 rounded-full bg-whatsapp text-white grid place-items-center">
                  <WhatsappIcon className="size-6" />
                </span>
                <span className="text-xs font-bold">واتساب</span>
              </a>
              <a
                href={fbShareHref}
                target="_blank"
                rel="noreferrer"
                onClick={() => setShareOpen(false)}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-muted hover:bg-[#1877F2]/10 transition"
              >
                <span className="size-12 rounded-full bg-[#1877F2] text-white grid place-items-center">
                  <Facebook className="size-6" />
                </span>
                <span className="text-xs font-bold">فيسبوك</span>
              </a>
              <button
                onClick={() => { copyLink(); setShareOpen(false); }}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-muted hover:bg-navy/10 transition"
              >
                <span className="size-12 rounded-full bg-navy text-primary-foreground grid place-items-center">
                  <Share2 className="size-5" />
                </span>
                <span className="text-xs font-bold">نسخ الرابط</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={replaceOpen} onOpenChange={(o) => { if (!submitting) setReplaceOpen(o); }}>
        <AlertDialogContent className="rounded-3xl max-w-md p-0 overflow-hidden">
          <div className="p-5 pb-2">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-navy">
                {submittedId ? "تم إرسال طلب الاستبدال" : "طلب استبدال سريع"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {submittedId
                  ? "سيتواصل معك قسم متابعة الاستبدال خلال 72 ساعة."
                  : product.name_ar}
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>

          {!submittedId ? (
            <div className="px-5 pb-4 space-y-4">
              <div>
                <div className="text-xs font-bold text-navy mb-2">1) سبب الاستبدال</div>
                <div className="space-y-1.5">
                  {[...REASON_PRESETS, "أخرى"].map((r) => (
                    <label
                      key={r}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-xs font-bold ${reasonChoice === r ? "bg-navy/5 border-navy" : "border-border hover:bg-muted"}`}
                    >
                      <input
                        type="radio"
                        name="reason"
                        value={r}
                        checked={reasonChoice === r}
                        onChange={() => setReasonChoice(r)}
                        className="accent-navy"
                      />
                      <span>{r}</span>
                    </label>
                  ))}
                </div>
                <textarea
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value.slice(0, 500))}
                  placeholder={reasonChoice === "أخرى" ? "اكتب السبب بالتفصيل..." : "تفاصيل إضافية (اختياري)"}
                  className="mt-2 w-full min-h-[64px] rounded-xl border border-border bg-background p-2 text-xs"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-navy">2) مرفقات (اختياري)</div>
                  <span className="text-[10px] text-muted-foreground">
                    {pickedFiles.length}/{MAX_FILES} · حتى {MAX_FILE_MB}MB
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                  className="hidden"
                  onChange={(e) => onPickFiles(e.target.files)}
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pickedFiles.length >= MAX_FILES || submitting}
                  className="w-full h-10 rounded-xl border border-dashed border-gold/60 text-navy text-xs font-bold flex items-center justify-center gap-2 hover:bg-gold/5 disabled:opacity-50"
                >
                  <Paperclip className="size-4 text-gold" />
                  إضافة صور أو مستندات
                </button>
                {pickedFiles.length > 0 && uploadProgress.length === 0 && (
                  <ul className="mt-2 space-y-1">
                    {pickedFiles.map((f, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-[11px] bg-muted rounded-lg px-2 py-1.5">
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="text-muted-foreground">{(f.size / 1024 / 1024).toFixed(2)}MB</span>
                        <button
                          type="button"
                          onClick={() => setPickedFiles((prev) => prev.filter((_, i) => i !== idx))}
                          disabled={submitting}
                          className="size-6 rounded-md grid place-items-center hover:bg-background"
                        >
                          <Trash2 className="size-3.5 text-rose-600" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {uploadProgress.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {uploadProgress.map((it, idx) => (
                      <div key={idx} className="rounded-lg border border-border bg-muted/40 p-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Paperclip className="size-3 text-gold shrink-0" />
                          <span className="flex-1 truncate text-[10px] font-bold text-navy">{it.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {it.status === "error"
                              ? "فشل"
                              : it.status === "done"
                              ? "تم ✓"
                              : it.status === "pending"
                              ? "…"
                              : `${it.progress}%`}
                          </span>
                        </div>
                        <Progress
                          value={it.status === "error" ? 0 : it.progress}
                          className="h-1.5"
                        />
                      </div>
                    ))}
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {uploadProgress
                        .filter((it) => it.status === "uploading" || it.status === "pending")
                        .map((_, idx) => (
                          <Skeleton key={idx} className="aspect-square rounded-lg" />
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="px-5 pb-2 text-xs text-muted-foreground">
              يمكنك متابعة حالة الطلب من صفحة الاستبدال.
            </div>
          )}

          <AlertDialogFooter className="p-4 pt-2 gap-2">
            {submittedId ? (
              <>
                <AlertDialogCancel className="rounded-xl">إغلاق</AlertDialogCancel>
                <Link
                  to="/replacements/$id"
                  params={{ id: submittedId }}
                  className="inline-flex items-center justify-center h-10 px-4 rounded-xl bg-navy text-primary-foreground text-xs font-bold hover:bg-navy/90"
                >
                  عرض تفاصيل الطلب
                </Link>
              </>
            ) : (
              <>
                <AlertDialogCancel disabled={submitting} className="rounded-xl">إلغاء</AlertDialogCancel>
                <button
                  type="button"
                  onClick={submitQuickReplace}
                  disabled={submitting}
                  className="inline-flex items-center justify-center h-10 px-4 rounded-xl bg-navy text-primary-foreground text-xs font-bold hover:bg-navy/90 disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : "إرسال الطلب"}
                </button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sub-sections with independent Suspense/skeleton loading ────────────

function CompatibleModelsSkeleton({ count }: { count: number }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
      <div className="text-xs font-bold text-gold mb-2">السيارات المتوافقة</div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: Math.min(count, 6) }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-20 rounded-full" />
        ))}
      </div>
    </div>
  );
}

function CompatibleModels({ modelIds }: { modelIds: string[] }) {
  const { data: models } = useSuspenseQuery(carModelsQuery());
  const { data: brands } = useSuspenseQuery(brandsQuery());
  return (
    <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
      <div className="text-xs font-bold text-gold mb-2">السيارات المتوافقة</div>
      <div className="flex flex-wrap gap-2">
        {modelIds.map((mid) => {
          const model = models.find((x) => x.id === mid);
          const brand = model ? brands.find((b) => b.id === model.brand_id) : null;
          const label = model
            ? `${brand ? (brand.name_ar || brand.name_en) + " " : ""}${model.name_ar || model.name_en}`
            : mid;
          return (
            <span key={mid} className="text-xs px-2.5 py-1 rounded-full bg-navy text-primary-foreground">{label}</span>
          );
        })}
      </div>
    </div>
  );
}

function RelatedProductsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border overflow-hidden bg-card">
          <Skeleton className="w-full aspect-square" />
          <div className="p-3 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RelatedProducts({ categoryId, excludeId }: { categoryId: string; excludeId: string }) {
  const { data: products } = useSuspenseQuery(productsByCategoryQuery(categoryId));
  const related = (products as Product[]).filter((p) => p.id !== excludeId).slice(0, 4);
  const adjust = useAdjustedPrice();
  if (related.length === 0) {
    return <div className="text-xs text-muted-foreground text-center py-4">لا توجد منتجات مشابهة</div>;
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {related.map((p) => (
        <Link
          key={p.id}
          to="/product/$id"
          params={{ id: p.id }}
          className="rounded-2xl border border-border overflow-hidden bg-card hover:shadow-luxe transition"
        >
          <div className="aspect-square bg-muted overflow-hidden">
            {p.images?.[0] ? (
              <img
                src={p.images[0]}
                alt={p.name_ar}
                loading="lazy"
                decoding="async"
                width={200}
                height={200}
                sizes="50vw"
                className="size-full object-cover"
              />
            ) : (
              <div className="size-full grid place-items-center text-3xl opacity-30">⚙️</div>
            )}
          </div>
          <div className="p-2.5">
            <div className="text-xs font-semibold line-clamp-2 leading-tight min-h-[2.2rem]">{p.name_ar}</div>
            <div className="text-sm font-extrabold text-navy mt-1">{formatIQD(adjust(p.price_iqd))}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}