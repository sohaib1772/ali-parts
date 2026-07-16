import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Timer, ChevronLeft } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { ProductCard } from "@/components/product-card";
import { dealsQuery } from "@/lib/queries";

export const Route = createFileRoute("/deals")({
  loader: ({ context }) => context.queryClient.ensureQueryData(dealsQuery()),
  head: () => ({
    meta: [
      { title: "عروض لفترة محدودة | الساير" },
      { name: "description", content: "أسعار خاصة على قطع غيار السيارات لفترة قصيرة." },
    ],
  }),
  component: DealsPage,
});

function DealsPage() {
  const { data: deals } = useSuspenseQuery(dealsQuery());

  return (
    <PageShell wide title="عروض لفترة محدودة">
      <div className="px-4 pt-3">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground mb-3">
          <ChevronLeft className="size-3.5 rotate-180" /> الرئيسية
        </Link>
        <div className="flex items-center gap-3 mb-4 p-3 rounded-2xl bg-gold/10 border border-gold/30">
          <div className="size-10 rounded-xl bg-gold/20 border border-gold/40 grid place-items-center">
            <Timer className="size-5 text-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-extrabold leading-tight">عروض لفترة محدودة</h1>
            <p className="text-[11px] text-muted-foreground">أسعار خاصة لفترة قصيرة — سارع قبل انتهاء العرض</p>
          </div>
        </div>

        {deals.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-16">
            لا توجد عروض حالياً. تابعنا لاحقاً!
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-8">
            {deals.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}