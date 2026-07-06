import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Clock, Search, ThumbsUp, ThumbsDown, CheckCircle2, PackageX, Repeat, FileText, StickyNote, Paperclip, ImageIcon, FileIcon, Upload, X, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/use-auth";
import { uploadWithProgress } from "@/lib/upload-with-progress";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

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

const MAX_ATTACHMENTS = 6;
const MAX_FILE_MB = 10;
const ACCEPT = "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt";

function fileExt(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}
function isImageExt(ext: string) {
  return ["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(ext);
}
function baseName(p: string) {
  const parts = p.split("/");
  return parts[parts.length - 1] ?? p;
}

function AttachmentsSection({ request }: { request: any }) {
  const qc = useQueryClient();
  const { userId } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploadQueue, setUploadQueue] = useState<
    { name: string; size: number; progress: number; status: "uploading" | "done" | "error" }[]
  >([]);

  const paths: string[] = Array.isArray(request.attachments) ? request.attachments : [];
  const isOwner = userId === request.user_id;
  const canUpload = isOwner && paths.length < MAX_ATTACHMENTS;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (paths.length === 0) {
        setUrls({});
        return;
      }
      const { data, error } = await supabase.storage
        .from("replacement-attachments")
        .createSignedUrls(paths, 60 * 60);
      if (error || cancelled) return;
      const map: Record<string, string> = {};
      data?.forEach((d) => {
        if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      });
      setUrls(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [paths.join("|")]);

  const handlePick = () => inputRef.current?.click();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !userId || uploading) return;
    const slots = MAX_ATTACHMENTS - paths.length;
    const list = Array.from(files).slice(0, slots);
    if (list.length === 0) {
      toast.error(`الحد الأقصى ${MAX_ATTACHMENTS} ملفات`);
      return;
    }
    setUploading(true);
    const initialQueue = list.map((f) => ({
      name: f.name,
      size: f.size,
      progress: 0,
      status: "uploading" as const,
    }));
    setUploadQueue(initialQueue);
    const uploaded: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`${file.name}: يتجاوز ${MAX_FILE_MB} ميغابايت`);
        setUploadQueue((q) => q.map((it, idx) => (idx === i ? { ...it, status: "error" } : it)));
        continue;
      }
      const ext = fileExt(file.name) || "bin";
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
      const key = `${userId}/${request.id}/${Date.now()}-${crypto.randomUUID().slice(0, 6)}-${safeName || "file." + ext}`;
      try {
        await uploadWithProgress("replacement-attachments", key, file, (pct) => {
          setUploadQueue((q) =>
            q.map((it, idx) => (idx === i ? { ...it, progress: Math.round(pct * 100) } : it)),
          );
        });
        setUploadQueue((q) => q.map((it, idx) => (idx === i ? { ...it, progress: 100, status: "done" } : it)));
        uploaded.push(key);
      } catch {
        toast.error(`تعذّر رفع ${file.name}`);
        setUploadQueue((q) => q.map((it, idx) => (idx === i ? { ...it, status: "error" } : it)));
        continue;
      }
    }
    if (uploaded.length > 0) {
      const next = [...paths, ...uploaded];
      const { error } = await supabase
        .from("replacement_requests" as any)
        .update({ attachments: next } as any)
        .eq("id", request.id);
      if (error) {
        toast.error("تعذّر حفظ المرفقات");
      } else {
        toast.success("تم رفع المرفقات");
        qc.invalidateQueries({ queryKey: ["replacement", request.id] });
      }
    }
    setUploading(false);
    // Clear queue after short delay so user sees final state
    setTimeout(() => setUploadQueue([]), 1200);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeAttachment = async (path: string) => {
    if (!isOwner) return;
    setRemoving(path);
    await supabase.storage.from("replacement-attachments").remove([path]);
    const next = paths.filter((p) => p !== path);
    const { error } = await supabase
      .from("replacement_requests" as any)
      .update({ attachments: next } as any)
      .eq("id", request.id);
    setRemoving(null);
    if (error) {
      toast.error("تعذّر حذف المرفق");
      return;
    }
    toast.success("تم حذف المرفق");
    qc.invalidateQueries({ queryKey: ["replacement", request.id] });
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <Paperclip className="size-4 text-gold" />
        <span className="text-xs font-bold text-gold">مرفقات (صور / مستندات)</span>
        <span className="text-[10px] text-muted-foreground ms-auto">
          {paths.length}/{MAX_ATTACHMENTS}
        </span>
      </div>

      {paths.length === 0 && !canUpload && (
        <div className="text-xs text-muted-foreground text-center py-3">لا توجد مرفقات</div>
      )}

      {paths.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {paths.map((p) => {
            const ext = fileExt(p);
            const img = isImageExt(ext);
            const url = urls[p];
            return (
              <div key={p} className="relative group aspect-square rounded-xl border border-border overflow-hidden bg-muted">
                {img && url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="block size-full">
                    <img src={url} alt="" className="size-full object-cover" />
                  </a>
                ) : (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="size-full flex flex-col items-center justify-center gap-1 p-2 text-center hover:bg-muted/70"
                  >
                    <FileIcon className="size-6 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground line-clamp-2 break-all">
                      {baseName(p).slice(baseName(p).indexOf("-", 15) + 1) || baseName(p)}
                    </span>
                    <Download className="size-3 text-gold" />
                  </a>
                )}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => removeAttachment(p)}
                    disabled={removing === p}
                    aria-label="حذف المرفق"
                    className="absolute top-1 start-1 size-6 rounded-full bg-black/60 text-white grid place-items-center hover:bg-destructive disabled:opacity-50"
                  >
                    {removing === p ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canUpload && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={uploading}
          />
          <button
            type="button"
            onClick={handlePick}
            disabled={uploading}
            className="w-full h-11 rounded-xl border-2 border-dashed border-gold/50 text-navy text-sm font-bold flex items-center justify-center gap-2 hover:bg-gold/5 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> جاري الرفع...
              </>
            ) : (
              <>
                <Upload className="size-4 text-gold" />
                <ImageIcon className="size-4 text-gold" />
                إرفاق صور أو مستندات
              </>
            )}
          </button>
          {uploadQueue.length > 0 && (
            <div className="mt-3 space-y-2">
              {uploadQueue.map((it, idx) => (
                <div key={idx} className="rounded-xl border border-border bg-muted/40 p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <FileIcon className="size-3.5 text-gold shrink-0" />
                    <span className="flex-1 truncate text-[11px] font-bold text-navy">{it.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {it.status === "error"
                        ? "فشل"
                        : it.status === "done"
                        ? "تم ✓"
                        : `${it.progress}%`}
                    </span>
                  </div>
                  <Progress
                    value={it.status === "error" ? 0 : it.progress}
                    className={`h-1.5 ${it.status === "error" ? "bg-rose-100" : ""}`}
                  />
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {uploadQueue.filter((it) => it.status === "uploading").map((_, idx) => (
                  <Skeleton key={idx} className="aspect-square rounded-xl" />
                ))}
              </div>
            </div>
          )}
          <div className="text-[10px] text-muted-foreground text-center mt-1.5">
            صور، PDF، Word، Excel — حتى {MAX_FILE_MB} ميغابايت لكل ملف
          </div>
        </>
      )}
    </div>
  );
}