import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ChevronLeft, LogOut, MapPin, Heart, Package, Bell, Info, Shield, ScrollText, MessageCircle, ShieldCheck, Sparkles, Camera, Loader2, Pencil, Check, X, Trash2 } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { profileQuery } from "@/lib/queries";
import { useAdminAccessStatus, usePointsConfig } from "@/lib/admin";
import { formatIQD } from "@/lib/format";
import { uploadAvatar } from "@/lib/avatar";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/account")({
  component: AccountPage,
});

function AccountPage() {
  const { user, userId } = useAuth();
  const { data: profile } = useQuery(profileQuery(userId));
  const { hasAnyAccess, isLoading: adminAccessLoading } = useAdminAccessStatus();
  const pointsCfg = usePointsConfig();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const startEditName = () => {
    setNameDraft(profile?.full_name ?? "");
    setEditingName(true);
  };

  const saveName = async () => {
    if (!userId) return;
    const trimmed = nameDraft.trim();
    if (trimmed.length < 2) { toast.error("الاسم قصير جداً"); return; }
    if (trimmed.length > 60) { toast.error("الاسم طويل جداً"); return; }
    setSavingName(true);
    try {
      const { error } = await supabase.from("profiles").update({ full_name: trimmed }).eq("id", userId);
      if (error) throw error;
      await supabase.auth.updateUser({ data: { full_name: trimmed } });
      qc.invalidateQueries({ queryKey: ["profile", userId] });
      toast.success("تم تحديث الاسم");
      setEditingName(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحديث الاسم");
    } finally {
      setSavingName(false);
    }
  };

  const onPickAvatar = async (file: File) => {
    if (!userId) return;
    if (!file.type.startsWith("image/")) { toast.error("يرجى اختيار صورة"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("الحد الأقصى ٥ ميغابايت"); return; }
    setUploading(true);
    try {
      const url = await uploadAvatar(userId, file);
      const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["profile", userId] });
      toast.success("تم تحديث صورتك");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر رفع الصورة");
    } finally {
      setUploading(false);
    }
  };

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("تم تسجيل الخروج");
    navigate({ to: "/auth", replace: true });
  };

  const CONFIRM_WORD = "حذف";
  const deleteAccount = async () => {
    if (deleteConfirm.trim() !== CONFIRM_WORD) return;
    setDeleting(true);
    try {
      // Remove the uploaded avatar first: storage.objects is protected against
      // direct SQL deletes, so the DB function cannot clear it. Non-fatal.
      const avatarPath = (profile as any)?.avatar_url as string | undefined;
      if (userId && avatarPath && avatarPath.includes("/avatars/")) {
        const key = avatarPath.split("/avatars/")[1]?.split("?")[0];
        if (key) await supabase.storage.from("avatars").remove([key]).catch(() => {});
      }

      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;

      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      toast.success("تم حذف حسابك", { description: "نأسف لرحيلك." });
      navigate({ to: "/auth", replace: true });
    } catch (e: any) {
      // Surface the real reason — never swallow it.
      console.error("[account] delete failed", e);
      toast.error("تعذّر حذف الحساب", {
        description: e?.message ? String(e.message).slice(0, 140) : "يرجى المحاولة مرة أخرى أو التواصل معنا.",
        duration: 7000,
      });
      setDeleting(false);
    }
  };

  const links = [
    ...(hasAnyAccess ? [{ to: "/admin" as const, label: "لوحة الإدارة", icon: ShieldCheck }] : []),
    { to: "/orders", label: "طلباتي السابقة", icon: Package },
    { to: "/favorites", label: "المفضلة", icon: Heart },
    { to: "/addresses", label: "العناوين", icon: MapPin },
    { to: "/notifications", label: "الإشعارات", icon: Bell },
    { to: "/contact", label: "اتصل بنا", icon: MessageCircle },
    { to: "/about", label: "من نحن", icon: Info },
    { to: "/privacy", label: "سياسة الخصوصية", icon: Shield },
    { to: "/terms", label: "الشروط والأحكام", icon: ScrollText },
  ] as const;

  return (
    <PageShell wide title="حسابي">
      <div className="px-4 pt-4 md:max-w-2xl md:mx-auto">
        <div className="bg-gradient-navy text-primary-foreground rounded-3xl p-5 shadow-luxe">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="تغيير الصورة الشخصية"
              className="relative size-16 rounded-full overflow-hidden bg-gradient-gold text-navy font-black text-2xl grid place-items-center shadow-gold group"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <span>{(profile?.full_name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}</span>
              )}
              <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition grid place-items-center">
                {uploading ? <Loader2 className="size-5 text-white animate-spin" /> : <Camera className="size-5 text-white" />}
              </span>
              {uploading && (
                <span className="absolute inset-0 bg-black/50 grid place-items-center">
                  <Loader2 className="size-5 text-white animate-spin" />
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickAvatar(f);
                e.target.value = "";
              }}
            />
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                    maxLength={60}
                    placeholder="اسمك الكامل"
                    className="flex-1 min-w-0 bg-white/10 border border-gold/40 rounded-lg px-2 py-1 text-sm font-bold text-primary-foreground placeholder:text-primary-foreground/50 outline-none focus:border-gold"
                  />
                  <button type="button" onClick={saveName} disabled={savingName} aria-label="حفظ" className="size-7 rounded-lg bg-gold text-navy grid place-items-center disabled:opacity-60">
                    {savingName ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  </button>
                  <button type="button" onClick={() => setEditingName(false)} aria-label="إلغاء" className="size-7 rounded-lg bg-white/10 text-primary-foreground grid place-items-center">
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="font-extrabold text-lg truncate">{profile?.full_name ?? "عميل Ali Parts"}</div>
                  <button type="button" onClick={startEditName} aria-label="تعديل الاسم" className="size-6 rounded-md bg-white/10 hover:bg-white/20 text-gold grid place-items-center shrink-0">
                    <Pencil className="size-3" />
                  </button>
                </div>
              )}
              <div className="text-xs text-gold truncate">{user?.email}</div>
              {profile?.phone && <div className="text-xs text-primary-foreground/70">{profile.phone}</div>}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-gold hover:underline disabled:opacity-60"
              >
                <Camera className="size-3" /> {profile?.avatar_url ? "تغيير الصورة" : "إضافة صورة شخصية"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 bg-gradient-gold text-navy rounded-2xl p-4 shadow-gold flex items-center gap-3">
          <div className="size-11 rounded-full bg-navy/10 grid place-items-center">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold opacity-70">رصيد نقاطك</div>
            <div className="text-2xl font-black leading-tight">
              {(profile as any)?.points_balance ?? 0} نقطة
              <span className="text-xs font-bold opacity-70"> ≈ {formatIQD(Number((profile as any)?.points_balance ?? 0) * pointsCfg.redeemRate)}</span>
            </div>
            <div className="text-[10px] opacity-70">{pointsCfg.cardText}</div>
          </div>
        </div>

        <div className="mt-4 bg-card rounded-2xl border border-border shadow-card overflow-hidden">
          {adminAccessLoading && (
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border text-muted-foreground">
              <div className="size-9 rounded-xl bg-gold/10 text-gold grid place-items-center">
                <Loader2 className="size-4 animate-spin" />
              </div>
              <span className="text-sm font-semibold flex-1">جاري التحقق من صلاحيات الإدارة…</span>
            </div>
          )}
          {links.map((l, i) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`flex items-center gap-3 px-4 py-3.5 hover:bg-muted transition ${i < links.length - 1 ? "border-b border-border" : ""}`}
              >
                <div className="size-9 rounded-xl bg-gold/10 text-gold grid place-items-center">
                  <Icon className="size-4" />
                </div>
                <span className="text-sm font-semibold flex-1">{l.label}</span>
                <ChevronLeft className="size-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>

        <button
          onClick={signOut}
          className="w-full mt-4 h-12 rounded-2xl border border-destructive/40 text-destructive font-bold flex items-center justify-center gap-2 hover:bg-destructive/5 transition"
        >
          <LogOut className="size-4" /> تسجيل الخروج
        </button>

        <button
          onClick={() => { setDeleteConfirm(""); setDeleteOpen(true); }}
          className="w-full mt-3 mb-2 h-11 rounded-2xl text-destructive/80 text-sm font-bold flex items-center justify-center gap-2 hover:bg-destructive/5 transition"
        >
          <Trash2 className="size-4" /> حذف الحساب
        </button>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={(o) => { if (!deleting) setDeleteOpen(o); }}>
        <AlertDialogContent dir="rtl" className="max-w-sm">
          <AlertDialogHeader>
            <div className="size-12 rounded-full bg-destructive/15 grid place-items-center mb-2">
              <Trash2 className="size-6 text-destructive" />
            </div>
            <AlertDialogTitle className="text-base">حذف الحساب نهائياً</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-xs leading-relaxed space-y-2 text-start">
                <p>لا يمكن التراجع عن هذا الإجراء.</p>
                <div>
                  <div className="font-bold text-destructive mb-1">سيتم حذف:</div>
                  <ul className="list-disc ps-5 space-y-0.5">
                    <li>بياناتك الشخصية (الاسم، الهاتف، الصورة)</li>
                    <li>عناوين التوصيل المحفوظة</li>
                    <li>السلة والمفضلة</li>
                    <li>الإشعارات ونقاط الولاء</li>
                  </ul>
                </div>
                <div>
                  <div className="font-bold mb-1">سيتم الاحتفاظ به:</div>
                  <ul className="list-disc ps-5 space-y-0.5">
                    <li>
                      سجلّات طلباتك السابقة تُحفظ للأغراض المحاسبية والقانونية، بعد فصلها عن حسابك
                      (لن تبقى مرتبطة بك).
                    </li>
                  </ul>
                </div>
                <p className="pt-1">
                  للتأكيد، اكتب <strong className="text-destructive">حذف</strong> في الحقل أدناه.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="حذف"
            disabled={deleting}
            className="text-center"
            aria-label="تأكيد الحذف"
          />
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); deleteAccount(); }}
              disabled={deleting || deleteConfirm.trim() !== "حذف"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {deleting ? <><Loader2 className="size-4 animate-spin me-1" /> جاري الحذف…</> : "حذف حسابي نهائياً"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}