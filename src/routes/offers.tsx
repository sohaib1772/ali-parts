import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Sparkles, Volume2, VolumeX, ChevronLeft, X } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { bannersQuery, type Banner } from "@/lib/queries";

export const Route = createFileRoute("/offers")({
  head: () => ({
    meta: [
      { title: "العروض الحصرية — Ali Parts" },
      { name: "description", content: "استعرض جميع العروض والتخفيضات الحصرية على قطع غيار شفروليه، GMC، وكاديلاك." },
      { property: "og:title", content: "العروض الحصرية — Ali Parts" },
      { property: "og:description", content: "استعرض جميع العروض والتخفيضات الحصرية على قطع غيار شفروليه، GMC، وكاديلاك." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(bannersQuery());
  },
  component: OffersPage,
});

function OffersPage() {
  const { data: banners } = useSuspenseQuery(bannersQuery());
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);

  return (
    <PageShell>
      <div className="px-4 pt-4 pb-6">
        <div className="flex items-center gap-2 mb-4">
          <Link to="/" className="size-9 grid place-items-center rounded-full bg-card border border-border">
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </Link>
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gold bg-gold/10 border border-gold/30 rounded-full px-2.5 py-0.5">
              <Sparkles className="size-3" /> عروض حصرية
            </div>
            <h1 className="text-xl font-black mt-1">كل العروض</h1>
          </div>
        </div>

        {banners.length === 0 ? (
          <div className="py-20 text-center text-sm text-muted-foreground">
            لا توجد عروض متاحة حالياً.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {banners.map((b) => (
              <OfferCard key={b.id} banner={b} setExpandedVideo={setExpandedVideo} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function OfferCard({ banner, setExpandedVideo }: { banner: Banner; setExpandedVideo: (url: string | null) => void }) {
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const video = (banner as any).video_url as string | undefined;

  const media = (
    <div className="relative w-full aspect-[16/10] bg-black">
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
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <img src={banner.image_url} alt={banner.title_ar ?? ""} className="absolute inset-0 w-full h-full object-cover" />
      )}
      {video && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const el = videoRef.current;
            const next = !muted;
            if (el) {
              el.muted = next;
              if (!next) {
                el.volume = 1;
                const p = el.play();
                if (p && typeof p.catch === "function") p.catch(() => {});
              }
            }
            setMuted(next);
          }}
          aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}
          className="absolute top-3 end-3 size-9 rounded-full bg-black/45 backdrop-blur-md text-white grid place-items-center border border-white/20 hover:bg-black/60 transition"
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-navy/85 via-navy/30 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-white pointer-events-none">
        {banner.title_ar && <h2 className="text-lg font-black leading-tight">{banner.title_ar}</h2>}
        {banner.subtitle_ar && <p className="text-xs text-white/85 mt-0.5">{banner.subtitle_ar}</p>}
      </div>
    </div>
  );

  const wrapperClass = "block rounded-3xl overflow-hidden shadow-luxe border border-border/60";
  if (banner.link) {
    return (
      <a href={banner.link} className={wrapperClass}>
        {media}
      </a>
    );
  }
  return <div className={wrapperClass}>{media}</div>;
}