import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Clock, Search, ThumbsUp, ThumbsDown, CheckCircle2, PackageX, Repeat, FileText, StickyNote, Paperclip, ImageIcon, FileIcon, Upload, X, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/replacements/$id")({
  component: ReplacementDetail,
});

const STATUS_META = {
  pending: { label: "بانتظار المراجعة", icon: Clock, color: "amber" },
  in_review: { label: "قيد المراجعة", icon: Search, color: "blue" },
  approved: { label: "مقبول", icon: ThumbsUp, color: "emerald" },
  rejected: { label: "مرفوض", icon: ThumbsDown, color: "rose" },
  resolved: { label: "منجز", icon: CheckCircle2, color: "navy" },
} as const;

type StatusKey = keyof typeof STATUS_META;

function iconTone(color: string, active: boolean) {
  if (!active) return "bg-muted text-muted-foreground";
  switch (color) {
    case "amber": return "bg-amber-500 text-white shadow-md";
    case "blue": return "bg-blue-500 text-white shadow-md";
    case "emerald": return "bg-emerald-500 text-white shadow-md";
    case "rose": return "bg-rose-500 text-white shadow-md";
    case "navy": return "bg-gradient-gold text-navy shadow-gold";
    default: return "bg-navy text-primary-foreground";
  }
}

function formatDT(iso: string) {
  return new Date(iso).toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" });
}

function ReplacementDetail() {
  const { id } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: request, isLoading, error } = useQuery({
    queryKey: ["replacement", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("replacement_requests" as any)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: log = [] } = useQuery({
    queryKey: ["replacement-log", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("replacement_status_log" as any)
        .select("*")
        .eq("request_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`replacement-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "replacement_requests", filter: `id=eq.${id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["replacement", id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "replacement_status_log", filter: `request_id=eq.${id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["replacement-log", id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, qc]);

  if (isLoading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">جاري التحميل...</div>;
  }

  if (error || !request) {
    return (
      <div className="min-h-screen grid place-items-center px-4 text-center">
        <div>
          <PackageX className="size-12 text-muted-foreground mx-auto mb-3" />
          <div className="text-lg font-bold mb-1">لم يتم العثور على الطلب</div>
          <Link to="/replacements" className="text-gold text-sm font-bold">عودة لطلبات الاستبدال</Link>
        </div>
      </div>
    );
  }

  const currentStatus = request.status as StatusKey;
  const meta = STATUS_META[currentStatus];

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="sticky top-0 z-20 bg-gradient-navy text-primary-foreground shadow-luxe">
        <div className="mx-auto max-w-md px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.history.back()} className="size-9 rounded-full bg-white/10 grid place-items-center">
            <ArrowRight className="size-5" />
          </button>
          <div className="flex-1">
            <div className="text-sm font-bold">تفاصيل طلب الاستبدال</div>
            <div className="text-[10px] text-gold font-mono">#{String(request.id).slice(0, 8)}</div>
          </div>
          <Repeat className="size-5 text-gold" />
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
        {/* Current status banner */}
        <div className="bg-card rounded-2xl border border-border p-4 shadow-card flex items-center gap-3">
          <div className={`size-12 rounded-full grid place-items-center ${iconTone(meta.color, true)}`}>
            <meta.icon className="size-6" />
          </div>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">الحالة الحالية</div>
            <div className="text-base font-black text-navy">{meta.label}</div>
          </div>
        </div>

        {/* Product */}
        <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
          <div className="text-xs font-bold text-gold mb-1">المنتج المطلوب استبداله</div>
          <div className="text-sm font-bold">{request.product_name_ar ?? "منتج غير معروف"}</div>
        </div>

        {/* Reason */}
        <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="size-4 text-gold" />
            <span className="text-xs font-bold text-gold">سبب الاستبدال</span>
          </div>
          <div className="text-sm whitespace-pre-wrap">{request.reason}</div>
        </div>

        {/* Admin notes */}
        {request.admin_notes && (
          <div className="bg-card rounded-2xl border border-gold/30 p-4 shadow-card">
            <div className="flex items-center gap-2 mb-2">
              <StickyNote className="size-4 text-gold" />
              <span className="text-xs font-bold text-gold">رد قسم الاستبدال</span>
            </div>
            <div className="text-sm whitespace-pre-wrap">{request.admin_notes}</div>
          </div>
        )}

        {/* Attachments */}
        <AttachmentsSection request={request} />

        {/* Timeline */}
        <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
          <div className="text-xs font-bold text-gold mb-4">سجل الحالات</div>
          <div className="relative">
            <div className="absolute right-5 top-2 bottom-2 w-px bg-border" aria-hidden />
            <div className="space-y-4">
              {log.map((entry: any, i: number) => {
                const em = STATUS_META[entry.status as StatusKey];
                const isLast = i === log.length - 1;
                const Icon = em?.icon ?? Clock;
                return (
                  <div key={entry.id} className="relative flex items-start gap-3">
                    <div className={`relative z-10 size-10 rounded-full grid place-items-center shrink-0 ${iconTone(em?.color ?? "navy", true)}`}>
                      <Icon className="size-5" />
                    </div>
                    <div className="flex-1 pt-1">
                      <div className={`text-sm font-bold ${isLast ? "text-navy" : "text-foreground"}`}>
                        {em?.label ?? entry.status}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{formatDT(entry.created_at)}</div>
                      {entry.note && (
                        <div className="mt-1.5 text-xs bg-muted/50 rounded-lg p-2 whitespace-pre-wrap">
                          {entry.note}
                        </div>
                      )}
                      {isLast && <div className="text-[10px] text-gold font-bold mt-1">الحالة الحالية</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="text-center text-[11px] text-muted-foreground">
          أُنشئ الطلب في {formatDT(request.created_at)}
        </div>
      </div>
    </div>
  );
}

// Silence unused import warning for toast (kept for future actions)
void toast;