import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { Flame, ChevronLeft } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { ProductCard } from "@/components/product-card";
import { productsInfiniteQuery } from "@/lib/queries";

type ConditionFilter = "all" | "new" | "used";

const FILTER_OPTIONS: { value: ConditionFilter; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "new", label: "جديد" },
  { value: "used", label: "مستعمل" },
];

export const Route = createFileRoute("/products")({
  loader: ({ context }) => {
    void context.queryClient.prefetchInfiniteQuery(productsInfiniteQuery());
  },
  head: () => ({
    meta: [
      { title: "المنتجات | الساير" },
      { name: "description", content: "تصفح جميع قطع الغيار المتوفرة في متجر الساير." },
    ],
  }),
  component: AllProductsPage,
});

function AllProductsPage() {
  const [condition, setCondition] = useState<ConditionFilter>("all");
  const [autoLoadAll, setAutoLoadAll] = useState(false);
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    isError,
    error,
    isFetchNextPageError,
    refetch,
  } =
    useInfiniteQuery(productsInfiniteQuery(condition === "all" ? null : condition));
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const products = data?.pages.flat() ?? [];

  useEffect(() => {
    if (isFetchNextPageError && error) {
      console.error("[products] فشل تحميل الدفعة التالية", error);
      toast.error("تعذّر تحميل المزيد من المنتجات", {
        description: "يرجى التحقق من الاتصال بالإنترنت والمحاولة مرة أخرى.",
        action: { label: "إعادة المحاولة", onClick: () => { setAutoLoadAll(true); fetchNextPage(); } },
      });
    }
  }, [isFetchNextPageError, error, fetchNextPage]);

  useEffect(() => {
    if (!autoLoadAll) return;
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
      fetchNextPage();
    }
  }, [autoLoadAll, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasNextPage &&
          !isFetchingNextPage &&
          !isFetchNextPageError &&
          !autoLoadAll
        ) {
          setAutoLoadAll(true);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, isFetchNextPageError, autoLoadAll]);

  return (
    <PageShell wide title="المنتجات">
      <div className="px-4 pt-3">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground mb-3">
          <ChevronLeft className="size-3.5 rotate-180" /> الرئيسية
        </Link>
        <div className="flex items-center gap-3 mb-4 p-3 rounded-2xl bg-destructive/10 border border-destructive/20">
          <div className="size-10 rounded-xl bg-destructive/20 border border-destructive/30 grid place-items-center">
            <Flame className="size-5 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-extrabold leading-tight">جميع المنتجات</h1>
            <p className="text-[11px] text-muted-foreground">
              {isPending
                ? "جاري التحميل..."
                : `جميع المنتجات المتوفرة (${products.length})`}
            </p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {FILTER_OPTIONS.map((opt) => {
            const active = condition === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => { setCondition(opt.value); setAutoLoadAll(false); }}
                className={`flex-1 h-9 rounded-xl text-xs font-bold border transition ${
                  active
                    ? "bg-navy text-primary-foreground border-navy"
                    : "bg-card text-muted-foreground border-border hover:border-navy/50"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {isPending ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-muted h-64 animate-pulse" />
            ))}
          </div>
        ) : isError && products.length === 0 ? (
          <div className="text-center py-16 px-4">
            <p className="text-sm font-bold text-destructive mb-2">
              تعذّر تحميل المنتجات
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              حدث خطأ أثناء جلب المنتجات. يرجى التحقق من الاتصال والمحاولة مجدداً.
            </p>
            <button
              onClick={() => refetch()}
              className="h-9 px-4 rounded-xl bg-navy text-primary-foreground text-xs font-bold"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-16">
            لا توجد منتجات حالياً في هذا الفلتر.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-8">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            <div
              ref={loadMoreRef}
              className="h-16 flex items-center justify-center text-xs text-muted-foreground"
            >
              {isFetchingNextPage ? (
                autoLoadAll ? "جاري تحميل باقي المنتجات..." : "جاري تحميل المزيد..."
              ) : isFetchNextPageError ? (
                <button
                  onClick={() => { setAutoLoadAll(true); fetchNextPage(); }}
                  className="text-destructive font-bold underline underline-offset-4"
                >
                  فشل التحميل — اضغط لإعادة المحاولة
                </button>
              ) : hasNextPage ? (
                "مرر للأسفل لعرض المزيد"
              ) : (
                "وصلت إلى نهاية المنتجات"
              )}
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
