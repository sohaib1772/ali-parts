import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { ArrowRight, Loader2, Phone, Lock, User as UserIcon, Sparkles } from "lucide-react";
import { useSetting } from "@/lib/admin";
import { whatsappLink } from "@/lib/format";

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // Iraqi numbers: accept 07XXXXXXXXX (11 digits) or 7XXXXXXXXX (10) or with 964
  let n = digits;
  if (n.startsWith("00964")) n = n.slice(5);
  else if (n.startsWith("964")) n = n.slice(3);
  else if (n.startsWith("0")) n = n.slice(1);
  if (n.length !== 10 || !n.startsWith("7")) return null;
  return "964" + n;
}

function phoneToEmail(phone: string) {
  return `p${phone}@aliparts.local`;
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — Ali Parts" },
      { name: "description", content: "سجّل الدخول أو أنشئ حسابك في Ali Parts للاستفادة من كل الميزات." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const storeName = useSetting("store_name", "Ali Parts");
  const storeTagline = useSetting("store_tagline", "قطع أصلية · العراق");
  const storeLogo = useSetting("store_logo", "");
  const whatsappNumber = useSetting("whatsapp_number");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const arabicAuthError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    const m = msg.toLowerCase();
    if (m.includes("invalid login") || m.includes("invalid credentials") || m.includes("invalid_credentials"))
      return "رقم الهاتف أو كلمة المرور غير صحيحة";
    if (m.includes("password should be at least") || m.includes("password is too short") || m.includes("weak password") || m.includes("weak_password"))
      return "كلمة المرور قصيرة جداً — يجب أن تكون 6 خانات على الأقل";
    if (m.includes("user already registered") || m.includes("already registered") || m.includes("user_already_exists"))
      return "هذا الحساب مسجّل مسبقاً — سجّل الدخول بدل الإنشاء";
    if (m.includes("email not confirmed"))
      return "الحساب غير مفعّل بعد. تواصل مع الإدارة.";
    if (m.includes("rate limit") || m.includes("too many"))
      return "محاولات كثيرة — انتظر قليلاً وحاول مرة أخرى";
    if (m.includes("network") || m.includes("failed to fetch"))
      return "تعذر الاتصال بالإنترنت — تحقق من الشبكة";
    return "تعذر إتمام العملية، يرجى المحاولة مرة أخرى";
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/account" });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Admin backdoor: allow "aliskoda" username login by legacy admin email
    const raw = phone.trim();
    if (mode === "login" && raw.toLowerCase() === "aliskoda") {
      setLoading(true);
      setProgress("جاري التحقق من بيانات الدخول…");
      try {
        const { error } = await supabase.auth.signInWithPassword({ email: "aliskoda@admin.local", password });
        if (error) throw error;
        setProgress("تم — جاري تحويلك…");
        toast.success("مرحباً بك");
        navigate({ to: "/" });
      } catch (err) {
        toast.error(arabicAuthError(err));
      } finally { setLoading(false); setProgress(null); }
      return;
    }
    const normalized = normalizePhone(raw);
    if (!normalized) {
      toast.error("رقم الهاتف غير صحيح — مثال: 07XX XXX XXXX");
      return;
    }
    const loginEmail = phoneToEmail(normalized);
    setLoading(true);
    setProgress(mode === "signup" ? "جاري إنشاء حسابك…" : "جاري التحقق من بيانات الدخول…");
    try {
      if (mode === "signup") {
        if (password.length < 6) {
          throw new Error("password should be at least 6");
        }
        const { error } = await supabase.auth.signUp({
          email: loginEmail,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: fullName, phone: "+" + normalized } },
        });
        if (error) throw error;
        setProgress("تم إنشاء الحساب — جاري تحويلك…");
        toast.success("تم إنشاء الحساب بنجاح");
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
        if (error) throw error;
        setProgress("تم — جاري تحويلك…");
        toast.success("مرحباً بعودتك");
        navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(arabicAuthError(err));
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setProgress("جاري فتح Google…");
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) { toast.error("تعذّر تسجيل الدخول"); setLoading(false); setProgress(null); return; }
    if (result.redirected) return;
    setProgress("تم — جاري تحويلك…");
    toast.success("مرحباً بك");
    navigate({ to: "/" });
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-[#0f172a] to-[#1e293b] text-white flex flex-col items-center justify-center p-6 selection:bg-gold/30">
      {/* Ambient background glows */}
      <div className="pointer-events-none fixed top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-amber-500/12 blur-[120px]" />
      <div className="pointer-events-none fixed bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-blue-400/8 blur-[120px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.02]" />

      <div className="relative w-full max-w-[420px]">
        {loading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center rounded-[2.5rem] bg-[#0f172a]/70 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-gold/30 bg-[#111827]/90 px-8 py-6 shadow-[0_0_30px_rgba(201,162,39,0.25)]">
              <div className="relative">
                <Loader2 className="size-10 animate-spin text-gold" />
                <div className="absolute inset-0 rounded-full bg-gold/20 blur-xl" />
              </div>
              <p className="font-body-lux text-sm text-white/90 text-center min-w-[180px]">
                {progress ?? "جاري المعالجة…"}
              </p>
              <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-1/2 animate-[progress_1.2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-gold to-transparent" />
              </div>
            </div>
          </div>
        )}
        <Link
          to="/"
          className="absolute -top-14 right-0 inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-gold transition-colors"
        >
          <ArrowRight className="size-3.5" /> العودة للرئيسية
        </Link>

        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-b from-[#1a2332] to-[#111827] p-8 shadow-2xl">
          {/* Top golden shine line */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" />

          {/* Headline */}
          <div className="text-center mb-8">
            <h2 className="font-luxury text-2xl font-semibold mb-2">
              {mode === "login" ? "تسجيل الدخول" : "إنشاء حساب"}
            </h2>
            <p className="font-body-lux text-sm text-white/50">
              {mode === "login" ? "شوفرليت — قطع غيار سيارات مستعمل و جديد" : "شوفرليت — قطع غيار سيارات مستعمل و جديد"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === "signup" && (
              <LuxuryField
                icon={<UserIcon className="size-4" />}
                placeholder="الاسم الكامل"
                value={fullName}
                onChange={setFullName}
              />
            )}
            <LuxuryField
              icon={<Phone className="size-4" />}
              placeholder="رقم الهاتف (07XX XXX XXXX)"
              type="tel"
              required
              value={phone}
              onChange={setPhone}
            />
            <LuxuryField
              icon={<Lock className="size-4" />}
              placeholder="كلمة المرور (أرقام فقط أو أحرف — 6 خانات على الأقل)"
              type="password"
              required
              value={password}
              onChange={setPassword}
            />

            {mode === "login" && (
              <a
                href={whatsappLink(
                  `السلام عليكم، نسيت كلمة المرور لحسابي في المتجر.\nرقم هاتفي: ${phone || "(الرجاء تدوين رقمك)"}\nأرجو المساعدة بإعادة تعيينها.`,
                  whatsappNumber,
                )}
                target="_blank"
                rel="noreferrer"
                className="block text-center text-xs text-gold/90 hover:text-gold font-body-lux -mt-1"
              >
                نسيت كلمة المرور؟ تواصل معنا عبر واتساب
              </a>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-gold to-amber-500 p-px shadow-[0_0_24px_rgba(201,162,39,0.25)] active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <div className="relative flex items-center justify-center gap-2 rounded-[15px] bg-[#0f172a] py-4 transition-colors group-hover:bg-transparent">
                {loading ? <Loader2 className="size-4 animate-spin text-white" /> : <Sparkles className="size-4 text-gold" />}
                <span className="font-body-lux font-bold text-white">
                  {mode === "login" ? "دخول المتجر" : "إنشاء حساب"}
                </span>
              </div>
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1 bg-white/10" />
            <span className="font-body-lux text-[11px] text-white/40 uppercase tracking-widest">أو</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 py-3.5 transition disabled:opacity-50"
          >
            <GoogleG />
            <span className="font-body-lux text-sm font-medium">المتابعة عبر Google</span>
          </button>

          {/* Toggle mode */}
          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="mt-8 w-full text-center text-sm text-white/50 hover:text-gold transition font-body-lux"
          >
            {mode === "login" ? "ليس لديك حساب؟ " : "لديك حساب بالفعل؟ "}
            <span className="text-gold font-bold">{mode === "login" ? "أنشئ حساباً" : "سجّل الدخول"}</span>
          </button>

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

function LuxuryField({ icon, placeholder, type = "text", value, onChange, required }: {
  icon: React.ReactNode; placeholder: string; type?: string; value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <div className="group relative">
      <div className="absolute inset-0 rounded-2xl bg-gold/5 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity" />
      <div className="relative flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0f172a]/50 px-4 py-3.5 focus-within:border-gold/50 focus-within:ring-1 focus-within:ring-gold/20 transition-all">
        <span className="text-gold/80 shrink-0">{icon}</span>
        <input
          type={type}
          placeholder={placeholder}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/30 font-body-lux"
        />
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
