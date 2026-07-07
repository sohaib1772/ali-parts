import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState, useDeferredValue, useEffect } from "react";
import { Search as SearchIcon, Hash, Camera, Loader2, ImageIcon, Sparkles, CheckCircle2 } from "lucide-react";
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
  // Debounce the query so we don't fire a request on every keystroke.
  const [debouncedQ, setDebouncedQ] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const deferredQ = useDeferredValue(debouncedQ);
  const [analyzing, setAnalyzing] = useState(false);
  const [stage, setStage] = useState<"idle" | "compress" | "upload" | "analyze" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMatchIds, setImageMatchIds] = useState<string[]>([]);
  const [exactIds, setExactIds] = useState<string[]>([]);
  const [similarIds, setSimilarIds] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const reqIdRef = useRef(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { data: textResults, isFetching: textFetching } = useQuery(searchProductsQuery(deferredQ));
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
    // Cancel/ignore any prior in-flight analysis.
    const myId = ++reqIdRef.current;
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);

    try {
      setAnalyzing(true);
      setStage("compress");
      setProgress(5);
      const dataUrl = await compress(file);
      if (reqIdRef.current !== myId) return; // stale
      setImagePreview(dataUrl);
      setStage("upload");
      setProgress(25);
      // Smoothly creep progress while the server thinks.
      progressTimerRef.current = setInterval(() => {
        setProgress((p) => (p < 90 ? p + 2 : p));
      }, 300);
      setStage("analyze");
      const result = await analyzeProductImage({ data: { imageDataUrl: dataUrl } });
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (reqIdRef.current !== myId) return; // stale — a newer image was picked
      setProgress(100);
      setStage("done");
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
      if (reqIdRef.current !== myId) return; // stale error
      toast.error(e instanceof Error ? e.message : "تعذر تحليل الصورة");
    } finally {
      if (reqIdRef.current === myId) {
        setAnalyzing(false);
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
        setTimeout(() => {
          if (reqIdRef.current === myId) { setStage("idle"); setProgress(0); }
        }, 400);
      }
    }
  };

  const stageLabel =
    stage === "compress" ? "جاري تحضير الصورة…" :
    stage === "upload" ? "جاري رفع الصورة…" :
    stage === "analyze" ? "الذكاء الاصطناعي يحلل القطعة…" :
    stage === "done" ? "اكتمل التحليل" :
    "";

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
            aria-label="بحث بالصورة"
            className="size-12 shrink-0 rounded-2xl bg-gradient-gold text-navy grid place-items-center shadow-gold"
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
          <div className="mt-3 bg-card border border-border rounded-2xl p-2">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <img src={imagePreview} alt="preview" className={`size-14 rounded-xl object-cover ${analyzing ? "opacity-70" : ""}`} />
                {analyzing && (
                  <div className="absolute inset-0 rounded-xl bg-black/20 grid place-items-center">
                    <Loader2 className="size-5 text-white animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold flex items-center gap-1.5">
                  {analyzing ? (
                    <>
                      {stage === "compress" && <ImageIcon className="size-3.5 text-gold" />}
                      {stage === "upload" && <Loader2 className="size-3.5 text-gold animate-spin" />}
                      {stage === "analyze" && <Sparkles className="size-3.5 text-gold" />}
                      <span>{stageLabel}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                      <span>تم البحث بالصورة</span>
                    </>
                  )}
                </div>
                {analyzing && (
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-gradient-gold transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  // Cancel any in-flight request and clear UI.
                  reqIdRef.current += 1;
                  if (progressTimerRef.current) clearInterval(progressTimerRef.current);
                  setAnalyzing(false);
                  setStage("idle");
                  setProgress(0);
                  setImagePreview(null);
                  setImageMatchIds([]);
                  setExactIds([]);
                  setSimilarIds([]);
                }}
                className="text-xs text-muted-foreground hover:text-destructive px-2 shrink-0"
              >
                {analyzing ? "إلغاء" : "إزالة"}
              </button>
            </div>
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