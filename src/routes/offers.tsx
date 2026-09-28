import { createFileRoute, Link, useSearch, useParams } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles, Volume2, VolumeX, ChevronLeft, X, Heart, MessageCircle,
  Send, Trash2, Pencil, Shield, Ban, Check, Search as SearchIcon, Users as UsersIcon, Reply,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { bannersQuery, type Banner } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useIsAdmin, useAdminAccessStatus } from "@/lib/admin";
import { adminSetUserBlocked, moderatorListUsers } from "@/lib/admin.functions";
import { addBannerComment } from "@/lib/comments.functions";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCachedVideo, usePrefetchNearbyVideo, setPrefetchPaused } from "@/lib/use-cached-video";
import { isYouTubeUrl, getYouTubeVideoId, getYouTubeMaxResThumbnail, safeYouTubeThumbnailUrl } from "@/lib/youtube";
import { z } from "zod";

function CommentsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-2.5">
          <Skeleton className="size-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export const offersSearchSchema = z.object({
  id: z.string().optional(),
  bannerId: z.string().optional(),
});

export const Route = createFileRoute("/offers")({
  validateSearch: offersSearchSchema,
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

export function OffersPage() {
  const { data: banners } = useSuspenseQuery(bannersQuery());
  const [openCommentsFor, setOpenCommentsFor] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const hasScrolledToTarget = useRef(false);

  // Extract target ID from search params or route params or window location
  const search = useSearch({ strict: false }) as { id?: string; bannerId?: string } | undefined;
  const params = useParams({ strict: false }) as { id?: string } | undefined;
  const targetId =
    search?.id ||
    search?.bannerId ||
    params?.id ||
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("id") ||
        new URLSearchParams(window.location.search).get("bannerId")
      : null);

  useEffect(() => {
    if (!targetId || !banners || banners.length === 0 || hasScrolledToTarget.current) return;
    const targetIdx = banners.findIndex((b) => b.id === targetId);
    if (targetIdx !== -1) {
      hasScrolledToTarget.current = true;
      setActiveIndex(targetIdx);
      setTimeout(() => {
        const el = feedRef.current?.children[targetIdx] as HTMLElement | undefined;
        el?.scrollIntoView({ behavior: "smooth" });
      }, 150);
    }
  }, [targetId, banners]);

  const handleActive = useCallback((index: number) => {
    setActiveIndex((current) => (current === index ? current : index));
  }, []);

  const handleNext = useCallback(
    (currentIndex: number) => {
      if (!banners || banners.length <= 1) return;
      const next = (currentIndex + 1) % banners.length;
      const el = feedRef.current?.children[next] as HTMLElement | undefined;
      el?.scrollIntoView({ behavior: "smooth" });
    },
    [banners],
  );

  const activeBannerId = banners[activeIndex]?.id || targetId || "";

  const handleOpenApp = () => {
    const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
    if (isAndroid) {
      const intentUrl = activeBannerId
        ? `intent://maktabali.com/reels?id=${activeBannerId}#Intent;scheme=https;package=com.mkteb.ali.chevrolet;end`
        : `intent://maktabali.com/reels#Intent;scheme=https;package=com.mkteb.ali.chevrolet;end`;
      window.location.href = intentUrl;
    } else {
      const appUrl = activeBannerId
        ? `com.mkteb.ali.chevrolet://reels?id=${activeBannerId}`
        : `com.mkteb.ali.chevrolet://reels`;
      window.location.href = appUrl;
    }
  };

  return (
    <PageShell showHeader={false} showNav={false}>
      <div className="fixed inset-0 bg-black overflow-hidden">
        <Link
          to="/"
          className="absolute top-4 start-4 z-30 size-10 rounded-full bg-black/40 backdrop-blur text-white grid place-items-center border border-white/20 hover:bg-black/60 transition-colors"
          aria-label="رجوع"
        >
          <ChevronLeft className="size-5 rtl:rotate-180" />
        </Link>
        <div className="absolute top-4 inset-x-0 z-20 flex justify-center pointer-events-none">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-black/40 border border-white/20 rounded-full px-3 py-1 backdrop-blur shadow-sm">
            <Sparkles className="size-3 text-amber-400" /> ريلز العروض
          </div>
        </div>
        <button
          onClick={handleOpenApp}
          className="absolute top-4 end-4 z-30 h-10 px-3.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/25 active:scale-95 transition-all cursor-pointer"
          title="مشاهدة في تطبيق مكتب علي"
        >
          <Smartphone className="size-4" />
          <span>فتح في التطبيق</span>
        </button>

        {banners.length === 0 ? (
          <div className="h-full grid place-items-center text-white/70 text-sm">لا توجد عروض حالياً.</div>
        ) : (
          <div
            ref={feedRef}
            className="h-full overflow-y-auto snap-y snap-mandatory scroll-smooth"
            style={{ scrollbarWidth: "none" }}
          >
            {banners.map((b, index) => (
              <ReelItem
                key={b.id}
                banner={b}
                index={index}
                shouldLoad={Math.abs(index - activeIndex) <= 1}
                onActive={handleActive}
                onNext={() => handleNext(index)}
                onOpenComments={() => setOpenCommentsFor(b.id)}
              />
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

function ReelItem({
  banner,
  index,
  shouldLoad,
  onActive,
  onNext,
  onOpenComments,
}: {
  banner: Banner;
  index: number;
  shouldLoad: boolean;
  onActive: (index: number) => void;
  onNext?: () => void;
  onOpenComments: () => void;
}) {
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    // Default: sound ON when opening a clip. Only stay muted if the user
    // explicitly chose mute earlier in this session.
    return window.sessionStorage.getItem("reels_muted") === "1";
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const video = (banner as unknown as { video_url?: string | null }).video_url ?? null;
  const cachedVideo = useCachedVideo(shouldLoad ? video : null);
  // Prefetch this reel's video into Cache Storage as it approaches the
  // viewport, so tapping/scrolling to it starts playback near-instantly.
  const prefetchRef = usePrefetchNearbyVideo(video, { rootMargin: "120% 0px" });
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
    const box = containerRef.current;
    if (!box) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            onActive(index);
            const el = videoRef.current;
            if (!el) return;
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
            videoRef.current?.pause();
          }
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(box);
    return () => io.disconnect();
  }, [video, muted, shouldLoad, index, onActive]);

  const likes = useLikes(banner.id, userId, shouldLoad);
  const commentsCount = useCommentsCount(banner.id, shouldLoad);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);

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
      ref={(node) => {
        containerRef.current = node;
        prefetchRef(node);
      }}
      className="relative w-full h-[100dvh] snap-start snap-always bg-black"
    >
      {video && shouldLoad ? (
        isYouTubeUrl(video) ? (
          <div className="absolute inset-0 w-full h-full overflow-hidden bg-black" onClick={handleMediaTap}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${getYouTubeVideoId(video)}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${getYouTubeVideoId(video)}&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3&enablejsapi=1`}
              title={banner.title_ar ?? "YouTube Reel"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              className="absolute inset-0 w-full h-full pointer-events-none scale-[1.35] object-cover"
            />
          </div>
        ) : (
          <video
            ref={videoRef}
            src={cachedVideo ?? video}
            poster={banner.image_url || undefined}
            autoPlay
            muted={muted}
            playsInline
            preload="auto"
            disableRemotePlayback
            className="absolute inset-0 w-full h-full object-contain"
            onClick={handleMediaTap}
            onTimeUpdate={(e) => {
              if (!isScrubbing) setCurrentTime(e.currentTarget.currentTime);
            }}
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration || 0);
            }}
            onDurationChange={(e) => {
              setDuration(e.currentTarget.duration || 0);
            }}
            onEnded={() => {
              if (onNext) onNext();
            }}
            onVolumeChange={(e) => {
              const el = e.currentTarget;
              setMuted(el.muted);
            }}
            onWaiting={() => setPrefetchPaused(true)}
            onStalled={() => setPrefetchPaused(true)}
            onPlaying={() => setPrefetchPaused(false)}
            onCanPlayThrough={() => setPrefetchPaused(false)}
            onPause={() => setPrefetchPaused(false)}
          />
        )
      ) : banner.image_url || (video && isYouTubeUrl(video)) ? (
        <img
          src={safeYouTubeThumbnailUrl(banner.image_url, video)}
          alt={banner.title_ar ?? ""}
          className="absolute inset-0 w-full h-full object-contain"
          onClick={handleMediaTap}
          onError={(e) => {
            if (video && isYouTubeUrl(video)) {
              const yid = getYouTubeVideoId(video);
              if (yid) (e.currentTarget as HTMLImageElement).src = `https://i.ytimg.com/vi/${yid}/hqdefault.jpg`;
            }
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black" />
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
      <div className="absolute inset-x-0 bottom-0 p-4 pb-7 text-white z-10">
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

      {/* interactive seek/progress bar */}
      {video && !isYouTubeUrl(video) && duration > 0 && (
        <div className="absolute inset-x-0 bottom-0 z-30 select-none pb-safe">
          {isScrubbing && (
            <div className="flex justify-center mb-2 pointer-events-none">
              <div className="px-3 py-1 rounded-full bg-black/85 border border-gold/60 text-white font-bold text-xs tracking-wider backdrop-blur shadow-lg">
                {formatReelTime(scrubTime)} / {formatReelTime(duration)}
              </div>
            </div>
          )}
          <div
            className="group relative h-6 flex items-end cursor-pointer"
            onPointerDown={(e) => {
              setIsScrubbing(true);
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const t = duration * ratio;
              setScrubTime(t);
              if (videoRef.current) videoRef.current.currentTime = t;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!isScrubbing) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const t = duration * ratio;
              setScrubTime(t);
              if (videoRef.current) videoRef.current.currentTime = t;
            }}
            onPointerUp={(e) => {
              setIsScrubbing(false);
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const t = duration * ratio;
              if (videoRef.current) {
                videoRef.current.currentTime = t;
                setCurrentTime(t);
                videoRef.current.play().catch(() => {});
              }
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch {}
            }}
          >
            <div className="w-full h-1 group-hover:h-2 bg-white/25 transition-all duration-150 relative">
              <div
                className="h-full bg-gold transition-all duration-75 relative"
                style={{
                  width: `${((isScrubbing ? scrubTime : currentTime) / duration) * 100}%`,
                }}
              >
                <div className="absolute end-0 top-1/2 -translate-y-1/2 size-3 rounded-full bg-white border-2 border-gold shadow opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatReelTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/* ---------- hooks ---------- */

function useLikes(bannerId: string, userId: string | null, enabled = true) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["banner_likes", bannerId, userId],
    enabled,
    staleTime: 30_000,
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

function useCommentsCount(bannerId: string, enabled = true) {
  const { data } = useQuery({
    queryKey: ["banner_comments_count", bannerId],
    enabled,
    staleTime: 30_000,
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
        {bannerId && <CommentsSheetContent bannerId={bannerId} />}
      </SheetContent>
    </Sheet>
  );
}

function CommentsSheetContent({ bannerId }: { bannerId: string }) {
  const isAdmin = useIsAdmin();
  const { canBlock } = useAdminAccessStatus();
  const canModerate = isAdmin || canBlock;
  const [tab, setTab] = useState<"comments" | "users">("comments");
  return (
    <>
      <SheetHeader className="px-4 pt-4 pb-2 border-b">
        <SheetTitle className="text-base flex items-center justify-between gap-2">
          <span>{tab === "comments" ? "التعليقات" : "المستخدمون"}</span>
          {canModerate && (
            <div className="inline-flex rounded-lg border border-border overflow-hidden text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setTab("comments")}
                className={`px-3 py-1.5 flex items-center gap-1 ${tab === "comments" ? "bg-gold text-navy" : "bg-transparent text-muted-foreground"}`}
              >
                <MessageCircle className="size-3.5" /> تعليقات
              </button>
              <button
                type="button"
                onClick={() => setTab("users")}
                className={`px-3 py-1.5 flex items-center gap-1 ${tab === "users" ? "bg-gold text-navy" : "bg-transparent text-muted-foreground"}`}
              >
                <UsersIcon className="size-3.5" /> مستخدمون
              </button>
            </div>
          )}
        </SheetTitle>
      </SheetHeader>
      {tab === "comments" ? <CommentsBody bannerId={bannerId} /> : <UsersPanel />}
    </>
  );
}

/* ---------- Users panel (moderation) ---------- */

type ModUser = {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  profile_phone: string | null;
  is_blocked: boolean;
  is_active: boolean;
  last_sign_in_at: string | null;
  created_at: string | null;
};

function UsersPanel() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "blocked" | "active">("all");
  const [detail, setDetail] = useState<ModUser | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["moderator", "users"],
    queryFn: () => moderatorListUsers(),
    staleTime: 30_000,
  });

  const users = (data?.users ?? []) as ModUser[];
  const filtered = (() => {
    const s = search.trim().toLowerCase();
    let out = users;
    if (filter === "blocked") out = out.filter((u) => u.is_blocked);
    else if (filter === "active") out = out.filter((u) => u.is_active);
    if (!s) return out;
    return out.filter((u) =>
      [u.full_name, u.email, u.phone, u.profile_phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  })();

  const block = useMutation({
    mutationFn: async ({ uid, blocked }: { uid: string; blocked: boolean }) => {
      await adminSetUserBlocked({
        data: {
          user_id: uid,
          blocked,
          reason: blocked
            ? "تم حظرك بسبب مخالفة قوانين المجتمع. يرجى الالتزام بالكلام المحترم."
            : "تم رفع الحظر عن حسابك، يمكنك الآن التعليق بشكل طبيعي.",
        },
      });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["moderator", "users"] });
      qc.invalidateQueries({ queryKey: ["banner_comments"] });
      setDetail((prev) => (prev ? { ...prev, is_blocked: vars.blocked } : prev));
      toast.success(vars.blocked ? "تم حظر المستخدم" : "تم رفع الحظر");
    },
    onError: (e: Error) => toast.error(e.message || "تعذر التنفيذ"),
  });

  const fmt = (iso: string | null) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("ar-IQ", { dateStyle: "short", timeStyle: "short" }); }
    catch { return iso; }
  };

  const chip = (v: "all" | "blocked" | "active", label: string, count?: number) => (
    <button
      type="button"
      onClick={() => setFilter(v)}
      className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${filter === v ? "bg-gold text-navy border-gold" : "bg-card text-muted-foreground border-border"}`}
    >
      {label}{typeof count === "number" ? ` (${count})` : ""}
    </button>
  );

  const blockedCount = users.filter((u) => u.is_blocked).length;
  const activeCount = users.filter((u) => u.is_active).length;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      <label className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 focus-within:border-gold">
        <SearchIcon className="size-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو الهاتف أو الإيميل…"
          className="flex-1 bg-transparent outline-none text-sm"
        />
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs text-gold font-bold px-2 disabled:opacity-50"
          disabled={isFetching}
        >
          {isFetching ? "…" : "تحديث"}
        </button>
      </label>

      <div className="flex items-center gap-2 flex-wrap">
        {chip("all", "الكل", users.length)}
        {chip("active", "متصلون", activeCount)}
        {chip("blocked", "محظورون", blockedCount)}
      </div>

      {isLoading ? (
        <div className="text-center text-sm text-muted-foreground py-8">جاري التحميل…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8">لا يوجد مستخدمون مطابقون</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => {
            const displayPhone = u.profile_phone || u.phone;
            const label = u.full_name || (displayPhone ? `+${String(displayPhone).replace(/\D/g, "")}` : (u.email ?? "بلا اسم"));
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => setDetail(u)}
                className="w-full text-start bg-card border border-border rounded-2xl p-3 flex items-center gap-3 hover:border-gold/50 transition"
              >
                <div className={`size-11 rounded-full grid place-items-center font-black text-lg shrink-0 ${u.is_blocked ? "bg-destructive/15 text-destructive" : u.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                  {(label[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 text-sm">
                  <div className="font-bold truncate flex items-center gap-1.5">
                    {label}
                    {u.is_blocked && <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full"><Ban className="size-2.5" /> محظور</span>}
                    {u.is_active && !u.is_blocked && <span className="text-[9px] font-black text-success bg-success/10 px-1.5 py-0.5 rounded-full">متصل</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground">آخر دخول: {fmt(u.last_sign_in_at)}</div>
                </div>
                <div className="text-[11px] text-gold font-bold">تفاصيل</div>
              </button>
            );
          })}
        </div>
      )}

      <Sheet open={!!detail} onOpenChange={(v) => { if (!v) setDetail(null); }}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-base">تفاصيل المستخدم</SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <div className={`size-14 rounded-full grid place-items-center font-black text-xl ${detail.is_blocked ? "bg-destructive/15 text-destructive" : "bg-muted"}`}>
                  {((detail.full_name || detail.email || "?")[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-black truncate">{detail.full_name || "بلا اسم"}</div>
                  <div className="text-[11px] text-muted-foreground truncate" dir="ltr">
                    {(detail.profile_phone || detail.phone) ? `+${String(detail.profile_phone || detail.phone).replace(/\D/g, "")}` : (detail.email ?? "—")}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div className="bg-card border border-border rounded-xl p-2">
                  <div className="text-[10px] text-muted-foreground">الحالة</div>
                  <div className="font-bold">
                    {detail.is_blocked ? <span className="text-destructive">محظور</span> : detail.is_active ? <span className="text-success">متصل الآن</span> : <span className="text-muted-foreground">غير متصل</span>}
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl p-2">
                  <div className="text-[10px] text-muted-foreground">تاريخ الإنشاء</div>
                  <div className="font-bold">{fmt(detail.created_at)}</div>
                </div>
                <div className="bg-card border border-border rounded-xl p-2 col-span-2">
                  <div className="text-[10px] text-muted-foreground">آخر دخول</div>
                  <div className="font-bold">{fmt(detail.last_sign_in_at)}</div>
                </div>
                {detail.email && (
                  <div className="bg-card border border-border rounded-xl p-2 col-span-2">
                    <div className="text-[10px] text-muted-foreground">البريد</div>
                    <div className="font-bold truncate" dir="ltr">{detail.email}</div>
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant={detail.is_blocked ? "outline" : "destructive"}
                className="w-full"
                disabled={block.isPending}
                onClick={() => block.mutate({ uid: detail.id, blocked: !detail.is_blocked })}
              >
                {detail.is_blocked ? (<><Check className="size-4 me-1" /> رفع الحظر</>) : (<><Ban className="size-4 me-1" /> حظر المستخدم</>)}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CommentsBody({ bannerId }: { bannerId: string }) {
  const { userId } = useAuth();
  const { isAdmin, hasAnyAccess, canBlock } = useAdminAccessStatus();
  const canPostAsOffice = isAdmin || hasAnyAccess;
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [asAdmin, setAsAdmin] = useState(false);
  const PAGE_SIZE = 10;
  const [limit, setLimit] = useState(PAGE_SIZE);
  const addBannerCommentFn = useServerFn(addBannerComment);

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

  // Realtime: refresh list + count when comments on this banner change.
  useEffect(() => {
    const channel = supabase
      .channel(`banner_comments:${bannerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "banner_comments", filter: `banner_id=eq.${bannerId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["banner_comments", bannerId] });
          qc.invalidateQueries({ queryKey: ["banner_comments_count", bannerId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [bannerId, qc]);

  const addOrEdit = useMutation({
    mutationFn: async (vars: { body: string; editingId: string | null; parentId?: string | null; asAdmin: boolean }) => {
      const body = vars.body.trim();
      if (!body) throw new Error("empty");
      if (!userId) throw new Error("auth");
      const { containsProfanity } = await import("@/lib/profanity");
      if (containsProfanity(body)) throw new Error("profanity");
      if (vars.editingId) {
        const { error } = await supabase
          .from("banner_comments")
          .update({ content: body })
          .eq("id", vars.editingId);
        if (error) throw error;
      } else {
        await addBannerCommentFn({
          data: {
            bannerId,
            content: body,
            parentId: vars.parentId || null,
            isAdminReply: canPostAsOffice && vars.asAdmin,
          },
        });
      }
    },
    onMutate: async (vars) => {
      const body = vars.body;
      if (!body || !userId) return;
      const key = ["banner_comments", bannerId, limit];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ rows: CommentRow[]; total: number }>(key);
      if (vars.editingId) {
        qc.setQueryData<{ rows: CommentRow[]; total: number }>(key, (d) =>
          d ? { ...d, rows: d.rows.map((r) => (r.id === vars.editingId ? { ...r, content: body } : r)) } : d,
        );
      } else {
        const prevProfile = (previous?.rows ?? []).find((r) => r.user_id === userId)?.profile ?? null;
        const optimistic: CommentRow = {
          id: `optimistic-${Date.now()}`,
          banner_id: bannerId,
          user_id: userId,
          parent_id: null,
          content: body,
          is_admin_reply: canPostAsOffice && vars.asAdmin,
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
      setReplyingTo(null);
      setAsAdmin(false);
      return { previous, isEdit: !!vars.editingId };
    },
    onSuccess: (_data, _vars, ctx) => {
      qc.invalidateQueries({ queryKey: ["banner_comments", bannerId] });
      qc.invalidateQueries({ queryKey: ["banner_comments_count", bannerId] });
      toast.success(ctx?.isEdit ? "تم تحديث التعليق" : "تم نشر تعليقك");
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["banner_comments", bannerId, limit], ctx.previous);
      qc.invalidateQueries({ queryKey: ["banner_comments_count", bannerId] });
      if (e.message === "auth") toast.error("سجّل الدخول لكتابة تعليق");
      else if (e.message === "profanity")
        toast.error("تعليقك يحتوي كلمات مسيئة. يرجى الالتزام بالاحترام.");
      else if (e.message !== "empty") {
        // Surface backend errors (blocked account, banner unavailable, ...)
        // so the customer understands why the comment did not go through.
        const msg = e.message?.trim();
        toast.error(msg && msg.length < 200 ? msg : "تعذر الإرسال");
      }
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
              canBlock={canBlock}
              onReply={() => {
                setEditingId(null);
                const commenterName = c.is_admin_reply ? "مكتب علي شوفرليت" : (c.profile?.full_name || "مستخدم");
                setReplyingTo({ id: c.id, name: commenterName });
              }}
              onEdit={() => { setEditingId(c.id); setReplyingTo(null); setText(c.content); }}
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
          {replyingTo && !editingId && (
            <div className="flex items-center justify-between text-xs bg-muted/70 px-3 py-1.5 rounded-lg border border-border">
              <span className="text-muted-foreground inline-flex items-center gap-1.5">
                <Reply className="size-3 text-gold" />
                الرد على: <strong className="text-foreground">{replyingTo.name}</strong>
              </span>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="إلغاء الرد"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          {canPostAsOffice && !editingId && (
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={asAdmin}
                onChange={(e) => setAsAdmin(e.target.checked)}
                className="size-4 rounded"
              />
              <span className="inline-flex items-center gap-1 font-bold text-foreground">
                <Shield className="size-3 text-gold" />
                {replyingTo ? 'الرد باسم "مكتب علي شوفرليت"' : 'التعليق باسم "مكتب علي شوفرليت"'}
              </span>
            </label>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={editingId ? "تعديل التعليق…" : (replyingTo ? `الرد على ${replyingTo.name}…` : "أضف تعليقاً…")}
              className="min-h-[42px] max-h-32 resize-none flex-1"
              maxLength={1000}
            />
            {(editingId || replyingTo) && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => { setEditingId(null); setReplyingTo(null); setText(""); }}
                aria-label="إلغاء"
              >
                <X className="size-4" />
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              onClick={() => addOrEdit.mutate({ body: text.trim(), editingId, parentId: replyingTo?.id, asAdmin })}
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
  c, currentUserId, isAdmin, canBlock, onReply, onEdit, onDelete, onBlock,
}: {
  c: CommentRow;
  currentUserId: string | null;
  isAdmin: boolean;
  canBlock: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onBlock: () => void;
}) {
  const mine = currentUserId === c.user_id;
  const name = c.is_admin_reply ? "مكتب علي شوفرليت" : (c.profile?.full_name || "مستخدم");
  const initials = (name || "?").slice(0, 1);
  return (
    <div className="flex gap-2.5">
      <div className="size-9 rounded-full bg-muted grid place-items-center text-sm font-bold overflow-hidden shrink-0">
        {c.profile?.avatar_url && !c.is_admin_reply ? (
          <img src={c.profile.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className={c.is_admin_reply ? "text-gold font-black" : ""}>{c.is_admin_reply ? "ع" : initials}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-sm font-bold ${c.is_admin_reply ? "text-gold" : ""}`}>{name}</span>
          {c.is_admin_reply && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gold bg-gold/10 border border-gold/30 rounded-full px-1.5 py-0.5">
              <Shield className="size-2.5" /> مكتب علي شوفرليت
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {new Date(c.created_at).toLocaleDateString("ar-IQ")}
          </span>
        </div>
        <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{c.content}</p>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
          {currentUserId && (
            <button
              type="button"
              onClick={onReply}
              className="inline-flex items-center gap-1 hover:text-foreground font-medium"
            >
              <Reply className="size-3" /> رد
            </button>
          )}
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
            <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 hover:text-destructive">
              <Trash2 className="size-3" /> حذف
            </button>
          )}
          {!mine && canBlock && (
            <button type="button" onClick={onBlock} className={`inline-flex items-center gap-1 ${c.profile?.is_blocked ? "hover:text-success" : "hover:text-destructive"}`}>
              {c.profile?.is_blocked ? <Check className="size-3" /> : <Ban className="size-3" />}
              {c.profile?.is_blocked ? "رفع الحظر" : "حظر المستخدم"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
