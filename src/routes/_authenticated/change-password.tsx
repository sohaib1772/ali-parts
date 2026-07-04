import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/change-password")({
  head: () => ({ meta: [{ title: "تغيير كلمة المرور — Ali Parts" }] }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (password !== confirm) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("تم تحديث كلمة المرور");
      navigate({ to: "/account" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تحديث كلمة المرور");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell title="تغيير كلمة المرور">
      <form onSubmit={submit} className="px-4 pt-4 space-y-4">
        <div className="bg-card border border-border rounded-2xl p-4 shadow-card space-y-4">
          <Field
            placeholder="كلمة المرور الجديدة"
            value={password}
            onChange={setPassword}
          />
          <Field
            placeholder="تأكيد كلمة المرور الجديدة"
            value={confirm}
            onChange={setConfirm}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-gradient-gold text-navy font-bold flex items-center justify-center gap-2 shadow-gold disabled:opacity-60"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
            حفظ كلمة المرور
          </button>
          <p className="text-[11px] text-muted-foreground text-center">
            بعد حفظ كلمة المرور استخدمها في تسجيل الدخول القادم.
          </p>
        </div>
      </form>
    </PageShell>
  );
}

function Field({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 focus-within:border-gold">
      <Lock className="size-4 text-gold" />
      <input
        type="password"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="flex-1 bg-transparent outline-none text-sm"
      />
    </div>
  );
}