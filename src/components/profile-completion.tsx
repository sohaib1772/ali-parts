import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Phone, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { profileQuery } from "@/lib/queries";
import { normalizePhone } from "@/lib/phone-auth";

/**
 * Controlled phone-entry dialog. Saves phone (+ optional name) to profiles.
 * No verification of any kind. `dismissible=false` makes it a hard gate (checkout).
 */
export function ProfileCompletionDialog({
  open,
  onOpenChange,
  onSaved,
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  dismissible?: boolean;
}) {
  const { userId, user } = useAuth();
  const { data: profile } = useQuery(profileQuery(userId));
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const p = profile as { full_name?: string | null; phone?: string | null } | null;
      // Apple sends the name only on the FIRST sign-in; GoTrue puts it in the
      // user's metadata. Pre-fill from the profile, else fall back to the OAuth
      // metadata (Apple/Google) so the name is captured into profiles on save.
      const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
      setFullName(p?.full_name || meta.full_name || meta.name || "");
      setPhone(p?.phone ?? "");
    }
  }, [open, profile, user]);

  if (!open) return null;

  const save = async () => {
    if (saving) return;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      toast.error("رقم الهاتف غير صحيح — مثال: 07XX XXX XXXX");
      return;
    }
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ phone: "+" + normalized, full_name: fullName.trim() || null })
      .eq("id", userId);
    if (error) {
      toast.error("تعذّر الحفظ، حاول مرة أخرى");
      setSaving(false);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("تم حفظ رقمك بنجاح");
    setSaving(false);
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => dismissible && onOpenChange(false)}
    >
      <div
        className="w-full max-w-[420px] rounded-3xl border border-border bg-card text-card-foreground p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <div className="mx-auto mb-3 size-12 rounded-2xl bg-gold/10 grid place-items-center">
            <Phone className="size-6 text-gold" />
          </div>
          <h2 className="text-lg font-extrabold">أكمل بياناتك</h2>
          <p className="text-sm text-muted-foreground mt-1">
            نحتاج رقم هاتفك للتوصيل فقط — لا يوجد تحقق أو رمز.
          </p>
        </div>

        <div className="space-y-3">
          <Field icon={<UserIcon className="size-4" />} placeholder="الاسم الكامل" value={fullName} onChange={setFullName} />
          <Field icon={<Phone className="size-4" />} placeholder="رقم الهاتف (07XX XXX XXXX)" type="tel" value={phone} onChange={setPhone} />
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="mt-5 w-full h-12 rounded-2xl bg-gradient-gold text-navy font-black shadow-gold hover:brightness-105 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          حفظ ومتابعة
        </button>

        {dismissible && (
          <button
            onClick={() => onOpenChange(false)}
            className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground transition"
          >
            لاحقاً — تصفّح المتجر
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Mounted in the authenticated layout. Two jobs:
 *  1) Backfill profiles.full_name from the OAuth metadata. Apple returns the
 *     user's name ONLY on the first-ever sign-in (in user_metadata); persist it
 *     immediately so it's never lost. Also covers Google.
 *  2) Nudge the user to add a phone (dismissible — browsing is never blocked;
 *     the hard requirement is enforced at checkout).
 */
export function ProfilePhonePrompt() {
  const { userId, user } = useAuth();
  const { data: profile, isLoading } = useQuery(profileQuery(userId));
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const p = profile as { full_name?: string | null; phone?: string | null } | null;
  const hasPhone = !!(p?.phone && String(p.phone).trim());
  const needsPhone = !!userId && !isLoading && !!p && !hasPhone;

  // (1) Persist the OAuth display name if the profile doesn't have one yet.
  useEffect(() => {
    if (!userId || !p) return;
    const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
    const metaName = (meta.full_name || meta.name || "").trim();
    if (metaName && !(p.full_name && p.full_name.trim())) {
      void supabase
        .from("profiles")
        .update({ full_name: metaName })
        .eq("id", userId)
        .then(() => qc.invalidateQueries({ queryKey: ["profile"] }));
    }
  }, [userId, profile, user, qc]);

  // (2) Soft, dismissible phone prompt.
  useEffect(() => {
    if (needsPhone && !dismissed) setOpen(true);
  }, [needsPhone, dismissed]);

  if (!needsPhone) return null;
  return (
    <ProfileCompletionDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setDismissed(true);
      }}
      dismissible
    />
  );
}

function Field({
  icon,
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  icon: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 focus-within:border-gold/60 transition">
      <span className="text-gold/80 shrink-0">{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
      />
    </div>
  );
}
