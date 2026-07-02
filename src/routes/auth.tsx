import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { ArrowRight, Loader2, Mail, Lock, User as UserIcon } from "lucide-react";

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
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/account" });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: fullName } },
        });
        if (error) throw error;
        toast.success("تم إنشاء الحساب بنجاح");
        navigate({ to: "/" });
      } else {
        const identifier = email.trim();
        const loginEmail = identifier.toLowerCase() === "aliskoda"
          ? "aliskoda@admin.local"
          : identifier;
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
        if (error) throw error;
        toast.success("مرحباً بعودتك");
        navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) { toast.error("تعذّر تسجيل الدخول"); setLoading(false); return; }
    if (result.redirected) return;
    toast.success("مرحباً بك");
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-gradient-hero text-primary-foreground flex flex-col">
      <div className="mx-auto w-full max-w-md px-6 pt-12 pb-6 flex-1 flex flex-col">
        <Link to="/" className="text-xs text-gold/80 mb-6 inline-flex items-center gap-1">
          <ArrowRight className="size-3.5" /> العودة للرئيسية
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="size-14 rounded-2xl bg-gradient-gold grid place-items-center font-black text-navy text-2xl shadow-gold">A</div>
          <div>
            <div className="text-2xl font-black">Ali Parts</div>
            <div className="text-xs text-gold">قطع أصلية · العراق</div>
          </div>
        </div>

        <h1 className="text-3xl font-black mb-2">{mode === "login" ? "أهلاً بعودتك" : "أنشئ حسابك"}</h1>
        <p className="text-primary-foreground/70 text-sm mb-8">
          {mode === "login" ? "سجّل الدخول لمتابعة طلباتك ومفضلتك" : "انضم إلى Ali Parts خلال ثوانٍ"}
        </p>

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full h-12 rounded-2xl bg-white text-navy font-bold flex items-center justify-center gap-3 shadow-luxe hover:brightness-95 transition mb-4 disabled:opacity-50"
        >
          <GoogleG /> المتابعة عبر Google
        </button>

        <div className="flex items-center gap-3 my-2">
          <div className="h-px flex-1 bg-white/20" />
          <span className="text-xs text-primary-foreground/60">أو</span>
          <div className="h-px flex-1 bg-white/20" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          {mode === "signup" && (
            <Field icon={<UserIcon className="size-4" />} placeholder="الاسم الكامل" value={fullName} onChange={setFullName} />
          )}
          <Field icon={<Mail className="size-4" />} placeholder="البريد الإلكتروني" type="email" required value={email} onChange={setEmail} />
          <Field icon={<Lock className="size-4" />} placeholder="كلمة المرور" type="password" required value={password} onChange={setPassword} />

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-2xl bg-gradient-gold text-navy font-bold shadow-gold flex items-center justify-center gap-2 hover:brightness-105 transition disabled:opacity-50"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {mode === "login" ? "تسجيل الدخول" : "إنشاء حساب"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-6 text-sm text-center text-primary-foreground/80 hover:text-gold transition"
        >
          {mode === "login" ? "ليس لديك حساب؟ " : "لديك حساب بالفعل؟ "}
          <span className="text-gold font-bold">{mode === "login" ? "أنشئ حساباً" : "سجّل الدخول"}</span>
        </button>
      </div>
    </div>
  );
}

function Field({ icon, placeholder, type = "text", value, onChange, required }: {
  icon: React.ReactNode; placeholder: string; type?: string; value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 h-12 rounded-2xl bg-white/10 border border-white/15 px-4 focus-within:border-gold transition">
      <span className="text-gold">{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/50"
      />
    </label>
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