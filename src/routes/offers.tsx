import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Sparkles, Volume2, VolumeX, ChevronLeft, X, Heart, MessageCircle,
  Send, Trash2, Pencil, Shield, Ban, Check,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { bannersQuery, type Banner } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useIsAdmin } from "@/lib/admin";
import { adminSetUserBlocked } from "@/lib/admin.functions";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/offers")({
  head: () => ({
    meta: [
      { title: "العروض الحصرية — Ali Parts" },
      { name: "description", content: "شاهد ريلز العروض الحصرية، اضغط قلب، وشاركنا تعليقك." },
      { property: "og:title", content: "العروض الحصرية — Ali Parts" },
      { property: "og:description", content: "شاهد ريلز العروض الحصرية، اضغط قلب، وشاركنا تعليقك." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(bannersQuery());
  },
  component: OffersPage,
});

type CommentRow = {
  id: string;
  banner_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  is_admin_reply: boolean;
  created_at: string;
  updated_at: string;
  profile?: { full_name: string | null; avatar_url: string | null; is_blocked: boolean | null } | null;
};

function OffersPage() {
  const { data: banners } = useSuspenseQuery(bannersQuery());
  const [openCommentsFor, setOpenCommentsFor] = useState<string | null>(null);

  return (
    <PageShell showHeader={false} showNav={false}>
      <div className="fixed inset-0 bg-black overflow-hidden">
        <Link
          to="/"
          className="absolute top-4 start-4 z-30 size-10 rounded-full bg-black/40 backdrop-blur text-white grid place-items-center border border-white/20"
          aria-label="رجوع"
        >
          <ChevronLeft className="size-5 rtl:rotate-180" />
        </Link>
        <div className="absolute top-4 inset-x-0 z-20 flex justify-center pointer-events-none">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-black/40 border border-white/20 rounded-full px-3 py-1 backdrop-blur">
            <Sparkles className="size-3" /> ريلز العروض
          </div>
        </div>

        {banners.length === 0 ? (
          <div className="h-full grid place-items-center text-white/70 text-sm">لا توجد عروض حالياً.</div>
        ) : (
          <div className="h-full overflow-y-auto snap-y snap-mandatory scroll-smooth" style={{ scrollbarWidth: "none" }}>
            {banners.map((b) => (
              <ReelItem key={b.id} banner={b} onOpenComments={() => setOpenCommentsFor(b.id)} />
            ))}
          </div>
        )}
      </div>

      <CommentsSheet
        bannerId={openCommentsFor}
        onClose={() => setOpenCommentsFor(null)}
      />
    </PageShell>
  );
}

/* ---------- Reel item ---------- */

function ReelItem({ banner, onOpenComments }: { banner: Banner; onOpenComments: () => void }) {
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    // Default: sound ON when opening a clip. Only stay muted if the user
    // explicitly chose mute earlier in this session.
    return window.sessionStorage.getItem("reels_muted") === "1";
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const video = (banner as unknown as { video_url?: string | null }).video_url ?? null;
  const { userId } = useAuth();

  // sync with global mute pref (when another reel toggles)
  useEffect(() => {
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<boolean>).detail;
      setMuted(next);
      const el = videoRef.current;
      if (el) el.muted = next;
    };
    window.addEventListener("reels-muted-change", onChange as EventListener);
    return () => window.removeEventListener("reels-muted-change", onChange as EventListener);
  }, []);

  // pause/play when in view
  useEffect(() => {
    const el = videoRef.current;
    const box = containerRef.current;
    if (!el || !box) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            // Try to play with sound. If the browser blocks unmuted
            // autoplay, fall back to muted so the video still plays.
            el.muted = muted;
            const p = el.play();
            if (p && typeof p.catch === "function") {
              p.catch(() => {
                el.muted = true;
                setMuted(true);
                el.play().catch(() => {});
              });
            }
          } else {
            el.pause();
          }
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(box);
    return () => io.disconnect();
  }, [video, muted]);

  const likes = useLikes(banner.id, userId);
  const commentsCount = useCommentsCount(banner.id);

  const lastTapRef = useRef<number>(0);
  const [burst, setBurst] = useState(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleMediaTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 400) {
      lastTapRef.current = 0;
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      if (!likes.liked && !likes.pending) likes.toggle();
      setBurst((b) => b + 1);
      return;
    }
    lastTapRef.current = now;
    // delay play/pause to allow a possible second tap
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      const el = videoRef.current;
      if (el) {
        if (el.paused) el.play().catch(() => {});
        else el.pause();
      }
      singleTapTimerRef.current = null;
    }, 260);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[100dvh] snap-start snap-always bg-black"
    >
      {video ? (
        <video
          ref={videoRef}
          src={video}
          poster={banner.image_url || undefined}
          autoPlay
          muted={muted}
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-contain"
          onClick={handleMediaTap}
          onVolumeChange={(e) => {
            const el = e.currentTarget;
            setMuted(el.muted);
          }}
        />
      ) : (
        <img
          src={banner.image_url}
          alt={banner.title_ar ?? ""}
          className="absolute inset-0 w-full h-full object-contain"
          onClick={handleMediaTap}
        />
      )}

      {/* double-tap heart burst */}
      {burst > 0 && (
        <Heart
          key={burst}
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-32 text-red-500 fill-current drop-shadow-2xl animate-[likePop_700ms_ease-out_forwards] z-30"
        />
      )}

      {/* gradient */}
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none" />

      {/* mute */}
      {video && (
        <button
          type="button"
          onClick={() => {
            const el = videoRef.current;
            const next = !muted;
            if (el) {
              el.muted = next;
              if (!next) {
                el.volume = 1;
                el.play().catch(() => {});
              }
            }
            setMuted(next);
            try {
              window.sessionStorage.setItem("reels_muted", next ? "1" : "0");
            } catch { /* noop */ }
            window.dispatchEvent(new CustomEvent("reels-muted-change", { detail: next }));
          }}
          aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}
          className="absolute top-4 end-4 z-20 size-10 rounded-full bg-black/40 backdrop-blur text-white grid place-items-center border border-white/20"
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
      )}

      {/* action rail */}
      <div className="absolute end-3 bottom-32 z-20 flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={() => likes.toggle()}
          disabled={likes.pending}
          className="flex flex-col items-center gap-1"
          aria-label={likes.liked ? "إلغاء الإعجاب" : "إعجاب"}
        >
          <span className={`size-11 rounded-full grid place-items-center border transition ${likes.liked ? "bg-red-500/90 border-red-400 text-white" : "bg-black/40 border-white/20 text-white backdrop-blur"}`}>
            <Heart className={`size-5 ${likes.liked ? "fill-current" : ""}`} />
          </span>
          <span className="text-white text-[11px] font-bold drop-shadow">{likes.count}</span>
        </button>
        <button
          type="button"
          onClick={onOpenComments}
          className="flex flex-col items-center gap-1"
          aria-label="التعليقات"
        >
          <span className="size-11 rounded-full grid place-items-center bg-black/40 border border-white/20 text-white backdrop-blur">
            <MessageCircle className="size-5" />
          </span>
          <span className="text-white text-[11px] font-bold drop-shadow">{commentsCount}</span>
        </button>
      </div>

      {/* caption */}
      <div className="absolute inset-x-0 bottom-0 p-4 pb-6 text-white z-10">
        {banner.title_ar && <h2 className="text-xl font-black leading-tight drop-shadow">{banner.title_ar}</h2>}
        {banner.subtitle_ar && <p className="text-sm text-white/90 mt-1 drop-shadow">{banner.subtitle_ar}</p>}
        {banner.link && (
          <a
            href={banner.link}
            className="inline-flex items-center gap-1 mt-3 bg-gold text-navy font-bold text-sm rounded-full px-4 py-1.5"
          >
            تسوّق الآن
          </a>
        )}
      </div>
    </div>
  );
}

/* ---------- hooks ---------- */

function useLikes(bannerId: string, userId: string | null) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["banner_likes", bannerId, userId],
    queryFn: async () => {
      const { count } = await supabase
        .from("banner_likes")
        .select("banner_id", { count: "exact", head: true })
        .eq("banner_id", bannerId);
      let liked = false;
      if (userId) {
        const { data } = await supabase
          .from("banner_likes")
          .select("banner_id")
          .eq("banner_id", bannerId)
          .eq("user_id", userId)
          .maybeSingle();
        liked = !!data;
      }
      return { count: count ?? 0, liked };
    },
  });
  const m = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("auth");
      if (data?.liked) {
        const { error } = await supabase.from("banner_likes").delete().eq("banner_id", bannerId).eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("banner_likes").insert({ banner_id: bannerId, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["banner_likes", bannerId] }),
    onError: (e: Error) => {
      if (e.message === "auth") toast.error("سجّل الدخول أولاً");
      else toast.error("تعذر تنفيذ الإجراء");
    },
  });
  return { liked: !!data?.liked, count: data?.count ?? 0, toggle: () => m.mutate(), pending: m.isPending || isLoading };
}

function useCommentsCount(bannerId: string) {
  const { data } = useQuery({
    queryKey: ["banner_comments_count", bannerId],
    queryFn: async () => {
      const { count } = await supabase
        .from("banner_comments")
        .select("id", { count: "exact", head: true })
        .eq("banner_id", bannerId);
      return count ?? 0;
    },
  });
  return data ?? 0;
}

/* ---------- Comments sheet ---------- */

function CommentsSheet({ bannerId, onClose }: { bannerId: string | null; onClose: () => void }) {
  const open = !!bannerId;
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="h-[85dvh] p-0 rounded-t-3xl flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2 border-b">
          <SheetTitle className="text-base">التعليقات</SheetTitle>
        </SheetHeader>
        {bannerId && <CommentsBody bannerId={bannerId} />}
      </SheetContent>
    </Sheet>
  );
}

function CommentsBody({ bannerId }: { bannerId: string }) {
  const { userId } = useAuth();
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [asAdmin, setAsAdmin] = useState(false);
  const PAGE_SIZE = 10;
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["banner_comments", bannerId, limit],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("banner_comments")
        .select("*", { count: "exact" })
        .eq("banner_id", bannerId)
        .order("created_at", { ascending: false })
        .range(0, limit - 1);
      if (error) throw error;
      const rows = (data ?? []) as CommentRow[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      if (ids.length) {
        // Safe public identity lookup (name + avatar only). is_blocked
        // is loaded separately for the admin block/unblock button.
        const { data: profs } = await (supabase as any).rpc("get_public_profiles", { _ids: ids });
        const map = new Map<string, any>(((profs ?? []) as any[]).map((p) => [p.id, p]));
        for (const r of rows) r.profile = map.get(r.user_id) ?? null;
      }
      return { rows, total: count ?? rows.length };
    },
    placeholderData: (prev) => prev,
  });
  const comments = data?.rows ?? [];
  const total = data?.total ?? 0;
  const hasMore = comments.length < total;
  const loadingMore = isFetching && !isLoading;

  const addOrEdit = useMutation({
    mutationFn: async () => {
      const body = text.trim();
      if (!body) throw new Error("empty");
      if (!userId) throw new Error("auth");
      const { containsProfanity } = await import("@/lib/profanity");
      if (containsProfanity(body)) throw new Error("profanity");
      if (editingId) {
        const { error } = await supabase
          .from("banner_comments")
          .update({ content: body })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).rpc("add_banner_comment", {
          p_banner_id: bannerId,
          p_content: body,
          p_is_admin_reply: isAdmin && asAdmin,
        });
        if (error) throw error;
      }
    },
    onMutate: async () => {
      const body = text.trim();
      if (!body || !userId) return;
      const key = ["banner_comments", bannerId, limit];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ rows: CommentRow[]; total: number }>(key);
      if (editingId) {
        qc.setQueryData<{ rows: CommentRow[]; total: number }>(key, (d) =>
          d ? { ...d, rows: d.rows.map((r) => (r.id === editingId ? { ...r, content: body } : r)) } : d,
        );
      } else {
        const prevProfile = (previous?.rows ?? []).find((r) => r.user_id === userId)?.profile ?? null;
        const optimistic: CommentRow = {
          id: `optimistic-${Date.now()}`,
          banner_id: bannerId,
          user_id: userId,
          parent_id: null,
          content: body,
          is_admin_reply: isAdmin && asAdmin,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          profile: prevProfile,
        };
        qc.setQueryData<{ rows: CommentRow[]; total: number }>(key, (d) =>
          d
            ? { rows: [optimistic, ...d.rows], total: d.total + 1 }
            : { rows: [optimistic], total: 1 },
        );
        qc.setQueryData<number>(["banner_comments_count", bannerId], (n) => (n ?? 0) + 1);
      }
      // Clear the input immediately so the UI feels instant.
      setText("");
      setEditingId(null);
      setAsAdmin(false);
      return { previous };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["banner_comments", bannerId] });
      qc.invalidateQueries({ queryKey: ["banner_comments_count", bannerId] });
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["banner_comments", bannerId, limit], ctx.previous);
      qc.invalidateQueries({ queryKey: ["banner_comments_count", bannerId] });
      if (e.message === "auth") toast.error("سجّل الدخول لكتابة تعليق");
      else if (e.message === "profanity")
        toast.error("تعليقك يحتوي كلمات مسيئة. يرجى الالتزام بالاحترام.");
      else if (e.message !== "empty") toast.error("تعذر الإرسال");
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("banner_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["banner_comments", bannerId] });
      qc.invalidateQueries({ queryKey: ["banner_comments_count", bannerId] });
      toast.success("تم الحذف");
    },
    onError: () => toast.error("تعذر الحذف"),
  });

  const block = useMutation({
    mutationFn: async ({ uid, blocked }: { uid: string; blocked: boolean }) => {
      await adminSetUserBlocked({
        data: {
          user_id: uid,
          blocked,
          reason: blocked
            ? "تم حظرك بسبب تعليق مخالف لقوانين المجتمع. يرجى الالتزام بالكلام المحترم وتجنب الإساءة أو السبام أو المحتوى غير اللائق."
            : "تم رفع الحظر عن حسابك، يمكنك الآن التعليق والتفاعل بشكل طبيعي مع الالتزام بالقوانين.",
        },
      });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["banner_comments", bannerId] });
      qc.invalidateQueries({ queryKey: ["admin", "block-log"] });
      qc.invalidateQueries({ queryKey: ["admin", "blocked-users"] });
      toast.success(vars.blocked ? "تم حظر المستخدم وإرسال الإشعار" : "تم رفع الحظر عن المستخدم");
    },
    onError: (e: Error) => toast.error(e.message || "تعذر الحظر"),
  });

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {isLoading ? (
          <CommentsSkeleton count={5} />
        ) : comments.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-10">لا توجد تعليقات بعد — كن أول من يعلّق!</div>
        ) : (
          <>
            {comments.map((c) => (
            <CommentRowView
              key={c.id}
              c={c}
              currentUserId={userId}
              isAdmin={isAdmin}
              onEdit={() => { setEditingId(c.id); setText(c.content); }}
              onDelete={() => del.mutate(c.id)}
              onBlock={() => {
                const blocked = !!c.profile?.is_blocked;
                const next = !blocked;
                if (block.isPending) return;
                block.mutate({ uid: c.user_id, blocked: next });
              }}
            />
            ))}
            {loadingMore && <CommentsSkeleton count={3} />}
            {hasMore && !loadingMore && (
              <div className="pt-1 pb-3 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLimit((n) => n + PAGE_SIZE)}
                >
                  عرض المزيد ({total - comments.length})
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {userId ? (
        <div className="border-t p-3 space-y-2 bg-background">
          {isAdmin && !editingId && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={asAdmin}
                onChange={(e) => setAsAdmin(e.target.checked)}
                className="size-4"
              />
              <span className="inline-flex items-center gap-1"><Shield className="size-3 text-gold" /> نشر كردّ رسمي من الإدارة</span>
            </label>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={editingId ? "تعديل التعليق…" : "أضف تعليقاً…"}
              className="min-h-[42px] max-h-32 resize-none flex-1"
              maxLength={1000}
            />
            {editingId && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => { setEditingId(null); setText(""); }}
                aria-label="إلغاء"
              >
                <X className="size-4" />
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              onClick={() => addOrEdit.mutate()}
              disabled={addOrEdit.isPending || !text.trim()}
              aria-label="إرسال"
            >
              {editingId ? <Check className="size-4" /> : <Send className="size-4" />}
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t p-4 text-center bg-background">
          <Link to="/auth" className="text-sm font-bold text-gold underline">سجّل الدخول للتعليق</Link>
        </div>
      )}
    </>
  );
}

function CommentRowView({
  c, currentUserId, isAdmin, onEdit, onDelete, onBlock,
  c, currentUserId, isAdmin, onEdit, onDelete, onBlock,
}: {
  c: CommentRow;
  currentUserId: string | null;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onBlock: () => void;
}) {
  const mine = currentUserId === c.user_id;
  const name = c.profile?.full_name || (c.is_admin_reply ? "الإدارة" : "مستخدم");
  const initials = (name || "?").slice(0, 1);
  return (
    <div className="flex gap-2.5">
      <div className="size-9 rounded-full bg-muted grid place-items-center text-sm font-bold overflow-hidden shrink-0">
        {c.profile?.avatar_url ? (
          <img src={c.profile.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-bold">{name}</span>
          {c.is_admin_reply && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gold bg-gold/10 border border-gold/30 rounded-full px-1.5 py-0.5">
              <Shield className="size-2.5" /> الإدارة
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {new Date(c.created_at).toLocaleDateString("ar-IQ")}
          </span>
        </div>
        <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{c.content}</p>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
          {mine && (
            <>
              <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 hover:text-foreground">
                <Pencil className="size-3" /> تعديل
              </button>
              <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 hover:text-destructive">
                <Trash2 className="size-3" /> حذف
              </button>
            </>
          )}
          {!mine && isAdmin && (
            <>
              <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 hover:text-destructive">
                <Trash2 className="size-3" /> حذف
              </button>
              <button type="button" onClick={onBlock} className={`inline-flex items-center gap-1 ${c.profile?.is_blocked ? "hover:text-success" : "hover:text-destructive"}`}>
                {c.profile?.is_blocked ? <Check className="size-3" /> : <Ban className="size-3" />}
                {c.profile?.is_blocked ? "رفع الحظر" : "حظر المستخدم"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
