import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Phone, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { profileQuery } from "@/lib/queries";
import { normalizePhone } from "@/lib/phone-auth";

/**
 * True when the signed-in user has a profile row but no phone number yet.
 * Phone is DELIVERY CONTACT DATA — collected after Google sign-in, never verified.
 */
export function useNeedsPhone(): { needsPhone: boolean; loading: boolean; profile: unknown } {
  const { userId } = useAuth();
  const { data: profile, isLoading } = useQuery(profileQuery(userId));
  const phone = (profile as { phone?: string | null } | null)?.phone;
  const needsPhone = !!userId && !isLoading && !!profile && !(phone && String(phone).trim());
  return { needsPhone, loading: isLoading, profile };
}

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
  const { userId } = useAuth();
  const { data: profile } = useQuery(profileQuery(userId));
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const p = profile as { full_name?: string | null; phone?: string | null } | null;
      setFullName(p?.full_name ?? "");
      setPhone(p?.phone ?? "");
    }
  }, [open, profile]);

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
 * Soft, dismissible prompt mounted in the authenticated layout: nudges the user
 * to add a phone after login WITHOUT blocking browsing. The hard requirement is
 * enforced separately at checkout.
 */
export function ProfilePhonePrompt() {
  const { needsPhone } = useNeedsPhone();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

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
