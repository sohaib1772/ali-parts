import { Loader2 } from "lucide-react";

const STORE_NAME = "مكتب علي شوفرليت";
const STORE_LOGO = "/icon-512.png";

export function OrderSubmitSplash({ message = "جاري إرسال طلبك..." }: { message?: string }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-b from-[#0a1226] via-[#0f172a] to-[#020617]"
      dir="rtl"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-none absolute top-[-15%] left-[-15%] w-[60%] h-[60%] rounded-full bg-amber-500/12 blur-[140px]" />
      <div className="pointer-events-none absolute bottom-[-15%] right-[-15%] w-[60%] h-[60%] rounded-full bg-blue-400/10 blur-[140px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:36px_36px] opacity-[0.03]" />
      <div className="absolute top-0 inset-x-10 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" />

      <div className="relative flex flex-col items-center animate-[fadeInUp_500ms_ease-out_both]">
        <div className="relative mb-8">
          <div className="absolute -inset-6 rounded-full bg-gradient-to-tr from-amber-500/50 to-amber-200/40 blur-3xl animate-pulse" />
          <div className="absolute inset-0 -m-3 rounded-[2rem] border border-gold/25" />
          <div className="absolute inset-0 -m-6 rounded-[2.5rem] border border-gold/10" />
          <div className="relative size-40 rounded-[1.75rem] bg-gradient-to-br from-[#1e293b] to-[#0f172a] border-2 border-gold/40 flex items-center justify-center shadow-[0_0_80px_rgba(201,162,39,0.35)] overflow-hidden">
            <img src={STORE_LOGO} alt={STORE_NAME} className="max-h-28 max-w-28 object-contain drop-shadow-[0_0_20px_rgba(201,162,39,0.35)]" />
          </div>
        </div>

        <h1 className="font-luxury text-4xl font-black tracking-tight text-white text-center px-8">
          {STORE_NAME}
        </h1>
        <div className="mt-4 flex items-center gap-2 text-gold/90">
          <Loader2 className="size-4 animate-spin" />
          <p className="font-body-lux text-sm">{message}</p>
        </div>

        <div className="mt-8 h-[3px] w-52 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-gold to-transparent animate-[splashBar_1.4s_ease-in-out_infinite]" />
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-10 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" />

      <style>{`
        @keyframes splashBar { 0% { transform: translateX(-100%); } 100% { transform: translateX(320%); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}