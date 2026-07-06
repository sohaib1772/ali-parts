import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { PageShell } from "@/components/page-shell";
import { Repeat, ChevronLeft, Clock, Search, ThumbsUp, ThumbsDown, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/replacements")({
  component: ReplacementsList,
});

const STATUS_META = {
  pending: { label: "بانتظار المراجعة", icon: Clock, chip: "bg-amber-100 text-amber-800 border-amber-300" },
  in_review: { label: "قيد المراجعة", icon: Search, chip: "bg-blue-100 text-blue-800 border-blue-300" },
  approved: { label: "مقبول", icon: ThumbsUp, chip: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  rejected: { label: "مرفوض", icon: ThumbsDown, chip: "bg-rose-100 text-rose-800 border-rose-300" },
  resolved: { label: "منجز", icon: CheckCircle2, chip: "bg-navy text-primary-foreground border-navy" },
} as const;
type StatusKey = keyof typeof STATUS_META;

function ReplacementsList() {
  const { userId } = useAuth();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["my-replacements", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("replacement_requests" as any)
        .select("id, product_name_ar, status, created_at, reason")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  return (
    <PageShell title="طلبات الاستبدال">
      <div className="px-4 pt-4 space-y-3">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">جاري التحميل...</div>
        ) : rows.length === 0 ? (
          <div className="py-20 text-center">
            <div className="size-20 rounded-full bg-muted grid place-items-center mx-auto mb-4">
              <Repeat className="size-10 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-bold mb-2">لا توجد طلبات استبدال</h2>
            <p className="text-sm text-muted-foreground">
              يمكنك طلب استبدال من صفحة تفاصيل الطلب بعد التسليم
            </p>
          </div>
        ) : (
          rows.map((r) => {
            const meta = STATUS_META[r.status as StatusKey];
            const Icon = meta?.icon ?? Repeat;
            return (
              <Link
                key={r.id}
                to="/replacements/$id"
                params={{ id: r.id }}
                className="block bg-card rounded-2xl border border-border p-4 shadow-card hover:shadow-luxe transition"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-mono text-muted-foreground">#{String(r.id).slice(0, 8)}</span>
                  <span className={`ms-auto text-[10px] font-bold px-2 py-1 rounded-full border inline-flex items-center gap-1 ${meta?.chip ?? ""}`}>
                    <Icon className="size-3" />
                    {meta?.label ?? r.status}
                  </span>
                </div>
                <div className="text-sm font-bold text-navy line-clamp-1">
                  {r.product_name_ar ?? "منتج غير معروف"}
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{r.reason}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("ar-IQ", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  <ChevronLeft className="size-4 text-muted-foreground" />
                </div>
              </Link>
            );
          })
        )}
      </div>
    </PageShell>
  );
}