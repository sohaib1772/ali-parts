import { useEffect, useState } from "react";

const SESSION_KEY = "alsaaer_splash_shown";
const STORE_NAME = "مكتب علي شوفرليت";
const STORE_TAGLINE = "قطع أصلية · العراق";
const STORE_LOGO = "/icon-512.png";

export function SplashScreen() {
  // Always render the splash during SSR + first client paint so the app
  // never flashes behind it. We decide whether to keep it visible in a
  // client-only effect (after hydration) to avoid hydration mismatches.
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    let alreadyShown = false;
    try {
      alreadyShown = !!window.sessionStorage.getItem(SESSION_KEY);
    } catch {}
    if (alreadyShown) {
      setVisible(false);
      return;
    }
    const fadeAt = setTimeout(() => setFading(true), 350);
    const hideAt = setTimeout(() => {
      setVisible(false);
      try { window.sessionStorage.setItem(SESSION_KEY, "1"); } catch {}
    }, 650);
    return () => {
      clearTimeout(fadeAt);
      clearTimeout(hideAt);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-b from-[#0a1226] via-[#0f172a] to-[#020617] transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}
      dir="rtl"
      aria-hidden={fading}
    >
      {/* Ambient glows */}
      <div className="pointer-events-none absolute top-[-15%] left-[-15%] w-[60%] h-[60%] rounded-full bg-amber-500/12 blur-[140px]" />
      <div className="pointer-events-none absolute bottom-[-15%] right-[-15%] w-[60%] h-[60%] rounded-full bg-blue-400/10 blur-[140px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:36px_36px] opacity-[0.03]" />

      {/* Top gold shine line */}
      <div className="absolute top-0 inset-x-10 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" />

      <div className="relative flex flex-col items-center animate-[fadeInUp_600ms_ease-out_both]">
        {/* Logo ring */}
        <div className="relative mb-8">
          <div className="absolute -inset-6 rounded-full bg-gradient-to-tr from-amber-500/50 to-amber-200/40 blur-3xl animate-pulse" />
          <div className="absolute inset-0 -m-3 rounded-[2rem] border border-gold/25" />
          <div className="absolute inset-0 -m-6 rounded-[2.5rem] border border-gold/10" />
          <div className="relative size-40 rounded-[1.75rem] bg-gradient-to-br from-[#1e293b] to-[#0f172a] border-2 border-gold/40 flex items-center justify-center shadow-[0_0_80px_rgba(201,162,39,0.35)] overflow-hidden">
            <img src={STORE_LOGO} alt={STORE_NAME} className="max-h-28 max-w-28 object-contain drop-shadow-[0_0_20px_rgba(201,162,39,0.35)]" />
          </div>
        </div>

        {/* Wordmark */}
        <h1 className="font-luxury text-5xl font-black tracking-tight text-white text-center px-8">
          {STORE_NAME}
        </h1>
        <div className="mt-3 flex items-center gap-2 text-gold/90">
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-gold/70" />
          <p className="font-body-lux text-sm">{STORE_TAGLINE}</p>
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold/70" />
        </div>

        {/* Loading shimmer */}
        <div className="mt-10 h-[3px] w-52 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-gold to-transparent animate-[splashBar_1.4s_ease-in-out_infinite]" />
        </div>
      </div>

      {/* Bottom shine line */}
      <div className="absolute bottom-0 inset-x-10 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" />

      <style>{`
        @keyframes splashBar { 0% { transform: translateX(-100%); } 100% { transform: translateX(320%); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}