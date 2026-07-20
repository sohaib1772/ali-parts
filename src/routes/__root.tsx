import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SplashScreen } from "@/components/splash-screen";
import { NotificationPopup } from "@/components/notification-popup";
import { usePriceSyncListener } from "@/lib/price-sync";
import { AuthProvider } from "@/lib/use-auth";
import { SessionPersistence } from "@/lib/session-persistence";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Ali Parts — قطع غيار شفروليه GMC كاديلاك الأصلية في العراق" },
      { name: "description", content: "Ali Parts: متجرك الأول لقطع غيار السيارات الأصلية شفروليه، GMC، وكاديلاك داخل العراق. توصيل سريع وضمان الجودة." },
      { name: "theme-color", content: "#0A192F" },
      { property: "og:title", content: "Ali Parts — قطع غيار شفروليه GMC كاديلاك الأصلية في العراق" },
      { property: "og:description", content: "Ali Parts: متجرك الأول لقطع غيار السيارات الأصلية شفروليه، GMC، وكاديلاك داخل العراق. توصيل سريع وضمان الجودة." },
      { property: "og:type", content: "website" },
      // `summary` (not `summary_large_image`) because the only share image we
      // currently serve is the square 512x512 store logo. Switch back to
      // `summary_large_image` once a proper 1200x630 og-image.png exists.
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Ali Parts — قطع غيار شفروليه GMC كاديلاك الأصلية في العراق" },
      { name: "twitter:description", content: "Ali Parts: متجرك الأول لقطع غيار السيارات الأصلية شفروليه، GMC، وكاديلاك داخل العراق. توصيل سريع وضمان الجودة." },
      { property: "og:url", content: "https://maktabali.com/" },
      { property: "og:image", content: "https://maktabali.com/icon-512.png" },
      { property: "og:image:width", content: "512" },
      { property: "og:image:height", content: "512" },
      { name: "twitter:image", content: "https://maktabali.com/icon-512.png" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Ali Parts" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://nqdsvubimpftjfygzisx.supabase.co", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://nqdsvubimpftjfygzisx.supabase.co" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Cormorant+Garamond:wght@400;500;600;700&family=Karla:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
        <style>{`html,body{background:#0A192F} #initial-boot-splash{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at top,#0f172a 0%,#0A192F 55%,#020617 100%);z-index:9999;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif} #initial-boot-splash img{width:120px;height:120px;border-radius:26px;border:2px solid rgba(201,162,39,.4);box-shadow:0 0 60px rgba(201,162,39,.35);background:#0f172a;object-fit:contain;padding:10px} #initial-boot-splash .t{margin-top:20px;font-size:24px;font-weight:800} #initial-boot-splash .s{margin-top:6px;font-size:12px;color:#C9A227} #initial-boot-splash .b{margin-top:24px;width:180px;height:3px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;position:relative} #initial-boot-splash .b::after{content:"";position:absolute;inset:0;width:33%;background:linear-gradient(90deg,transparent,#C9A227,transparent);animation:ibs 1.4s ease-in-out infinite} @keyframes ibs{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}`}</style>
      </head>
      <body>
        <div id="initial-boot-splash" aria-hidden="true">
          <img src="/icon-512.png" alt="" />
          <div className="t">مكتب علي شوفرليت</div>
          <div className="s">قطع أصلية · العراق</div>
          <div className="b"></div>
        </div>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster position="top-center" richColors closeButton />
        <AuthListener />
        <SessionPersistence />
        <PriceSync />
        <SplashScreen />
        <NotificationPermissionGate />
        <NotificationPopup />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function PriceSync() {
  usePriceSyncListener();
  return null;
}

function AuthListener() {
  const router = useRouter();
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    // Track the last known user id so we only react to real identity
    // transitions. Supabase re-fires `SIGNED_IN` on every tab mount when a
    // session is restored from storage, and also on `TOKEN_REFRESHED` in some
    // versions — invalidating the router on those spurious events causes the
    // just-rendered protected page (e.g. the admin panel) to flash off while
    // `_authenticated`'s `beforeLoad` re-runs `getUser()`.
    let lastUserId: string | null | undefined = undefined;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      const nextUserId = session?.user?.id ?? null;
      const identityChanged = lastUserId !== undefined && lastUserId !== nextUserId;
      lastUserId = nextUserId;
      if (event === "SIGNED_OUT") {
        router.invalidate();
        return;
      }
      if (event === "USER_UPDATED") {
        queryClient.invalidateQueries();
        return;
      }
      // SIGNED_IN: only invalidate when the identity actually changed
      // (i.e. a real login, not the initial session restore).
      if (identityChanged) {
        router.invalidate();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}

function NotificationPermissionGate() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    const STORAGE_KEY = "alsaaer_notif_perm_asked";
    // Never ask more than once per app install; respect prior decision.
    try {
      const asked = window.localStorage.getItem(STORAGE_KEY);
      const state = Notification.permission;
      if (state === "granted" || state === "denied") {
        // Already decided by the user/browser — never prompt again.
        window.localStorage.setItem(STORAGE_KEY, state);
        return;
      }
      if (asked) return; // default state but we already asked before
      // Delay slightly so the splash finishes first.
      const t = setTimeout(() => {
        try {
          window.localStorage.setItem(STORAGE_KEY, "asked");
          Notification.requestPermission().then((result) => {
            try { window.localStorage.setItem(STORAGE_KEY, result); } catch {}
          }).catch(() => {});
        } catch {}
      }, 5500);
      return () => clearTimeout(t);
    } catch {}
  }, []);
  return null;
}
