import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Search as SearchIcon, Hash, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { PageShell } from "@/components/page-shell";
import { ProductCard } from "@/components/product-card";
import { searchProductsQuery, productsByIdsQuery } from "@/lib/queries";
import { useSavedVehicle, filterProductsByVehicle } from "@/components/vehicle-picker";
import { analyzeProductImage } from "@/lib/image-search.functions";

const searchSchema = z.object({
  q: z.string().optional(),
  mode: z.enum(["oem"]).optional(),
});

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "البحث — Ali Parts" }] }),
  component: SearchPage,
});

function SearchPage() {
  const { q: initialQ, mode } = Route.useSearch();
  const [q, setQ] = useState(initialQ ?? "");
  const [analyzing, setAnalyzing] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMatchIds, setImageMatchIds] = useState<string[]>([]);
  const [exactIds, setExactIds] = useState<string[]>([]);
  const [similarIds, setSimilarIds] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: textResults, isFetching: textFetching } = useQuery(searchProductsQuery(q));
  const { data: imageResults, isFetching: imageFetching } = useQuery(productsByIdsQuery(imageMatchIds));
  const usingImage = imageMatchIds.length > 0;
  const results = usingImage ? imageResults : textResults;
  const isFetching = usingImage ? imageFetching : textFetching;
  const vehicle = useSavedVehicle();
  const filtered = filterProductsByVehicle(results ?? [], vehicle);

  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("read fail"));
      r.readAsDataURL(file);
    });

  const compress = async (file: File): Promise<string> => {
    const dataUrl = await readAsDataUrl(file);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const max = 512;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.6);
  };

  const handleImage = async (file: File) => {
    try {
      setAnalyzing(true);
      const dataUrl = await compress(file);
      setImagePreview(dataUrl);
      const result = await analyzeProductImage({ data: { imageDataUrl: dataUrl } });
      if (!result.productIds.length) {
        setImageMatchIds([]);
        setExactIds([]);
        setSimilarIds([]);
        toast.error("لم نجد منتجاً مطابقاً في المتجر");
        return;
      }
      setQ("");
      setImageMatchIds(result.productIds);
      setExactIds(result.exactIds ?? []);
      setSimilarIds(result.similarIds ?? []);
      toast.success(`تم العثور على ${result.productIds.length} منتج${result.name_ar ? ` — ${result.name_ar}` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحليل الصورة");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <PageShell title="بحث">
      <div className="px-4 pt-4">
        <div className="flex items-center gap-2">
          <label className="flex-1 flex items-center gap-2 bg-card border border-border rounded-2xl px-4 py-3 shadow-card focus-within:border-gold">
          {mode === "oem" ? <Hash className="size-5 text-gold" /> : <SearchIcon className="size-5 text-muted-foreground" />}
          <input
            autoFocus
            placeholder={mode === "oem" ? "أدخل رقم OEM…" : "ابحث عن قطعة، ماركة، رقم OEM…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
          />
          </label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={analyzing}
            aria-label="بحث بالصورة"
            className="size-12 shrink-0 rounded-2xl bg-gradient-gold text-navy grid place-items-center shadow-gold disabled:opacity-60"
          >
            {analyzing ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImage(f);
              e.target.value = "";
            }}
          />
        </div>
        {imagePreview && (
          <div className="mt-3 flex items-center gap-3 bg-card border border-border rounded-2xl p-2">
            <img src={imagePreview} alt="preview" className="size-14 rounded-xl object-cover" />
            <div className="text-xs text-muted-foreground flex-1">
              {analyzing ? "جاري تحليل الصورة…" : "تم البحث بالصورة"}
            </div>
            <button
              onClick={() => { setImagePreview(null); setImageMatchIds([]); setExactIds([]); setSimilarIds([]); }}
              className="text-xs text-muted-foreground hover:text-destructive px-2"
            >
              إزالة
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 px-4">
        {(() => {
          const SkeletonGrid = ({ n }: { n: number }) => (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: n }).map((_, i) => (
                <div key={i} className="skeleton rounded-2xl aspect-[3/4]" />
              ))}
            </div>
          );
          // Image search: analyzing (before IDs) or fetching products for the returned IDs
          if (analyzing || (usingImage && isFetching)) {
            return (
              <div className="space-y-6">
                <section>
                  <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <span className="inline-block w-1 h-4 bg-gold rounded" />
                    نتائج مطابقة
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  </h2>
                  <SkeletonGrid n={2} />
                </section>
                <section>
                  <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <span className="inline-block w-1 h-4 bg-muted-foreground/60 rounded" />
                    منتجات مشابهة
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  </h2>
                  <SkeletonGrid n={4} />
                </section>
              </div>
            );
          }
          if (!q.trim() && !usingImage) {
            return (
              <div className="text-center text-muted-foreground text-sm py-16">
                ابدأ بكتابة اسم القطعة أو رقمها للبحث
              </div>
            );
          }
          if (isFetching) {
            return <SkeletonGrid n={4} />;
          }
          if (filtered.length > 0) {
            if (usingImage) {
              return (
            (() => {
              const exact = filtered.filter((p) => exactIds.includes(p.id));
              const similar = filtered.filter((p) => similarIds.includes(p.id) && !exactIds.includes(p.id));
              return (
                <div className="space-y-6">
                  {exact.length > 0 && (
                    <section>
                      <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                        <span className="inline-block w-1 h-4 bg-gold rounded" />
                        نتائج مطابقة ({exact.length})
                      </h2>
                      <div className="grid grid-cols-2 gap-3">
                        {exact.map((p) => <ProductCard key={p.id} product={p} />)}
                      </div>
                    </section>
                  )}
                  {similar.length > 0 && (
                    <section>
                      <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                        <span className="inline-block w-1 h-4 bg-muted-foreground/60 rounded" />
                        منتجات مشابهة ({similar.length})
                      </h2>
                      <div className="grid grid-cols-2 gap-3">
                        {similar.map((p) => <ProductCard key={p.id} product={p} />)}
                      </div>
                    </section>
                  )}
                </div>
              );
            })()
              );
            }
            return (
              <>
                <div className="text-xs text-muted-foreground mb-3">
                  {vehicle ? `${filtered.length} نتيجة متوافقة مع ${vehicle.brandName} ${vehicle.modelName}` : `${filtered.length} نتيجة`}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
              </>
            );
          }
          return (
            <div className="text-center text-muted-foreground text-sm py-16">
              لا توجد نتائج مطابقة. {vehicle && `جرّب تغيير المركبة أو تواصل معنا عبر واتساب.`}
            </div>
          );
        })()}
      </div>
    </PageShell>
  );
}