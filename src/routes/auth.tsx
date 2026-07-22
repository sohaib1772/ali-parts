import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";
import { useSetting } from "@/lib/admin";
import { sessionRestorePromise } from "@/lib/session-bootstrap";

// Fast admin-redirect check. Fails soft: if the check errors or the user
// isn't an admin/staff, we send them straight to "/" without waiting.
async function resolvePostLoginPath(userId: string): Promise<"/admin" | "/"> {
  try {
    const [roleRes, staffRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
      supabase.from("staff_permissions").select("can_orders,can_products,can_replacements,can_block").eq("user_id", userId).maybeSingle(),
    ]);
    if (roleRes.data) return "/admin";
    const s = staffRes.data as { can_orders?: boolean; can_products?: boolean; can_replacements?: boolean; can_block?: boolean } | null;
    if (s && (s.can_orders || s.can_products || s.can_replacements || s.can_block)) return "/admin";
  } catch { /* fall through */ }
  return "/";
}

export const Route = createFileRoute("/auth")({
  // Client-only: the Google OAuth return (?code=…) is exchanged for a session
  // in the browser (PKCE). Rendering this on the server would race hydration.
  ssr: false,
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — Ali Parts" },
      { name: "description", content: "سجّل الدخول إلى Ali Parts عبر حساب Google للاستفادة من كل الميزات." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const storeName = useSetting("store_name", "Ali Parts");
  const [loading, setLoading] = useState(false);
  const navigatedRef = useRef(false);

  // Land the user in the app once a session exists — this covers BOTH an
  // already-signed-in visitor AND the return leg of the Google OAuth redirect
  // (detectSessionInUrl exchanges the ?code=… and fires onAuthStateChange).
  useEffect(() => {
    let mounted = true;
    const goIfSession = async (userId: string | undefined) => {
      if (!userId || navigatedRef.current || !mounted) return;
      navigatedRef.current = true;
      const to = await resolvePostLoginPath(userId);
      navigate({ to, replace: true });
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      void goIfSession(session?.user?.id);
    });
    (async () => {
      await sessionRestorePromise;
      const { data } = await supabase.auth.getSession();
      void goIfSession(data.session?.user?.id);
    })();
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  const oauth = async (provider: "google" | "apple", label: string) => {
    if (loading) return;
    setLoading(true);

    // Native shell: the provider cannot run inside the WebView, so it runs in
    // a Custom Tab and returns through a custom scheme. See lib/native-oauth.
    // Lazy-imported so the web bundle never ships @capacitor/browser.
    if (Capacitor.isNativePlatform()) {
      const { signInWithProviderNative } = await import("@/lib/native-oauth");
      const result = await signInWithProviderNative(provider);
      if (result.status === "signed-in") {
        // Session is set; onAuthStateChange above navigates. Spinner stays up
        // until it does, so the screen never looks idle mid-transition.
        return;
      }
      if (result.status === "error") {
        toast.error(`تعذّر تسجيل الدخول عبر ${label}`, { description: result.message });
      }
      // "cancelled" needs no message — the user chose to back out — but the
      // spinner must clear either way or the screen reads as frozen.
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // Return to /auth; this component picks up the session and routes on.
        redirectTo: window.location.origin + "/auth",
      },
    });
    if (error) {
      toast.error(`تعذّر تسجيل الدخول عبر ${label} — حاول مرة أخرى`);
      setLoading(false);
    }
    // On success the browser navigates to the provider; the return leg is
    // handled by the onAuthStateChange listener above.
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-[#0f172a] to-[#1e293b] text-white flex flex-col items-center justify-center p-6 selection:bg-gold/30">
      {/* Ambient background glows */}
      <div className="pointer-events-none fixed top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-amber-500/12 blur-[120px]" />
      <div className="pointer-events-none fixed bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-blue-400/8 blur-[120px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.02]" />

      <div className="relative w-full max-w-[420px]">
        <Link
          to="/"
          className="absolute -top-14 start-0 inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-gold transition-colors"
        >
          <ArrowRight className="size-3.5" /> العودة للرئيسية
        </Link>

        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-b from-[#1a2332] to-[#111827] p-8 shadow-2xl">
          {/* Top golden shine line */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" />

          {/* Headline */}
          <div className="text-center mb-8">
            <h2 className="font-luxury text-2xl font-semibold mb-2">مرحباً بك في {storeName}</h2>
            <p className="font-body-lux text-sm text-white/50">شوفرليت — قطع غيار سيارات مستعمل و جديد</p>
          </div>

          {/* Google */}
          <button
            onClick={() => oauth("google", "Google")}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white text-[#1f2937] hover:bg-white/90 py-4 font-bold transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-5 animate-spin text-gold" /> : <GoogleG />}
            <span className="font-body-lux text-sm">المتابعة مع Google</span>
          </button>

          {/* Apple */}
          <button
            onClick={() => oauth("apple", "Apple")}
            disabled={loading}
            className="mt-3 w-full flex items-center justify-center gap-3 rounded-2xl border border-white/15 bg-black text-white hover:bg-black/80 py-4 font-bold transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-5 animate-spin text-white" /> : <AppleLogo />}
            <span className="font-body-lux text-sm">المتابعة مع Apple</span>
          </button>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-white/40 font-body-lux">
            بالمتابعة أنت توافق على الشروط والأحكام وسياسة الخصوصية.
            <br />
            سنطلب رقم هاتفك بعد الدخول لاستخدامه في التوصيل فقط.
          </p>

          {/* Bottom decorative dots */}
          <div className="mt-8 flex justify-center gap-1.5">
            <div className="w-8 h-1 rounded-full bg-gold/30" />
            <div className="w-2 h-1 rounded-full bg-white/10" />
            <div className="w-2 h-1 rounded-full bg-white/10" />
          </div>
        </div>

        {/* Trust badges */}
        <div className="flex justify-center gap-6 mt-8">
          <div className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
            <div className="w-1.5 h-1.5 rounded-full bg-gold" />
            <span className="text-[10px] text-white/60 uppercase tracking-[0.2em] font-body-lux">قطع أصلية</span>
          </div>
          <div className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
            <div className="w-1.5 h-1.5 rounded-full bg-gold" />
            <span className="text-[10px] text-white/60 uppercase tracking-[0.2em] font-body-lux">توصيل سريع</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.44c-.28 1.4-1.09 2.6-2.31 3.42v2.84h3.72c2.18-2.01 3.44-4.97 3.44-8.5z"/>
      <path fill="#34A853" d="M12 24c3.13 0 5.75-1.04 7.66-2.81l-3.72-2.84c-1.03.69-2.35 1.09-3.94 1.09-3.03 0-5.6-2.05-6.51-4.81H1.63v2.93A11.99 11.99 0 0012 24z"/>
      <path fill="#FBBC05" d="M5.49 14.63c-.23-.69-.35-1.42-.35-2.17s.13-1.48.35-2.17V7.36H1.63A11.99 11.99 0 000 12.46c0 1.93.46 3.75 1.27 5.36l4.22-3.19z"/>
      <path fill="#EA4335" d="M12 4.75c1.7 0 3.23.59 4.43 1.74l3.32-3.32C17.74 1.19 15.12 0 12 0 7.31 0 3.26 2.69 1.27 6.6l4.22 3.19C6.4 6.8 8.97 4.75 12 4.75z"/>
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="white" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  );
}
