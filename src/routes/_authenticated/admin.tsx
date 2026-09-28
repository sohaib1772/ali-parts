import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useStaffPermissions, useAdminAccessStatus, uploadProductImage, uploadMediaFile, extractVideoThumbnail, settingsQuery, useSetting } from "@/lib/admin";
import {
  categoriesQuery,
  brandsQuery,
  bannersQuery,
  carModelsQuery,
  type CarModel,
} from "@/lib/queries";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
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
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Upload, ShieldAlert, Package, Image as ImageIcon, Tags, Settings as SettingsIcon, ClipboardList, Phone, MapPin, User as UserIcon, Copy, StickyNote, Receipt, Search as SearchIcon, Ban, CheckCircle2, History, Users as UsersIcon, KeyRound, Loader2, Repeat, Boxes, ArrowUp, ArrowDown, UserPlus, ShieldCheck, Webhook, Shield, Database, Download, Archive, ArchiveRestore } from "lucide-react";
import { BellRing, Bell, BellOff, Check, MailCheck, MailX, Clock, Megaphone, Sparkles } from "lucide-react";
import { Film, Trash } from "lucide-react";
import { clearVideoCache, getVideoCacheSize } from "@/lib/use-cached-video";
import { Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { runDiagnostics, type DiagnosticsReport, type CheckStatus } from "@/lib/diagnostics.functions";
import { adminUpdateReplacementStatus } from "@/lib/replacement-admin.functions";
import { useServerFn } from "@tanstack/react-start";
import { WhatsappIcon } from "@/components/icons";
import { formatIQD } from "@/lib/format";
import { statusLabel, statusColor } from "@/lib/order-status";
import { PrintableInvoice, InvoicePreviewDialog } from "@/components/printable-invoice";
import { adminListUsers, adminSetUserBlocked, adminSetUserPassword, adminUpdateUserRole, adminDeleteUser, adminClearAllFcmTokens } from "@/lib/admin.functions";
import { adminOtpStatus, requestAdminOtp, verifyAdminOtp } from "@/lib/admin-otp.functions";
import { listAdminOtpEvents } from "@/lib/admin-otp.functions";
import { createStaff, updateStaff, deleteStaff, listStaff } from "@/lib/staff.functions";
import { broadcastPricesChanged } from "@/lib/price-sync";
import { normalizePhone } from "@/lib/phone-auth";
import { getExternalApiConfig, testExternalApi } from "@/lib/external-api.functions";
import { validateExternalApiConfig, type ExternalApiEndpoint } from "@/lib/external-api";
import { isFaststartMp4 } from "@/lib/mp4-faststart";
import { isYouTubeUrl, getYouTubeVideoId, getYouTubeThumbnail, getYouTubeMaxResThumbnail, safeYouTubeThumbnailUrl } from "@/lib/youtube";
import {
  sendAdminBroadcast,
  adminBroadcastAudienceCount,
  BROADCAST_TITLE_MAX,
  BROADCAST_BODY_MAX,
} from "@/lib/broadcast.functions";
import { NotificationLogsAdmin } from "@/components/admin-notification-logs";

function getAdminDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    const KEY = "admin_device_id";
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

const STATUSES = ["received", "preparing", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"] as const;

/* ---------------- Admin OTP Events Log ---------------- */

const OTP_EVENT_LABEL: Record<string, { text: string; tone: "ok" | "warn" | "err" | "info" }> = {
  request: { text: "طلب رمز", tone: "info" },
  request_rate_limited: { text: "طلب متكرر (حد المعدل)", tone: "warn" },
  request_failed: { text: "فشل الإرسال", tone: "err" },
  verify_success: { text: "تحقق ناجح", tone: "ok" },
  verify_wrong_code: { text: "رمز خاطئ", tone: "warn" },
  verify_no_active: { text: "لا يوجد رمز نشط", tone: "warn" },
  verify_expired: { text: "رمز منتهي", tone: "warn" },
  verify_max_attempts: { text: "تجاوز المحاولات", tone: "err" },
  revoke: { text: "إلغاء الجلسة", tone: "info" },
};

function AdminOtpEventsLog() {
  const listFn = useServerFn(listAdminOtpEvents);
  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "otp-events"],
    queryFn: () => listFn({ data: { limit: 200 } }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold">سجل أحداث OTP للإدارة</h3>
          <p className="text-[11px] text-muted-foreground">آخر 200 حدث. يشمل الطلبات، النجاح، الأخطاء، وتجاوز المحاولات.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          <span className="ms-1">تحديث</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground text-sm">جارٍ التحميل…</div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">لا توجد أحداث بعد.</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r: any) => {
            const label = OTP_EVENT_LABEL[r.event] ?? { text: r.event, tone: "info" as const };
            const toneCls =
              label.tone === "ok"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                : label.tone === "warn"
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                : label.tone === "err"
                ? "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30"
                : "bg-muted text-foreground/80 border-border";
            return (
              <div key={r.id} className="rounded-lg border p-2.5 text-xs bg-card">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${toneCls}`}>
                    {label.text}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
                    {new Date(r.created_at).toLocaleString("ar-IQ")}
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                  <div dir="ltr" className="truncate">user: {r.user_id ? r.user_id.slice(0, 8) : "—"}</div>
                  <div dir="ltr" className="truncate">device: {r.device_id ? r.device_id.slice(0, 10) : "—"}</div>
                  {r.detail && <div className="col-span-full truncate" dir="auto">تفاصيل: {r.detail}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Block Log ---------------- */

function BlockLogAdmin() {
  // placeholder anchor
  const qc = useQueryClient();
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "block" | "unblock">("all");
  const [search, setSearch] = useState("");

  const { data: blocked = [], isLoading: loadingBlocked } = useQuery({
    queryKey: ["admin", "blocked-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .eq("is_blocked", true)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const unblock = async (uid: string) => {
    if (unblockingId) return;
    setUnblockingId(uid);
    try {
      await adminSetUserBlocked({ data: { user_id: uid, blocked: false } });
      toast.success("تم رفع الحظر");
      qc.invalidateQueries({ queryKey: ["admin", "blocked-users"] });
      qc.invalidateQueries({ queryKey: ["admin", "block-log"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر رفع الحظر");
    } finally {
      setUnblockingId(null);
    }
  };

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["admin", "block-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_block_log")
        .select("id, user_id, actor_id, action, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const ids = Array.from(new Set(entries.flatMap((e: any) => [e.user_id, e.actor_id]).filter(Boolean)));
  const { data: profiles = [] } = useQuery({
    queryKey: ["admin", "block-log-profiles", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, phone").in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });
  const nameMap = new Map((profiles as any[]).map((p) => [p.id, p]));

  // Notification delivery status for each block/unblock action
  const userIds = Array.from(new Set(entries.map((e: any) => e.user_id).filter(Boolean)));
  const { data: notifs = [] } = useQuery({
    queryKey: ["admin", "block-log-notifs", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, user_id, title, read_at, created_at")
        .eq("type", "account_status")
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  // Match each log entry with the closest notification for that user within ±10s
  const matchNotif = (uid: string, iso: string) => {
    const t = new Date(iso).getTime();
    let best: any = null;
    let bestDiff = Infinity;
    for (const n of notifs as any[]) {
      if (n.user_id !== uid) continue;
      const diff = Math.abs(new Date(n.created_at).getTime() - t);
      if (diff < bestDiff && diff <= 10_000) { bestDiff = diff; best = n; }
    }
    return best;
  };

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-GB", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
    } catch { return iso; }
  };
  const fmtRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.round(diff / 1000);
    if (s < 60) return "قبل ثوانٍ";
    const m = Math.round(s / 60);
    if (m < 60) return `قبل ${m} دقيقة`;
    const h = Math.round(m / 60);
    if (h < 24) return `قبل ${h} ساعة`;
    const d = Math.round(h / 24);
    if (d < 30) return `قبل ${d} يوم`;
    const mo = Math.round(d / 30);
    if (mo < 12) return `قبل ${mo} شهر`;
    return `قبل ${Math.round(mo / 12)} سنة`;
  };
  const nameOf = (id: string | null) => {
    if (!id) return "—";
    const p: any = nameMap.get(id);
    return p?.full_name || p?.phone || id.slice(0, 8);
  };

  const filtered = (entries as any[]).filter((e) => {
    if (filter !== "all" && e.action !== filter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const targetName = String(nameOf(e.user_id)).toLowerCase();
      const actorName = String(nameOf(e.actor_id)).toLowerCase();
      if (!targetName.includes(q) && !actorName.includes(q)) return false;
    }
    return true;
  });
  const blockCount = (entries as any[]).filter((e) => e.action === "block").length;
  const unblockCount = (entries as any[]).filter((e) => e.action === "unblock").length;

  return (
    <div className="space-y-4">
      {/* Currently blocked users */}
      <div className="space-y-2">
        <div className="text-sm font-extrabold flex items-center gap-2">
          <Ban className="size-4 text-destructive" /> المحظورون حاليًا
          {blocked.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({blocked.length})</span>
          )}
        </div>
        {loadingBlocked ? (
          <div className="text-center text-xs text-muted-foreground py-4">جاري التحميل…</div>
        ) : blocked.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-4 bg-muted/40 rounded-2xl">
            لا يوجد مستخدمون محظورون
          </div>
        ) : (
          <div className="space-y-2">
            {blocked.map((u: any) => (
              <div key={u.id} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
                <div className="size-9 rounded-full bg-destructive/10 text-destructive grid place-items-center shrink-0">
                  <Ban className="size-4" />
                </div>
                <div className="flex-1 min-w-0 text-sm">
                  <div className="font-bold truncate">{u.full_name || u.phone || u.id.slice(0, 8)}</div>
                  {u.phone && <div className="text-xs text-muted-foreground truncate">{u.phone}</div>}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => unblock(u.id)}
                  disabled={unblockingId === u.id}
                  className="gap-1"
                >
                  {unblockingId === u.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3.5" />
                  )}
                  رفع الحظر
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-sm font-extrabold flex items-center gap-2 pt-2">
        <History className="size-4" /> سجل التدقيق
        <span className="text-xs font-normal text-muted-foreground">
          ({entries.length})
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-xl border border-border bg-muted/40 p-0.5 text-[11px] font-semibold">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${filter === "all" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          >الكل ({entries.length})</button>
          <button
            onClick={() => setFilter("block")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${filter === "block" ? "bg-destructive/10 text-destructive" : "text-muted-foreground"}`}
          >حظر ({blockCount})</button>
          <button
            onClick={() => setFilter("unblock")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${filter === "unblock" ? "bg-success/10 text-success" : "text-muted-foreground"}`}
          >رفع حظر ({unblockCount})</button>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث باسم الزبون أو المشرف…"
          className="h-9 text-xs flex-1 min-w-[160px]"
        />
      </div>

      {isLoading ? (
        <div className="text-center text-sm text-muted-foreground py-8">جاري التحميل…</div>
      ) : !entries.length ? (
        <div className="text-center text-sm text-muted-foreground py-8">لا توجد سجلات بعد</div>
      ) : !filtered.length ? (
        <div className="text-center text-sm text-muted-foreground py-8">لا نتائج مطابقة للتصفية</div>
      ) : (
        <div className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
      {filtered.map((e: any) => {
        const isBlock = e.action === "block";
        const n = matchNotif(e.user_id, e.created_at);
        const delivery = !n
          ? { icon: <MailX className="size-3" />, label: "لم يُرسل الإشعار", cls: "bg-destructive/10 text-destructive" }
          : n.read_at
          ? { icon: <MailCheck className="size-3" />, label: `تم الاستلام • ${fmt(n.read_at)}`, cls: "bg-success/10 text-success" }
          : { icon: <Clock className="size-3" />, label: "أُرسل — لم يُقرأ بعد", cls: "bg-muted text-muted-foreground" };
        return (
          <div key={e.id} className="bg-card border border-border rounded-2xl p-3 flex items-start gap-3">
            <div className={`size-9 rounded-full grid place-items-center shrink-0 ${isBlock ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
              {isBlock ? <Ban className="size-4" /> : <CheckCircle2 className="size-4" />}
            </div>
            <div className="flex-1 min-w-0 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold">
                  {isBlock ? "حظر زبون" : "رفع الحظر عن زبون"}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isBlock ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
                  {isBlock ? "BLOCK" : "UNBLOCK"}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                الزبون: <span className="font-semibold text-foreground">{nameOf(e.user_id)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                بواسطة: <span className="font-semibold text-foreground">{nameOf(e.actor_id)}</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5" dir="ltr">
                <Clock className="size-3" />
                <span className="font-mono">{fmt(e.created_at)}</span>
                <span className="text-muted-foreground/70">• {fmtRelative(e.created_at)}</span>
              </div>
              <div className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${delivery.cls}`}>
                {delivery.icon}
                <span>{delivery.label}</span>
              </div>
            </div>
          </div>
        );
      })}
        </div>
      )}
    </div>
  );
}

/**
 * Staff management is HIDDEN, not deleted.
 *
 * createStaff() provisions a phone+password account (p<phone>@aliparts.app),
 * but sign-in is Google/Apple only — there is no password login UI anywhere in
 * the app. Any staff member created this way therefore CANNOT SIGN IN, and
 * nothing warned the admin about it. Hiding the tab prevents creating those
 * dead accounts.
 *
 * Nothing is removed: StaffAdmin, staff.functions.ts, the staff_permissions
 * table, existing staff rows and all `staff_can()` permission checks are
 * untouched — staff who already exist keep working exactly as before.
 *
 * TO RE-ENABLE: set this to true. Only do that once staff can actually sign
 * in — i.e. after either adding an email/password login path or moving staff
 * onto Google/Apple accounts.
 */
const STAFF_TAB_ENABLED = false;

/**
 * Banner video cap. Raised to 50MB now that playback is fully deferred
 * (preload="none" → 0 bytes on home load) and progressive-streaming (faststart
 * MP4 + HTTP range requests), so a customer only downloads what they actually
 * watch after tapping — never on page load.
 */
const MAX_BANNER_VIDEO_BYTES = 50 * 1024 * 1024;

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminOtpGate({ email, onVerified }: { email: string; onVerified: () => void }) {
  const requestFn = useServerFn(requestAdminOtp);
  const verifyFn = useServerFn(verifyAdminOtp);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [remember, setRemember] = useState(false);

  const send = async () => {
    if (sending || cooldown > 0) return;
    setSending(true);
    try {
      await requestFn();
      setSent(true);
      setCooldown(30);
      toast.success("تم إرسال رمز التحقق إلى بريد الإدارة");
      const t = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) { clearInterval(t); return 0; }
          return c - 1;
        });
      }, 1000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الإرسال");
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    if (verifying) return;
    if (!/^\d{6}$/.test(code)) {
      toast.error("أدخل رمزاً مكوّناً من 6 أرقام");
      return;
    }
    setVerifying(true);
    try {
      await verifyFn({ data: { code, remember, device_id: getAdminDeviceId() } });
      toast.success("تم التحقق بنجاح");
      onVerified();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "رمز غير صحيح");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="px-4 pt-8 pb-10 max-w-md mx-auto">
      <div className="rounded-3xl border border-border bg-card p-6 flex flex-col items-center text-center gap-4">
        <div className="size-16 rounded-full bg-primary/10 grid place-items-center">
          <ShieldCheck className="size-8 text-primary" />
        </div>
        <div>
          <div className="text-lg font-extrabold">تحقق دخول الإدارة</div>
          <p className="text-sm text-muted-foreground mt-1">
            لحماية اللوحة، نرسل رمزاً مكوناً من 6 أرقام إلى بريد الإدارة{email ? ` (${email})` : ""}.
          </p>
        </div>
        {!sent ? (
          <Button className="w-full" onClick={send} disabled={sending}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <MailCheck className="size-4" />}
            إرسال رمز التحقق
          </Button>
        ) : (
          <>
            <Input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="——————"
              className="text-center text-2xl tracking-[0.5em] font-bold h-14"
              dir="ltr"
            />
            <Button className="w-full" onClick={verify} disabled={verifying || code.length !== 6}>
              {verifying ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              تأكيد الدخول
            </Button>
            <label className="flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="size-4 accent-primary"
              />
              تذكّر هذا الجهاز لمدة 30 يوم
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={send}
              disabled={sending || cooldown > 0}
              className="text-xs"
            >
              {cooldown > 0 ? `إعادة الإرسال بعد ${cooldown}s` : "إعادة إرسال الرمز"}
            </Button>
          </>
        )}
        <p className="text-[11px] text-muted-foreground">
          الرمز صالح لمدة 10 دقائق. جلسة التحقق تدوم 10 دقائق، أو 30 يوم عند اختيار "تذكّر هذا الجهاز".
        </p>
      </div>
    </div>
  );
}

function AdminPage() {

  return <AdminPageInner />;
}

function PermissionsBadge({ isAdmin, canOrders, canProducts, canReplacements, canBlock }: {
  isAdmin: boolean; canOrders: boolean; canProducts: boolean; canReplacements: boolean; canBlock: boolean;
}) {
  const [open, setOpen] = useState(false);
  const perms: Array<{ key: string; label: string; on: boolean; cls: string }> = [
    { key: "admin", label: "مدير", on: isAdmin, cls: "bg-primary/10 text-primary border-primary/30" },
    { key: "orders", label: "الطلبات (can_orders)", on: canOrders, cls: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
    { key: "products", label: "المنتجات (can_products)", on: canProducts, cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
    { key: "replacements", label: "الاستبدال (can_replacements)", on: canReplacements, cls: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
    { key: "block", label: "حظر المستخدمين (can_block)", on: canBlock, cls: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
  ];
  const activeCount = perms.filter((p) => p.on).length;
  return (
    <div className="mb-3 rounded-2xl border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-bold"
      >
        <ShieldCheck className="size-4 text-primary" />
        <span>صلاحياتي</span>
        <span className="text-[11px] font-normal text-muted-foreground">({activeCount} مُفعّلة)</span>
        <span className="ms-auto text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
          {perms.map((p) => (
            <span
              key={p.key}
              className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-1 border ${
                p.on ? p.cls : "bg-muted/40 text-muted-foreground border-border"
              }`}
            >
              {p.on ? <CheckCircle2 className="size-3" /> : <Ban className="size-3" />}
              {p.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminPageInner() {
  const { isAdmin, canOrders, canProducts, canReplacements, canBlock, hasAnyAccess, isLoading, isError } = useAdminAccessStatus();
  const navigate = useNavigate();
  const otpStatusFn = useServerFn(adminOtpStatus);
  const { data: otp, isLoading: otpLoading, refetch: refetchOtp } = useQuery({
    queryKey: ["admin-otp-status"],
    queryFn: () => otpStatusFn({ data: { device_id: getAdminDeviceId() } }),
    enabled: hasAnyAccess && !isLoading,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <PageShell wide title="لوحة الإدارة">
        <div className="px-4 pt-16 flex flex-col items-center text-center gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">جاري التحقق من الصلاحيات…</p>
        </div>
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell wide title="لوحة الإدارة">
        <div className="px-4 pt-10 flex flex-col items-center text-center gap-3" role="alert">
          <div className="size-16 rounded-full bg-amber-500/10 grid place-items-center">
            <ShieldAlert className="size-8 text-amber-600" />
          </div>
          <div className="font-extrabold text-lg">تعذر التحقق من الصلاحيات</div>
          <p className="text-sm text-muted-foreground">
            حدث خلل في الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.
          </p>
          <Button onClick={() => window.location.reload()}>إعادة المحاولة</Button>
        </div>
      </PageShell>
    );
  }

  if (!hasAnyAccess) {
    return (
      <PageShell wide title="لوحة الإدارة">
        <div className="px-4 pt-10 flex flex-col items-center text-center gap-3">
          <div className="size-16 rounded-full bg-destructive/10 grid place-items-center">
            <ShieldAlert className="size-8 text-destructive" />
          </div>
          <div className="font-extrabold text-lg">ليس لديك صلاحية</div>
          <p className="text-sm text-muted-foreground">هذه اللوحة مخصصة للمدراء فقط.</p>
          <Button onClick={() => navigate({ to: "/" })}>العودة للرئيسية</Button>
        </div>
      </PageShell>
    );
  }

  if (otpLoading || !otp) {
    return (
      <PageShell wide title="لوحة الإدارة">
        <div className="px-4 pt-16 flex flex-col items-center text-center gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">جاري التحقق…</p>
        </div>
      </PageShell>
    );
  }

  if (otp.required && !otp.verified) {
    return (
      <PageShell wide title="تحقق ثنائي">
        <AdminOtpGate email={otp.email ?? ""} onVerified={() => refetchOtp()} />
      </PageShell>
    );
  }

  const defaultTab = isAdmin
    ? "products"
    : canOrders
      ? "orders"
      : canProducts
        ? "products"
        : canReplacements
          ? "replacements"
          : "block-log";

  const initialTab =
    (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab")) ||
    defaultTab;

  // Tab triggers: phone = icon-over-tiny-text chip (unchanged); md+ = full-width
  // sidebar row (icon + label side by side). Content fills the widened panel.
  const tabTriggerCls =
    "flex-col gap-1 py-2 text-[10px] md:flex-row md:justify-start md:gap-2 md:text-sm md:py-2.5 md:px-3 md:w-full";
  const tabContentCls = "mt-4 md:mt-0 md:flex-1 md:min-w-0";

  return (
    <PageShell wide title="لوحة الإدارة">
      <div className="px-4 pt-3 pb-6">
        <PermissionsBadge
          isAdmin={isAdmin}
          canOrders={canOrders}
          canProducts={canProducts}
          canReplacements={canReplacements}
          canBlock={canBlock}
        />
        <Tabs
          defaultValue={initialTab}
          onValueChange={(val) => {
            if (typeof window !== "undefined") {
              const url = new URL(window.location.href);
              url.searchParams.set("tab", val);
              window.history.replaceState({}, "", url.toString());
            }
          }}
          className="md:flex md:flex-row md:gap-4 md:items-start"
        >
          <TabsList className="w-full grid grid-cols-4 h-auto gap-1 md:flex md:flex-col md:w-52 md:shrink-0 md:items-stretch md:gap-1 md:sticky md:top-4 md:self-start">
            {canProducts && (
              <TabsTrigger value="products" className={tabTriggerCls}><Package className="size-4" />منتجات</TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="banners" className={tabTriggerCls}><ImageIcon className="size-4" />عروض</TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="taxonomy" className={tabTriggerCls}><Tags className="size-4" />تصنيفات</TabsTrigger>
            )}
            {canOrders && (
              <TabsTrigger value="orders" className={tabTriggerCls}><ClipboardList className="size-4" />طلبات</TabsTrigger>
            )}
            {canReplacements && (
              <TabsTrigger value="replacements" className={tabTriggerCls}><Repeat className="size-4" />استبدال</TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="users" className={tabTriggerCls}><UsersIcon className="size-4" />مستخدمون</TabsTrigger>
            )}
            {STAFF_TAB_ENABLED && isAdmin && (
              <TabsTrigger value="staff" className={tabTriggerCls}><ShieldCheck className="size-4" />موظفون</TabsTrigger>
            )}
            {canBlock && (
              <TabsTrigger value="block-log" className={tabTriggerCls}><History className="size-4" />سجل الحظر</TabsTrigger>
            )}
            {canProducts && (
              <TabsTrigger value="stock" className={tabTriggerCls}><Boxes className="size-4" />سجل المخزون</TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="broadcast" className={tabTriggerCls}><Megaphone className="size-4" />إشعار جماعي</TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="notification-logs" className={tabTriggerCls}><BellRing className="size-4" />logs الإشعارات</TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="settings" className={tabTriggerCls}><SettingsIcon className="size-4" />إعدادات</TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="diagnostics" className={tabTriggerCls}><Activity className="size-4" />تشخيص</TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="otp-log" className={tabTriggerCls}><KeyRound className="size-4" />سجل OTP</TabsTrigger>
            )}
          </TabsList>

          {canProducts && <TabsContent value="products" className={tabContentCls}><ProductsAdmin /></TabsContent>}
          {isAdmin && <TabsContent value="banners" className={tabContentCls}><BannersAdmin /></TabsContent>}
          {isAdmin && <TabsContent value="taxonomy" className={tabContentCls}><TaxonomyAdmin /></TabsContent>}
          {canOrders && <TabsContent value="orders" className={tabContentCls}><OrdersAdmin /></TabsContent>}
          {canReplacements && <TabsContent value="replacements" className={tabContentCls}><ReplacementsAdmin /></TabsContent>}
          {isAdmin && <TabsContent value="users" className={tabContentCls}><UsersAdmin /></TabsContent>}
          {STAFF_TAB_ENABLED && isAdmin && <TabsContent value="staff" className={tabContentCls}><StaffAdmin /></TabsContent>}
          {canBlock && <TabsContent value="block-log" className={tabContentCls}><BlockLogAdmin /></TabsContent>}
          {canProducts && <TabsContent value="stock" className={tabContentCls}><StockMovementsAdmin /></TabsContent>}
          {isAdmin && <TabsContent value="broadcast" className={tabContentCls}><BroadcastAdmin /></TabsContent>}
          {isAdmin && <TabsContent value="notification-logs" className={tabContentCls}><NotificationLogsAdmin /></TabsContent>}
          {isAdmin && <TabsContent value="settings" className={tabContentCls}><SettingsAdmin /></TabsContent>}
          {isAdmin && <TabsContent value="diagnostics" className={tabContentCls}><DiagnosticsAdmin /></TabsContent>}
          {isAdmin && <TabsContent value="otp-log" className={tabContentCls}><AdminOtpEventsLog /></TabsContent>}
        </Tabs>
      </div>
    </PageShell>
  );
}

/* ---------------- Users ---------------- */

function UsersAdmin() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "staff" | "user">("all");

  // Password Dialog
  const [pwOpen, setPwOpen] = useState(false);
  const [pwUser, setPwUser] = useState<{ id: string; label: string } | null>(null);
  const [pw, setPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  // Role Dialog
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleUser, setRoleUser] = useState<any | null>(null);
  const [roleType, setRoleType] = useState<"admin" | "staff" | "user">("user");
  const [staffPerms, setStaffPerms] = useState({
    can_orders: false,
    can_products: false,
    can_replacements: false,
    can_block: false,
  });
  const [savingRole, setSavingRole] = useState(false);

  // Delete User Dialog
  const [deleteUser, setDeleteUser] = useState<any | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading, refetch, isFetching, error: queryError } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      // Attempt 1: serverFn (works on web/desktop where cookies flow through)
      let serverErr: string | null = null;
      try {
        const res = await adminListUsers();
        if (res && Array.isArray(res.users) && res.users.length > 0) return res;
        // Server returned empty — might be auth issue on native, continue to fallback
        serverErr = "Server returned 0 users";
      } catch (err: any) {
        serverErr = err?.message ?? String(err);
        console.warn("[UsersAdmin] adminListUsers serverFn failed:", serverErr);
      }

      // Attempt 2: Direct client-side Supabase query using the logged-in admin session
      let clientErr: string | null = null;
      try {
        const { data: profs, error: profErr } = await supabase
          .from("profiles")
          .select("id, full_name, phone, is_blocked, created_at, points_balance")
          .order("created_at", { ascending: false });

        if (profErr) {
          clientErr = profErr.message;
          console.error("[UsersAdmin] direct profiles fetch error:", profErr);
        } else if (profs && profs.length > 0) {
          const ids = profs.map((p: any) => p.id);
          const [{ data: roles }, { data: staff }, { data: devTokens }] = await Promise.all([
            supabase.from("user_roles").select("user_id, role").in("user_id", ids),
            supabase.from("staff_permissions").select("user_id, can_orders, can_products, can_replacements, can_block").in("user_id", ids),
            supabase.from("device_tokens").select("user_id, token, platform, last_seen").in("user_id", ids).order("last_seen", { ascending: false }),
          ]);
          const roleSet = new Set((roles ?? []).filter((r: any) => r.role === "admin").map((r: any) => r.user_id));
          const staffMap = new Map((staff ?? []).map((s: any) => [s.user_id, s]));
          const tokenMap = new Map<string, Array<{ token: string; platform: string; last_seen: string }>>();
          for (const t of devTokens ?? []) {
            const list = tokenMap.get(t.user_id) ?? [];
            list.push({ token: t.token, platform: t.platform ?? "android", last_seen: t.last_seen });
            tokenMap.set(t.user_id, list);
          }

          const mapped = profs.map((p: any) => {
            const isAdmin = roleSet.has(p.id);
            const s: any = staffMap.get(p.id);
            const isStaff = !isAdmin && !!s && (s.can_orders || s.can_products || s.can_replacements || s.can_block);
            const userTokens = tokenMap.get(p.id) ?? [];
            return {
              id: p.id,
              email: null,
              phone: p.phone ?? null,
              profile_phone: p.phone ?? null,
              full_name: p.full_name ?? null,
              is_blocked: p.is_blocked ?? false,
              created_at: p.created_at ?? null,
              last_sign_in_at: p.created_at ?? null,
              is_active: false,
              is_admin: isAdmin,
              is_staff: isStaff,
              staff_permissions: s ?? null,
              device_tokens: userTokens,
              fcm_token: userTokens[0]?.token ?? null,
              device_platform: userTokens[0]?.platform ?? null,
            };
          });
          return { total: mapped.length, active: 0, users: mapped };
        } else {
          clientErr = "profiles query returned empty";
        }
      } catch (err: any) {
        clientErr = err?.message ?? String(err);
        console.error("[UsersAdmin] direct profiles fetch threw:", clientErr);
      }

      // Attempt 3: Try with auth.getUser() to verify we have a valid session
      try {
        const { data: sessionData } = await supabase.auth.getUser();
        if (!sessionData?.user) {
          throw new Error(`لم يتم التعرف على جلسة المستخدم. الرجاء تسجيل الخروج وإعادة الدخول. (server: ${serverErr}, client: ${clientErr})`);
        }
      } catch {
        // ignore session check error
      }

      // All attempts failed — throw a descriptive error
      throw new Error(
        `تعذر جلب المستخدمين.\n` +
        `السيرفر: ${serverErr ?? "لم يُحاول"}\n` +
        `قاعدة البيانات: ${clientErr ?? "لم يُحاول"}\n` +
        `الرجاء التأكد من صلاحيات الأدمن أو تسجيل الخروج وإعادة الدخول.`
      );
    },
    refetchInterval: 30_000,
    retry: 2,
    retryDelay: 1000,
  });

  const users = data?.users ?? [];

  const filtered = (() => {
    let list = users;
    if (roleFilter === "admin") {
      list = list.filter((u: any) => u.is_admin);
    } else if (roleFilter === "staff") {
      list = list.filter((u: any) => u.is_staff);
    } else if (roleFilter === "user") {
      list = list.filter((u: any) => !u.is_admin && !u.is_staff);
    }

    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter((u: any) =>
      [u.full_name, u.email, u.phone, u.profile_phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  })();

  const adminCount = users.filter((u: any) => u.is_admin).length;
  const staffCount = users.filter((u: any) => u.is_staff).length;
  const regularCount = users.filter((u: any) => !u.is_admin && !u.is_staff).length;

  const fmt = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("ar-IQ", { dateStyle: "short", timeStyle: "short" });
    } catch { return iso; }
  };

  const openPw = (u: any) => {
    setPwUser({ id: u.id, label: u.full_name || u.profile_phone || u.phone || u.email || u.id.slice(0, 8) });
    setPw("");
    setPwOpen(true);
  };

  const submitPw = async () => {
    if (!pwUser) return;
    if (pw.length < 6) { toast.error("كلمة السر يجب أن تكون 6 أحرف على الأقل"); return; }
    setSavingPw(true);
    try {
      await adminSetUserPassword({ data: { user_id: pwUser.id, password: pw } });
      toast.success("تم تحديث كلمة السر");
      setPwOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر التحديث");
    } finally {
      setSavingPw(false);
    }
  };

  const openRole = (u: any) => {
    setRoleUser(u);
    if (u.is_admin) {
      setRoleType("admin");
      setStaffPerms({ can_orders: false, can_products: false, can_replacements: false, can_block: false });
    } else if (u.is_staff) {
      setRoleType("staff");
      setStaffPerms({
        can_orders: !!u.staff_permissions?.can_orders,
        can_products: !!u.staff_permissions?.can_products,
        can_replacements: !!u.staff_permissions?.can_replacements,
        can_block: !!u.staff_permissions?.can_block,
      });
    } else {
      setRoleType("user");
      setStaffPerms({ can_orders: false, can_products: false, can_replacements: false, can_block: false });
    }
    setRoleOpen(true);
  };

  const submitRole = async () => {
    if (!roleUser) return;
    if (roleType === "staff" && !staffPerms.can_orders && !staffPerms.can_products && !staffPerms.can_replacements && !staffPerms.can_block) {
      toast.error("يرجى اختيار صلاحية واحدة على الأقل للموظف");
      return;
    }
    setSavingRole(true);
    try {
      await adminUpdateUserRole({
        data: {
          user_id: roleUser.id,
          role_type: roleType,
          staff_permissions: roleType === "staff" ? staffPerms : undefined,
        },
      });
      toast.success("تم تحديث صلاحيات ورتبة المستخدم بنجاح");
      setRoleOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["staff", "list"] });
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر تحديث الصلاحيات");
    } finally {
      setSavingRole(false);
    }
  };

  const openDelete = (u: any) => {
    setDeleteUser(u);
    setDeleteConfirm("");
  };

  const submitDelete = async () => {
    if (!deleteUser) return;
    if (deleteConfirm.trim() !== "حذف") {
      toast.error("يرجى كتابة كلمة 'حذف' للتأكيد");
      return;
    }
    setDeleting(true);
    try {
      await adminDeleteUser({ data: { user_id: deleteUser.id } });
      toast.success("تم حذف حساب المستخدم نهائياً");
      setDeleteUser(null);
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "blocked-users"] });
      qc.invalidateQueries({ queryKey: ["staff", "list"] });
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر حذف الحساب");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-gradient-navy text-primary-foreground rounded-2xl p-3.5 shadow-luxe">
          <div className="text-[11px] text-gold font-bold">إجمالي المستخدمين</div>
          <div className="text-2xl sm:text-3xl font-black leading-tight mt-0.5">{data?.total ?? "—"}</div>
        </div>
        <div className="bg-gradient-gold text-navy rounded-2xl p-3.5 shadow-gold">
          <div className="text-[11px] font-bold opacity-70">متصلون الآن</div>
          <div className="text-2xl sm:text-3xl font-black leading-tight mt-0.5 flex items-center gap-2">
            {data?.active ?? "—"}
            <span className="size-2.5 rounded-full bg-success animate-pulse" />
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-3.5">
          <div className="text-[11px] text-muted-foreground font-bold">المدراء</div>
          <div className="text-2xl sm:text-3xl font-black leading-tight mt-0.5 text-primary">{adminCount}</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-3.5">
          <div className="text-[11px] text-muted-foreground font-bold">الموظفون</div>
          <div className="text-2xl sm:text-3xl font-black leading-tight mt-0.5 text-blue-600">{staffCount}</div>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setRoleFilter("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              roleFilter === "all"
                ? "bg-navy text-primary-foreground shadow-sm"
                : "bg-card border border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            الكل ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter("admin")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              roleFilter === "admin"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-card border border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            المدراء ({adminCount})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter("staff")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              roleFilter === "staff"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-card border border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            الموظفون ({staffCount})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter("user")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              roleFilter === "user"
                ? "bg-muted text-foreground font-extrabold shadow-sm border border-border"
                : "bg-card border border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            الزبائن ({regularCount})
          </button>
        </div>

        <label className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 focus-within:border-gold">
          <SearchIcon className="size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو الهاتف أو الإيميل…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <button
            onClick={() => refetch()}
            className="text-xs text-gold font-bold px-2 disabled:opacity-50"
            disabled={isFetching}
          >
            {isFetching ? "..." : "تحديث"}
          </button>
        </label>
      </div>

      {/* Users List */}
      {isLoading ? (
        <div className="text-center text-sm text-muted-foreground py-8">جاري التحميل…</div>
      ) : queryError ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 space-y-2">
          <div className="text-sm font-bold text-destructive">⚠️ خطأ في جلب المستخدمين</div>
          <div className="text-xs text-destructive/80 whitespace-pre-wrap" dir="ltr">{(queryError as Error).message}</div>
          <button
            onClick={() => refetch()}
            className="text-xs bg-destructive text-white rounded-lg px-3 py-1.5 font-bold mt-1"
            disabled={isFetching}
          >
            {isFetching ? "جاري المحاولة…" : "إعادة المحاولة"}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8 bg-card border border-border rounded-2xl">
          لا يوجد مستخدمون مطابقون
        </div>
      ) : (
        <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
          {filtered.map((u: any) => {
            const displayPhone = u.profile_phone || u.phone;
            return (
              <div key={u.id} className="bg-card border border-border rounded-2xl p-3.5 flex flex-col justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`size-11 rounded-full grid place-items-center font-black text-lg shrink-0 ${u.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                    {(u.full_name?.[0] ?? u.email?.[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 text-sm">
                    <div className="font-bold truncate flex items-center gap-1.5 flex-wrap">
                      <span className="truncate">{u.full_name || "بلا اسم"}</span>
                      {u.is_blocked && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">
                          <Ban className="size-3" /> محظور
                        </span>
                      )}
                      {u.is_active && (
                        <span className="text-[9px] font-black text-success bg-success/10 px-1.5 py-0.5 rounded-full">
                          متصل
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5" dir="ltr">
                      {displayPhone ? `+${String(displayPhone).replace(/\D/g, "")}` : (u.email ?? "—")}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      آخر دخول: {fmt(u.last_sign_in_at)}
                    </div>

                    {/* Role / Permission Badges */}
                    <div className="mt-2 flex items-center gap-1 flex-wrap">
                      {u.is_admin ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-primary/10 text-primary border border-primary/30">
                          <Shield className="size-3" /> مدير كامل الصلاحيات
                        </span>
                      ) : u.is_staff ? (
                        <>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-blue-500/10 text-blue-600 border border-blue-500/30">
                            <ShieldCheck className="size-3" /> موظف
                          </span>
                          {u.staff_permissions?.can_orders && (
                            <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-md">طلبات</span>
                          )}
                          {u.staff_permissions?.can_products && (
                            <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-md">منتجات</span>
                          )}
                          {u.staff_permissions?.can_replacements && (
                            <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-md">استبدال</span>
                          )}
                          {u.staff_permissions?.can_block && (
                            <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-md">حظر</span>
                          )}
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 bg-muted/60 text-muted-foreground border border-border">
                          مستخدم عادي
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-border/60">
                  <button
                    type="button"
                    onClick={() => openRole(u)}
                    className="h-8 px-2.5 rounded-lg border border-primary/30 text-primary text-xs font-bold flex items-center gap-1 hover:bg-primary/10 transition"
                  >
                    <Shield className="size-3.5" /> الصلاحيات
                  </button>
                  <button
                    type="button"
                    onClick={() => openPw(u)}
                    className="h-8 px-2.5 rounded-lg border border-gold/40 text-gold text-xs font-bold flex items-center gap-1 hover:bg-gold/10 transition"
                  >
                    <KeyRound className="size-3.5" /> كلمة السر
                  </button>
                  <button
                    type="button"
                    onClick={() => openDelete(u)}
                    className="h-8 px-2.5 rounded-lg border border-destructive/40 text-destructive text-xs font-bold flex items-center gap-1 hover:bg-destructive/10 transition"
                  >
                    <Trash2 className="size-3.5" /> حذف
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Role Modification Dialog */}
      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="size-5 text-primary" />
              <span>تعديل الصلاحيات: {roleUser?.full_name || roleUser?.phone || roleUser?.email || "المستخدم"}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold">نوع الحساب والرتبة</Label>
              <div className="grid grid-cols-1 gap-2">
                <label
                  className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition ${
                    roleType === "admin"
                      ? "bg-primary/10 border-primary shadow-sm"
                      : "bg-card border-border hover:bg-muted/40"
                  }`}
                  onClick={() => setRoleType("admin")}
                >
                  <input
                    type="radio"
                    name="role_type"
                    checked={roleType === "admin"}
                    onChange={() => setRoleType("admin")}
                    className="mt-1 accent-primary"
                  />
                  <div className="flex-1">
                    <div className="font-bold text-sm flex items-center gap-1.5 text-primary">
                      <Shield className="size-4" />
                      مدير كامل الصلاحيات (Admin)
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      وصول كامل لجميع أقسام لوحة الإدارة وإدارة المتجر والمنتجات والطلبات والمستخدمين.
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition ${
                    roleType === "staff"
                      ? "bg-blue-500/10 border-blue-500 shadow-sm"
                      : "bg-card border-border hover:bg-muted/40"
                  }`}
                  onClick={() => setRoleType("staff")}
                >
                  <input
                    type="radio"
                    name="role_type"
                    checked={roleType === "staff"}
                    onChange={() => setRoleType("staff")}
                    className="mt-1 accent-blue-500"
                  />
                  <div className="flex-1">
                    <div className="font-bold text-sm flex items-center gap-1.5 text-blue-600">
                      <ShieldCheck className="size-4" />
                      موظف بصلاحيات مخصصة (Staff)
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      منح وصول لأقسام محددة فقط في لوحة الإدارة دون الصلاحيات الإدارية الكاملة.
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition ${
                    roleType === "user"
                      ? "bg-muted border-foreground/30 shadow-sm"
                      : "bg-card border-border hover:bg-muted/40"
                  }`}
                  onClick={() => setRoleType("user")}
                >
                  <input
                    type="radio"
                    name="role_type"
                    checked={roleType === "user"}
                    onChange={() => setRoleType("user")}
                    className="mt-1 accent-foreground"
                  />
                  <div className="flex-1">
                    <div className="font-bold text-sm text-foreground">
                      مستخدم عادي / عميل (Customer)
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      حساب زبون عادي للتسوق والطلب فقط بدون أي وصول للوحة الإدارة.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {roleType === "staff" && (
              <div className="space-y-2 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-3">
                <Label className="text-xs font-bold text-blue-700 dark:text-blue-400 block mb-1">
                  تحديد صلاحيات الموظف
                </Label>
                <div className="space-y-1.5">
                  <label className="flex items-center justify-between p-2 rounded-xl bg-card border border-border cursor-pointer">
                    <span className="text-xs font-semibold">إدارة الطلبات وطباعة الفواتير</span>
                    <Switch
                      checked={staffPerms.can_orders}
                      onCheckedChange={(v) => setStaffPerms({ ...staffPerms, can_orders: v })}
                    />
                  </label>
                  <label className="flex items-center justify-between p-2 rounded-xl bg-card border border-border cursor-pointer">
                    <span className="text-xs font-semibold">إدارة المنتجات والمخزون</span>
                    <Switch
                      checked={staffPerms.can_products}
                      onCheckedChange={(v) => setStaffPerms({ ...staffPerms, can_products: v })}
                    />
                  </label>
                  <label className="flex items-center justify-between p-2 rounded-xl bg-card border border-border cursor-pointer">
                    <span className="text-xs font-semibold">إدارة طلبات الاستبدال والتعليقات</span>
                    <Switch
                      checked={staffPerms.can_replacements}
                      onCheckedChange={(v) => setStaffPerms({ ...staffPerms, can_replacements: v })}
                    />
                  </label>
                  <label className="flex items-center justify-between p-2 rounded-xl bg-card border border-border cursor-pointer">
                    <span className="text-xs font-semibold">حظر ورفع حظر المستخدمين</span>
                    <Switch
                      checked={staffPerms.can_block}
                      onCheckedChange={(v) => setStaffPerms({ ...staffPerms, can_block: v })}
                    />
                  </label>
                </div>
              </div>
            )}

            <Button className="w-full" onClick={submitRole} disabled={savingRole}>
              {savingRole ? (
                <>
                  <Loader2 className="size-4 me-1.5 animate-spin" />
                  جاري الحفظ…
                </>
              ) : (
                "حفظ التغييرات"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تغيير كلمة سر: {pwUser?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="كلمة السر الجديدة">
              <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="6 أحرف على الأقل" dir="ltr" />
            </Field>
            <p className="text-xs text-muted-foreground">
              سيتمكن المستخدم من تسجيل الدخول بكلمة السر الجديدة فوراً. ذكّره بها بشكل آمن.
            </p>
            <Button className="w-full" onClick={submitPw} disabled={savingPw}>
              {savingPw ? <><Loader2 className="size-4 me-1 animate-spin" /> جاري الحفظ…</> : "حفظ كلمة السر الجديدة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={!!deleteUser} onOpenChange={(v) => { if (!v && !deleting) setDeleteUser(null); }}>
        <AlertDialogContent dir="rtl" className="max-w-md">
          <AlertDialogHeader>
            <div className="size-12 rounded-full bg-destructive/15 grid place-items-center mb-2 mx-auto sm:mx-0">
              <Trash2 className="size-6 text-destructive" />
            </div>
            <AlertDialogTitle className="text-base sm:text-lg">
              حذف حساب المستخدم نهائياً
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-xs leading-relaxed space-y-2 text-start">
                <p>
                  هل أنت متأكد من رغبتك في حذف حساب{" "}
                  <strong className="text-foreground">{deleteUser?.full_name || deleteUser?.phone || deleteUser?.email || deleteUser?.id?.slice(0, 8)}</strong>؟
                </p>
                <div>
                  <div className="font-bold text-destructive mb-1">البيانات التي سيتم حذفها نهائياً:</div>
                  <ul className="list-disc ps-5 space-y-0.5 text-muted-foreground">
                    <li>بيانات الملف الشخصي (الاسم، الهاتف، الصورة الشخصية)</li>
                    <li>عناوين التوصيل، السلة، المفضلة، الإشعارات، ونقاط الولاء</li>
                    <li>بيانات تسجيل الدخول والصلاحيات المرتبطة بالحساب</li>
                  </ul>
                </div>
                <div>
                  <div className="font-bold mb-1">البيانات المحفوظة للمحاسبة:</div>
                  <p className="text-muted-foreground">
                    سجلات الطلبات والمبيعات السابقة تبقى محفوظة للأغراض المحاسبية والقانونية بعد فصلها عن الحساب.
                  </p>
                </div>
                <p className="pt-1 font-semibold text-foreground">
                  للتأكيد، اكتب <span className="text-destructive font-bold">حذف</span> في الحقل أدناه:
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="حذف"
            disabled={deleting}
            className="text-center font-bold tracking-wider"
            aria-label="تأكيد الحذف"
          />
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); submitDelete(); }}
              disabled={deleting || deleteConfirm.trim() !== "حذف"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin me-1.5" />
                  جاري الحذف…
                </>
              ) : (
                "حذف الحساب نهائياً"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------- Staff ---------------- */

type StaffRow = {
  user_id: string;
  full_name: string;
  phone: string | null;
  can_orders: boolean;
  can_products: boolean;
  can_replacements: boolean;
  can_block: boolean;
  created_at: string | null;
};

function StaffAdmin() {
  const list = useServerFn(listStaff);
  const create = useServerFn(createStaff);
  const update = useServerFn(updateStaff);
  const del = useServerFn(deleteStaff);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["staff", "list"],
    queryFn: () => list(),
  });

  const rows: StaffRow[] = (data as any)?.staff ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [deleting, setDeleting] = useState<StaffRow | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    password: "",
    can_orders: false,
    can_products: false,
    can_replacements: false,
    can_block: false,
  });
  const [busy, setBusy] = useState(false);

  const openNew = () => {
    setEditing(null);
    setForm({ full_name: "", phone: "", password: "", can_orders: false, can_products: false, can_replacements: false, can_block: false });
    setOpen(true);
  };

  const openEdit = (r: StaffRow) => {
    setEditing(r);
    setForm({
      full_name: r.full_name,
      phone: r.phone ?? "",
      password: "",
      can_orders: r.can_orders,
      can_products: r.can_products,
      can_replacements: r.can_replacements,
      can_block: r.can_block,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.full_name.trim()) { toast.error("الاسم مطلوب"); return; }
    if (!editing) {
      if (!form.phone.trim()) { toast.error("رقم الهاتف مطلوب"); return; }
      if (!normalizePhone(form.phone.trim())) {
        toast.error("رقم الهاتف غير صحيح — مثال: 07XX XXX XXXX");
        return;
      }
      if (form.password.length < 6) { toast.error("كلمة السر لا تقل عن 6 أحرف"); return; }
    }
    if (!form.can_orders && !form.can_products && !form.can_replacements && !form.can_block) {
      toast.error("اختر صلاحية واحدة على الأقل");
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await update({
          data: {
            user_id: editing.user_id,
            full_name: form.full_name,
            password: form.password || undefined,
            can_orders: form.can_orders,
            can_products: form.can_products,
            can_replacements: form.can_replacements,
            can_block: form.can_block,
          },
        });
        toast.success("تم تحديث الموظف");
      } else {
        await create({
          data: {
            phone: form.phone.trim(),
            password: form.password,
            full_name: form.full_name.trim(),
            can_orders: form.can_orders,
            can_products: form.can_products,
            can_replacements: form.can_replacements,
            can_block: form.can_block,
          },
        });
        toast.success("تم إضافة الموظف");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["staff", "list"] });
    } catch (e: any) {
      toast.error(e?.message ?? "فشلت العملية");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await del({ data: { user_id: deleting.user_id } });
      toast.success("تم حذف الموظف");
      qc.invalidateQueries({ queryKey: ["staff", "list"] });
      setDeleting(null);
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الحذف");
    } finally {
      setDeletingBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-extrabold text-base">إدارة الموظفين</h2>
          <p className="text-[11px] text-muted-foreground">أضف موظفاً وحدّد صلاحياته وأعطه رقم هاتف وكلمة سر لتسجيل الدخول.</p>
        </div>
        <Button size="sm" onClick={openNew} className="gap-1"><UserPlus className="size-4" /> إضافة موظف</Button>
      </div>

      {isLoading ? (
        <div className="text-center text-sm text-muted-foreground py-6">جاري التحميل…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-6">لا يوجد موظفون حتى الآن.</div>
      ) : (
        <div className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
          {rows.map((r) => (
            <div key={r.user_id} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 grid place-items-center">
                <ShieldCheck className="size-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{r.full_name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{r.phone ? `+${r.phone}` : "—"}</div>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {r.can_orders && <span className="text-[10px] bg-blue-500/10 text-blue-600 rounded-full px-2 py-0.5">طلبات</span>}
                  {r.can_products && <span className="text-[10px] bg-emerald-500/10 text-emerald-600 rounded-full px-2 py-0.5">منتجات</span>}
                  {r.can_replacements && <span className="text-[10px] bg-amber-500/10 text-amber-600 rounded-full px-2 py-0.5">استبدال</span>}
                  {r.can_block && <span className="text-[10px] bg-rose-500/10 text-rose-600 rounded-full px-2 py-0.5">حظر مستخدمين</span>}
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="size-4" /></Button>
              <Button size="icon" variant="destructive" onClick={() => setDeleting(r)}><Trash2 className="size-4" /></Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="md:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "تعديل موظف" : "إضافة موظف"}</DialogTitle></DialogHeader>
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-x-4 md:gap-y-3 md:space-y-0 md:items-start">
            <Field label="الاسم الكامل">
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="مثال: أحمد علي" />
            </Field>
            <Field label="رقم الهاتف">
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="07XX XXX XXXX"
                disabled={!!editing}
              />
              {editing && <p className="text-[10px] text-muted-foreground mt-1">رقم الهاتف غير قابل للتعديل.</p>}
            </Field>
            <Field label={editing ? "كلمة السر (اتركها فارغة لعدم التغيير)" : "كلمة السر"}>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="6 أحرف على الأقل" />
            </Field>
            <div className="md:col-span-2">
              <Label className="text-xs mb-2 block">الصلاحيات</Label>
              <div className="space-y-2">
                <PermRow label="إدارة الطلبات" desc="عرض وتعديل حالة الطلبات وطباعة الفواتير" checked={form.can_orders} onChange={(v) => setForm({ ...form, can_orders: v })} />
                <PermRow label="إدارة المنتجات والمخزون" desc="إضافة/تعديل المنتجات وتحديث الكميات" checked={form.can_products} onChange={(v) => setForm({ ...form, can_products: v })} />
                <PermRow label="إدارة طلبات الاستبدال والتعليقات" desc="الرد على المستخدمين ومعالجة الاستبدال" checked={form.can_replacements} onChange={(v) => setForm({ ...form, can_replacements: v })} />
                <PermRow label="حظر المستخدمين من التعليق" desc="حظر ورفع الحظر عن المستخدمين المسيئين وعرض سجل الحظر" checked={form.can_block} onChange={(v) => setForm({ ...form, can_block: v })} />
              </div>
            </div>
            <Button className="w-full md:col-span-2" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : (editing ? "حفظ التعديلات" : "إضافة الموظف")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => { if (!v && !deletingBusy) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الموظف</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف حساب "{deleting?.full_name}" وصلاحياته نهائياً. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBusy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deletingBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingBusy ? <Loader2 className="size-4 animate-spin" /> : "حذف نهائياً"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PermRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-xl border border-border hover:bg-muted/40 transition cursor-pointer">
      <Switch checked={checked} onCheckedChange={onChange} />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm">{label}</div>
        <div className="text-[11px] text-muted-foreground">{desc}</div>
      </div>
    </label>
  );
}

/* ---------------- Products ---------------- */

function CompatibleModelsField({
  models,
  selected,
  savedVehicle,
  onChange,
}: {
  models: CarModel[];
  selected: string[];
  savedVehicle: { brandName: string; modelId: string; modelName: string; year: string; engine: string } | null;
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>السيارات المتوافقة</Label>
        {savedVehicle && !selected.includes(savedVehicle.modelId) && (
          <button
            type="button"
            onClick={() => onChange([...selected, savedVehicle.modelId])}
            className="text-[11px] font-bold text-gold hover:underline"
          >
            + اضف {savedVehicle.brandName} {savedVehicle.modelName}
          </button>
        )}
      </div>
      {savedVehicle && selected.includes(savedVehicle.modelId) && (
        <div className="text-xs text-gold font-semibold">
          متوافق مع المركبة المختارة: {savedVehicle.brandName} {savedVehicle.modelName} ({savedVehicle.year}) · {savedVehicle.engine}
        </div>
      )}
      <div className="max-h-40 overflow-y-auto border border-border rounded-xl p-2 space-y-1 bg-card">
        {models.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-2">لا توجد موديلات مسجلة</div>
        ) : (
          models.map((m) => (
            <label key={m.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(m.id)}
                onChange={() => toggle(m.id)}
                className="size-4 accent-navy"
              />
              <span className="text-sm flex-1">{m.name_ar}</span>
              {m.name_en && <span className="text-xs text-muted-foreground">{m.name_en}</span>}
            </label>
          ))
        )}
      </div>
      <div className="text-xs text-muted-foreground">{selected.length} موديل محدد</div>
    </div>
  );
}

function MultiSelectChips({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;
  items: { id: string; name_ar: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="font-bold text-sm">{label}</Label>
        <span className="text-[11px] text-muted-foreground">{selected.length} محدد</span>
      </div>
      <div className="flex flex-wrap gap-1.5 p-2 rounded-xl border border-border bg-card max-h-36 overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground py-1">لا توجد عناصر</div>
        ) : (
          items.map((it) => {
            const active = selected.includes(it.id);
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => toggle(it.id)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border font-bold transition flex items-center gap-1 ${
                  active
                    ? "bg-navy text-primary-foreground border-navy shadow-sm"
                    : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {active && <span className="text-gold font-black">✓</span>}
                {it.name_ar}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

type ProductForm = {
  id?: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  oem_number: string;
  price_usd: string;
  compare_price_iqd: string;
  shipping_iqd: string;
  merge_delivery: boolean;
  delivery_group: string;
  merge_with_groups: string[];
  max_merge_qty: string;
  category_id: string;
  brand_id: string;
  category_ids: string[];
  brand_ids: string[];
  specs?: Record<string, any> | null;
  images: string[];
  in_stock: boolean;
  stock_qty: string;
  is_featured: boolean;
  is_deal: boolean;
  compatible_models: string[];
  deal_expires_at: string;
  condition: "new" | "used";
  has_side_options: boolean;
  dialect_names: string;
};

const emptyProduct: ProductForm = {
  name_ar: "", name_en: "", description_ar: "", oem_number: "",
  price_usd: "", compare_price_iqd: "", shipping_iqd: "",
  merge_delivery: true, delivery_group: "small",
  merge_with_groups: ["small", "medium", "large"],
  max_merge_qty: "",
  category_id: "", brand_id: "",
  category_ids: [], brand_ids: [],
  specs: {},
  images: [], in_stock: true, is_featured: false, is_deal: false,
  compatible_models: [], deal_expires_at: "", stock_qty: "0",
  condition: "new",
  has_side_options: true,
  dialect_names: "",
};

function ProductsAdmin() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyProduct);
  const [saving, setSaving] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteProduct, setDeleteProduct] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const usdRate = Number(useSetting("usd_exchange_rate", "1500")) || 1500;
  const usdRounding = Number(useSetting("usd_rounding", "500")) || 0;
  const previewIqd = (() => {
    const u = Number(form.price_usd);
    if (!Number.isFinite(u) || u <= 0) return 0;
    const raw = u * usdRate;
    return usdRounding > 0 ? Math.round(raw / usdRounding) * usdRounding : Math.round(raw);
  })();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin", "products"],
    staleTime: 10_000,
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allProducts: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allProducts = allProducts.concat(data);
          if (data.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            from += PAGE_SIZE;
          }
        } else {
          hasMore = false;
        }
      }

      return allProducts;
    },
  });
  const filteredProducts = (() => {
    const s = search.trim().toLowerCase();
    if (!s) return products;
    return products.filter((p: any) =>
      [p.name_ar, p.name_en, p.oem_number, p.dialect_names]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(s)),
    );
  })();
  const { data: categories = [] } = useQuery(categoriesQuery());
  const { data: brands = [] } = useQuery(brandsQuery());
  const { data: carModels = [] } = useQuery(carModelsQuery());
  // The storefront vehicle picker was removed; the product form no longer has a
  // "my vehicle" quick-add shortcut. CompatModels handles a null savedVehicle.
  const savedVehicle = null;

  const openNew = () => { setForm(emptyProduct); setOpen(true); };
  const openEdit = (p: any) => {
    const specs = (p.specs as any) || {};
    const catIds: string[] = Array.isArray(specs.category_ids) && specs.category_ids.length > 0
      ? specs.category_ids
      : (p.category_id ? [p.category_id] : []);
    const brandIds: string[] = Array.isArray(specs.brand_ids) && specs.brand_ids.length > 0
      ? specs.brand_ids
      : (p.brand_id ? [p.brand_id] : []);

    setForm({
      id: p.id,
      name_ar: p.name_ar ?? "",
      name_en: p.name_en ?? "",
      description_ar: p.description_ar ?? "",
      dialect_names: p.dialect_names ?? "",
      oem_number: p.oem_number ?? "",
      price_usd: p.price_usd ? String(p.price_usd) : "",
      compare_price_iqd: String(p.compare_price_iqd ?? ""),
      shipping_iqd: String(p.shipping_iqd ?? ""),
      merge_delivery: p.merge_delivery !== false,
      delivery_group: (function () {
        const raw = String(p.delivery_group ?? "").toLowerCase();
        if (raw.includes("large") || raw.includes("كبير")) return "large";
        if (raw.includes("medium") || raw.includes("متوسط")) return "medium";
        if (raw.includes("small") || raw.includes("صغير")) return "small";
        return raw ? "small" : "";
      })(),
      merge_with_groups: (function () {
        if (Array.isArray((p as any).merge_with_groups) && (p as any).merge_with_groups.length > 0) {
          return (p as any).merge_with_groups.map((g: string) => {
            const s = String(g).toLowerCase();
            if (s.includes("large") || s.includes("كبير")) return "large";
            if (s.includes("medium") || s.includes("متوسط")) return "medium";
            return "small";
          });
        }
        if (specs?.merge_with_groups && Array.isArray(specs.merge_with_groups)) {
          return specs.merge_with_groups.map((g: string) => {
            const s = String(g).toLowerCase();
            if (s.includes("large") || s.includes("كبير")) return "large";
            if (s.includes("medium") || s.includes("متوسط")) return "medium";
            return "small";
          });
        }
        if (p.merge_delivery !== false) {
          const raw = String(p.delivery_group ?? "").toLowerCase();
          if (raw.includes("large") || raw.includes("كبير")) return [];
          if (raw.includes("medium") || raw.includes("متوسط")) return ["medium", "large"];
          return ["small", "medium", "large"];
        }
        return [];
      })(),
      category_id: catIds[0] || p.category_id || "",
      brand_id: brandIds[0] || p.brand_id || "",
      category_ids: catIds,
      brand_ids: brandIds,
      specs,
      images: p.images ?? [],
      in_stock: !!p.in_stock,
      stock_qty: String(p.stock_qty ?? 0),
      is_featured: !!p.is_featured,
      is_deal: !!p.is_deal,
      compatible_models: p.compatible_models ?? [],
      deal_expires_at: p.deal_expires_at ? new Date(p.deal_expires_at).toISOString().slice(0, 16) : "",
      condition: (p.condition === "used" ? "used" : "new"),
      has_side_options: p.has_side_options !== false,
      max_merge_qty: (function () {
        const raw = (p as any).max_merge_qty ?? specs?.max_merge_qty;
        return raw != null && raw !== "" ? String(raw) : "";
      })(),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name_ar.trim() || !form.price_usd) {
      toast.error("الاسم والسعر بالدولار مطلوبان");
      return;
    }
    if (imgUploading) {
      toast.error("انتظر حتى اكتمال رفع الصور");
      return;
    }
    setSaving(true);
    try {
      const parsedMaxMerge = form.max_merge_qty.trim() ? Math.max(1, Math.floor(Number(form.max_merge_qty))) : null;

      const updatedSpecs = {
        ...((form.specs as any) || {}),
        category_ids: form.category_ids,
        brand_ids: form.brand_ids,
        merge_with_groups: form.merge_with_groups,
        max_merge_qty: parsedMaxMerge,
      };

      const payload = {
        name_ar: form.name_ar,
        name_en: form.name_en || null,
        description_ar: form.description_ar || null,
        dialect_names: form.dialect_names.trim() || null,
        oem_number: form.oem_number || null,
        // price_iqd is auto-computed by DB trigger from price_usd × usd_exchange_rate
        price_usd: Number(form.price_usd),
        compare_price_iqd: form.compare_price_iqd ? Number(form.compare_price_iqd) : null,
        shipping_iqd: form.shipping_iqd ? Number(form.shipping_iqd) : 0,
        merge_delivery: form.merge_delivery,
        delivery_group: form.delivery_group.trim() || null,
        merge_with_groups: form.merge_with_groups,
        max_merge_qty: parsedMaxMerge,
        category_id: form.category_ids[0] || null,
        brand_id: form.brand_ids[0] || null,
        specs: updatedSpecs,
        images: form.images,
        in_stock: form.in_stock,
        stock_qty: form.stock_qty ? Math.max(0, Math.floor(Number(form.stock_qty))) : 0,
        is_featured: form.is_featured,
        is_deal: form.is_deal,
        compatible_models: form.compatible_models.length > 0 ? form.compatible_models : null,
        deal_expires_at: form.is_deal && form.deal_expires_at ? new Date(form.deal_expires_at).toISOString() : null,
        condition: form.condition,
        has_side_options: form.has_side_options,
      };
      const res = form.id
        ? await supabase.from("products").update(payload).eq("id", form.id)
        : await supabase.from("products").insert(payload);
      if (res.error) throw res.error;
      toast.success(form.id ? "تم التحديث" : "تم إضافة المنتج");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e: any) {
      toast.error(e.message ?? "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeleting(true);
    const { error, count } = await supabase
      .from("products")
      .delete({ count: "exact" })
      .eq("id", id);
    if (error) {
      console.error("[admin] delete product failed", error);
      toast.error("تعذّر حذف المنتج", { description: error.message });
      setDeleting(false);
      return;
    }
    if (!count) {
      toast.error("لم يتم الحذف — تحقق من صلاحيات المشرف");
      setDeleting(false);
      return;
    }
    toast.success("تم حذف المنتج");
    setDeleteProduct(null);
    setDeleting(false);
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{search ? `${filteredProducts.length}/${products.length}` : products.length} منتج</div>
        <Button size="sm" onClick={openNew}><Plus className="size-4 me-1" /> إضافة منتج</Button>
      </div>

      <label className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 focus-within:border-gold">
        <SearchIcon className="size-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو رقم OEM…"
          className="flex-1 bg-transparent outline-none text-sm"
        />
      </label>

      {isLoading ? (
        <div className="text-center text-sm text-muted-foreground py-8">جاري التحميل...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8">لا توجد منتجات بعد</div>
      ) : (
        <div className="space-y-2 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-3 md:space-y-0">
          {filteredProducts.map((p: any) => (
            <div key={p.id} className="bg-card border border-border rounded-2xl p-3 flex gap-3 items-center">
              <div className="size-14 rounded-xl bg-muted overflow-hidden shrink-0">
                {p.images?.[0] && <img src={p.images[0]} alt="" className="size-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{p.name_ar}</div>
                <div className="text-xs flex items-center gap-2" dir="ltr">
                  <span className="font-bold text-gold">${Number(p.price_usd ?? 0).toFixed(2)}</span>
                  <span className="text-muted-foreground">≈ {formatIQD(p.price_iqd)}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {p.in_stock && (p.stock_qty ?? 0) > 0 ? `متوفر · ${p.stock_qty ?? 0} قطعة` : "غير متوفر"}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setDeleteProduct({ id: p.id, name: p.name_ar })}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto md:max-w-2xl lg:max-w-3xl">
          <DialogHeader><DialogTitle>{form.id ? "تعديل منتج" : "إضافة منتج جديد"}</DialogTitle></DialogHeader>
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-x-4 md:gap-y-3 md:space-y-0 md:items-start">
            <div className="md:col-span-2">
              <ImageUploader images={form.images} onChange={(imgs) => setForm({ ...form, images: imgs })} onUploadingChange={setImgUploading} />
            </div>
            <Field label="الاسم بالعربي *">
              <Input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
            </Field>
            <Field label="الاسم بالإنجليزي">
              <Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
            </Field>
            <div className="md:col-span-2">
              <Field label="الوصف">
                <Textarea value={form.description_ar} onChange={(e) => setForm({ ...form, description_ar: e.target.value })} rows={3} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="الأسماء البديلة واللهجات (مخفي عن الزبائن - لتسهيل البحث)">
                <Input
                  value={form.dialect_names}
                  onChange={(e) => setForm({ ...form, dialect_names: e.target.value })}
                  placeholder="مثال: جامرلغ، قبق، قبغ، طرمبة بنزين (افصل بينها بفواصل أو مسافات)"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  هذا الحقل مخفي عن الزبائن تماماً، ويُستخدم فقط لتطوير وتسهيل البحث ومطابقة مختلف اللهجات والمصطلحات.
                </p>
              </Field>
            </div>
            <Field label="رقم القطعة (OEM)">
              <Input value={form.oem_number} onChange={(e) => setForm({ ...form, oem_number: e.target.value })} />
            </Field>
            <Field label="السعر بالدولار *">
              <Input
                type="number"
                step="0.01"
                value={form.price_usd}
                onChange={(e) => setForm({ ...form, price_usd: e.target.value })}
                inputMode="decimal"
                dir="ltr"
                placeholder="مثال: 12.50"
              />
              <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-between" dir="ltr">
                <span>× {usdRate} IQD</span>
                <span className="text-gold font-bold">
                  ≈ {previewIqd > 0 ? formatIQD(previewIqd) : "—"}
                </span>
              </div>
            </Field>
            <Field label="السعر قبل الخصم (د.ع، اختياري)">
              <Input type="number" value={form.compare_price_iqd} onChange={(e) => setForm({ ...form, compare_price_iqd: e.target.value })} inputMode="numeric" dir="ltr" />
            </Field>
            <Field label="كلفة التوصيل لهذا المنتج (د.ع)">
              <Input type="number" value={form.shipping_iqd} onChange={(e) => setForm({ ...form, shipping_iqd: e.target.value })} inputMode="numeric" dir="ltr" placeholder="0" />
            </Field>
            <div className="rounded-xl border border-border p-3.5 space-y-3.5 bg-muted/20 md:col-span-2">
              <div className="text-xs font-bold text-gold">إعدادات التوصيل</div>

              <div>
                <Label className="block text-xs font-semibold mb-1">مجموعة التوصيل (حجم القطعة):</Label>
                <p className="text-[11px] text-muted-foreground mb-2">
                  اختر حجماً للمنتج، أو اتركه بدون تحديد ليكون التوصيل مستقلاً دائماً (غير قابل للدمج):
                </p>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: "small", label: "قطع صغيرة" },
                    { id: "medium", label: "قطع متوسطة" },
                    { id: "large", label: "قطع كبيرة" },
                  ].map((grp) => {
                    const isChecked = form.delivery_group === grp.id;
                    return (
                      <label
                        key={grp.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer select-none transition-colors ${
                          isChecked
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border bg-background hover:bg-muted/40 text-foreground"
                        }`}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            setForm((prev) => ({
                              ...prev,
                              delivery_group: checked ? grp.id : "",
                            }));
                          }}
                        />
                        <span className="text-xs">{grp.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="block text-xs font-semibold mb-1">الدمج مع القطع:</Label>
                <p className="text-[11px] text-muted-foreground mb-2">
                  حدد المجموعات التي يمكن لهذه القطعة الاندماج معها واحتساب سعر توصيل القطعة الأكبر فقط:
                </p>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: "small", label: "قطع صغيرة" },
                    { id: "medium", label: "قطع متوسطة" },
                    { id: "large", label: "قطع كبيرة" },
                  ].map((grp) => {
                    const isChecked = form.merge_with_groups.includes(grp.id);
                    return (
                      <label
                        key={grp.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer select-none transition-colors ${
                          isChecked
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border bg-background hover:bg-muted/40 text-foreground"
                        }`}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            setForm((prev) => {
                              const next = checked
                                ? (prev.merge_with_groups.includes(grp.id)
                                    ? prev.merge_with_groups
                                    : [...prev.merge_with_groups, grp.id])
                                : prev.merge_with_groups.filter((g) => g !== grp.id);
                              return {
                                ...prev,
                                merge_with_groups: next,
                                merge_delivery: next.length > 0,
                              };
                            });
                          }}
                        />
                        <span className="text-xs">{grp.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="block text-xs font-semibold mb-1">الحد الأقصى للدمج في الطرد الواحد:</Label>
                <p className="text-[11px] text-muted-foreground mb-2">
                  أقصى عدد قطع تندمج في طرد واحد بسعر توصيل واحد (مثال: اكتب 2 للدعامية، أو اتركه فارغاً لدمج غير محدود):
                </p>
                <Input
                  type="number"
                  min="1"
                  value={form.max_merge_qty}
                  onChange={(e) => setForm({ ...form, max_merge_qty: e.target.value })}
                  placeholder="غير محدود (أو حدد رقماً مثل 2)"
                  className="max-w-xs text-xs h-9"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <MultiSelectChips
                label="التصنيفات (يمكن اختيار أكثر من تصنيف)"
                items={categories}
                selected={form.category_ids}
                onChange={(ids) => setForm({ ...form, category_ids: ids, category_id: ids[0] || "" })}
              />
            </div>
            <div className="md:col-span-2">
              <MultiSelectChips
                label="الماركات (يمكن اختيار أكثر من ماركة)"
                items={brands}
                selected={form.brand_ids}
                onChange={(ids) => setForm({ ...form, brand_ids: ids, brand_id: ids[0] || "" })}
              />
            </div>

            <div className="md:col-span-2">
              <CompatibleModelsField
                models={carModels}
                selected={form.compatible_models}
                savedVehicle={savedVehicle}
                onChange={(ids) => setForm({ ...form, compatible_models: ids })}
              />
            </div>

            <div className="flex items-center justify-between py-1 md:col-span-2 rounded-xl border border-border p-3 bg-muted/20">
              <div>
                <Label className="font-bold text-sm">يدعم خيارات الجوانب (يمين / يسار / تخم)</Label>
                <p className="text-[11px] text-muted-foreground">عند التعطيل، يصبح المنتج مفرداً ولا يظهر له خيار الجهة أو التخم في صفحة المنتج.</p>
              </div>
              <Switch checked={form.has_side_options} onCheckedChange={(v) => setForm({ ...form, has_side_options: v })} />
            </div>

            <div className="flex items-center justify-between py-1">
              <Label>متوفر</Label>
              <Switch checked={form.in_stock} onCheckedChange={(v) => setForm({ ...form, in_stock: v })} />
            </div>
            <Field label="عدد القطع المتوفرة">
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                dir="ltr"
                value={form.stock_qty}
                onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
                placeholder="0"
              />
            </Field>
            <Field label="حالة المنتج">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, condition: "new" })}
                  className={`h-11 rounded-xl font-black text-sm border-2 transition ${form.condition === "new" ? "bg-navy text-primary-foreground border-navy" : "bg-card text-navy border-border"}`}
                >
                  جديد
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, condition: "used" })}
                  className={`h-11 rounded-xl font-black text-sm border-2 transition ${form.condition === "used" ? "bg-gradient-gold text-navy border-gold" : "bg-card text-navy border-border"}`}
                >
                  مستعمل
                </button>
              </div>
            </Field>
            <div className="flex items-center justify-between py-1">
              <Label>مميز</Label>
              <Switch checked={form.is_featured} onCheckedChange={(v) => setForm({ ...form, is_featured: v })} />
            </div>
            <div className="flex items-center justify-between py-1">
              <Label>عرض / تخفيض</Label>
              <Switch checked={form.is_deal} onCheckedChange={(v) => setForm({ ...form, is_deal: v })} />
            </div>
            {form.is_deal && (
              <Field label="ينتهي العرض في (اختياري)">
                <Input
                  type="datetime-local"
                  value={form.deal_expires_at}
                  onChange={(e) => setForm({ ...form, deal_expires_at: e.target.value })}
                />
              </Field>
            )}
            <Button className="w-full md:col-span-2" onClick={save} disabled={saving || imgUploading}>
              {imgUploading ? "جاري رفع الصور..." : saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteProduct} onOpenChange={(v) => !v && setDeleteProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المنتج</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف المنتج «{deleteProduct?.name ?? "—"}»؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteProduct(null)}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProduct && remove(deleteProduct.id)}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "جاري الحذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------- Banners ---------------- */

function BannersAdmin() {
  const qc = useQueryClient();
  const { data: banners = [] } = useQuery(bannersQuery());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ id?: string; title_ar: string; subtitle_ar: string; image_url: string; video_url: string; link: string; views_count?: number; manual_views_count: number; manual_likes_count: number }>({
    title_ar: "", subtitle_ar: "", image_url: "", video_url: "", link: "", manual_views_count: 0, manual_likes_count: 0,
  });
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!form.image_url && !form.video_url) { toast.error("الصورة أو الفيديو مطلوب"); return; }
    const payload = {
      title_ar: form.title_ar || null,
      subtitle_ar: form.subtitle_ar || null,
      image_url: form.image_url || "",
      video_url: form.video_url || null,
      link: form.link || null,
      manual_views_count: Number(form.manual_views_count) || 0,
      manual_likes_count: Number(form.manual_likes_count) || 0,
      is_active: true,
      expires_at: null,
    };
    const isNew = !form.id;
    let newId: string | null = null;
    if (isNew) {
      const res = await supabase.from("banners").insert(payload).select("id").single();
      if (res.error) { toast.error(res.error.message); return; }
      newId = (res.data as any)?.id ?? null;
    } else {
      const res = await supabase.from("banners").update(payload).eq("id", form.id!);
      if (res.error) { toast.error(res.error.message); return; }
    }
    toast.success("تم الحفظ");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["banners"] });
    if (isNew && newId) {
      try {
        const { broadcastBannerPush } = await import("@/lib/banner-push.functions");
        await broadcastBannerPush({ data: { bannerId: newId } });
      } catch (err) {
        console.error("[push] broadcast failed", err);
      }
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا العرض؟")) return;
    const { error } = await supabase.from("banners").delete().eq("id", id);
    if (error) { toast.error("تعذّر الحذف: " + error.message); return; }
    toast.success("تم حذف العرض");
    qc.invalidateQueries({ queryKey: ["banners"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => { setForm({ title_ar: "", subtitle_ar: "", image_url: "", video_url: "", link: "", manual_views_count: 0, manual_likes_count: 0 }); setOpen(true); }}>
          <Plus className="size-4 me-1" /> إضافة عرض
        </Button>
      </div>
      <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
      {banners.map((b) => {
        const bVid = (b as any).video_url;
        const isYt = isYouTubeUrl(bVid);
        const yid = isYt ? getYouTubeVideoId(bVid) : null;
        const totalViews = ((b as any).views_count ?? 0) + ((b as any).manual_views_count ?? 0);
        const manualLikes = (b as any).manual_likes_count ?? 0;

        return (
          <div key={b.id} className="bg-card border border-border rounded-2xl overflow-hidden">
            {bVid ? (
              isYt ? (
                <div className="relative w-full h-32 bg-black overflow-hidden">
                  <img
                    src={safeYouTubeThumbnailUrl(b.image_url, bVid)}
                    alt={b.title_ar ?? ""}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      if (yid) (e.currentTarget as HTMLImageElement).src = `https://i.ytimg.com/vi/${yid}/hqdefault.jpg`;
                    }}
                  />
                  <span className="absolute top-2 start-2 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                    YouTube
                  </span>
                </div>
              ) : (
                <video src={bVid} className="w-full h-32 object-cover bg-black" muted playsInline preload="metadata" poster={b.image_url || undefined} />
              )
            ) : (
              <img src={b.image_url} alt={b.title_ar ?? ""} className="w-full h-32 object-cover" />
            )}
            <div className="p-3 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{b.title_ar ?? "بدون عنوان"}</div>
                <div className="text-xs text-muted-foreground truncate">{b.subtitle_ar ?? ""}</div>
                <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-3">
                  <span>👁️ {totalViews} مشاهدة</span>
                  {manualLikes > 0 && <span>❤️ +{manualLikes} إعجاب مضاف</span>}
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => { setForm({ id: b.id, title_ar: b.title_ar ?? "", subtitle_ar: b.subtitle_ar ?? "", image_url: b.image_url ?? "", video_url: (b as any).video_url ?? "", link: b.link ?? "", views_count: (b as any).views_count ?? 0, manual_views_count: (b as any).manual_views_count ?? 0, manual_likes_count: (b as any).manual_likes_count ?? 0 }); setOpen(true); }}>
                <Pencil className="size-4" />
              </Button>
              <Button size="sm" variant="destructive" onClick={() => remove(b.id)} className="gap-1">
                <Trash2 className="size-4" /> حذف
              </Button>
            </div>
          </div>
        );
      })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "تعديل عرض" : "إضافة عرض"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <ImageUploader
              images={form.image_url ? [form.image_url] : []}
              max={1}
              onChange={(imgs) => setForm({ ...form, image_url: imgs[0] ?? "" })}
            />
            <div>
              <Label className="text-xs mb-1 block">فيديو العرض (اختياري)</Label>
              {form.video_url ? (
                <div className="relative rounded-xl overflow-hidden border border-border p-2 bg-card">
                  {isYouTubeUrl(form.video_url) ? (
                    <div className="flex items-center gap-3">
                      <div className="relative size-16 rounded-lg bg-black overflow-hidden shrink-0">
                        <img
                          src={safeYouTubeThumbnailUrl(form.image_url, form.video_url)}
                          alt="YouTube"
                          className="size-full object-cover"
                          onError={(e) => {
                            const yid = getYouTubeVideoId(form.video_url);
                            if (yid) (e.currentTarget as HTMLImageElement).src = `https://i.ytimg.com/vi/${yid}/hqdefault.jpg`;
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-red-500 flex items-center gap-1">
                          فيديو من يوتيوب
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate" dir="ltr">
                          {form.video_url}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setForm({ ...form, video_url: "" })}
                        className="text-destructive shrink-0"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <video src={form.video_url} className="w-full max-h-48 bg-black rounded-lg" controls playsInline preload="metadata" />
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, video_url: "" })}
                        className="absolute top-3 end-3 size-7 rounded-full bg-destructive text-white grid place-items-center"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      disabled={uploadingVideo}
                      className="h-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:bg-muted transition text-xs gap-1"
                    >
                      {uploadingVideo ? (
                        <div className="w-full px-3">
                          <div className="text-[10px] font-bold mb-1">جاري الرفع… {Math.round(videoProgress * 100)}%</div>
                          <div className="h-1 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-gold transition-all" style={{ width: `${videoProgress * 100}%` }} />
                          </div>
                        </div>
                      ) : (
                        <><Upload className="size-4 text-gold" /> رفع فيديو MP4</>
                      )}
                    </button>

                    <div className="h-20 rounded-xl border border-border p-2 bg-muted/20 flex flex-col justify-center">
                      <Label className="text-[11px] mb-1 font-bold text-red-500">أو رابط يوتيوب / Shorts:</Label>
                      <Input
                        dir="ltr"
                        placeholder="https://youtu.be/..."
                        className="h-8 text-xs bg-card"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const val = e.currentTarget.value.trim();
                            const yid = getYouTubeVideoId(val);
                            if (!yid) {
                              toast.error("رابط يوتيوب غير صالح");
                              return;
                            }
                            setForm((prev) => ({
                              ...prev,
                              video_url: val,
                              image_url: (!prev.image_url || prev.image_url.includes("ytimg.com") || prev.image_url.includes("youtube.com")) ? getYouTubeThumbnail(yid) : prev.image_url,
                            }));
                            toast.success("تم إضافة فيديو يوتيوب");
                          }
                        }}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (!val) return;
                          const yid = getYouTubeVideoId(val);
                          if (!yid) {
                            toast.error("رابط يوتيوب غير صالح");
                            return;
                          }
                          setForm((prev) => ({
                            ...prev,
                            video_url: val,
                            image_url: (!prev.image_url || prev.image_url.includes("ytimg.com") || prev.image_url.includes("youtube.com")) ? getYouTubeThumbnail(yid) : prev.image_url,
                          }));
                          toast.success("تم إضافة فيديو يوتيوب");
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    يمكنك رفع فيديو MP4 مباشرة أو لصق رابط فيديو/Shorts من يوتيوب، وسيتم جلب صورة الغلاف تلقائياً.
                  </p>
                </div>
              )}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  // Guard rails: a 16MB QuickTime banner once made the home
                  // page download ~33MB per visit. Only web-playable formats,
                  // and only at a sane size.
                  const okType = /^video\/(mp4|webm)$/i.test(f.type) || /\.(mp4|webm)$/i.test(f.name);
                  if (!okType) {
                    toast.error("صيغة الفيديو غير مدعومة", {
                      description: "يرجى رفع فيديو بصيغة MP4 أو WebM فقط. صيغ مثل MOV كبيرة جداً ولا تعمل على كل الأجهزة.",
                      duration: 8000,
                    });
                    e.target.value = "";
                    return;
                  }
                  if (f.size > MAX_BANNER_VIDEO_BYTES) {
                    toast.error("حجم الفيديو كبير جداً", {
                      description: `الحد الأقصى ${Math.round(MAX_BANNER_VIDEO_BYTES / (1024 * 1024))} ميغابايت. حجم الملف ${(f.size / (1024 * 1024)).toFixed(1)} ميغابايت — يرجى ضغطه قبل الرفع حتى لا يستهلك بيانات الزبائن.`,
                      duration: 9000,
                    });
                    e.target.value = "";
                    return;
                  }
                  // MP4 must be "faststart" (moov atom at the front) so it streams
                  // on tap instead of forcing a full download first. WebM streams
                  // inherently, so it is exempt.
                  const isMp4 = /^video\/mp4$/i.test(f.type) || /\.mp4$/i.test(f.name);
                  if (isMp4 && !(await isFaststartMp4(f))) {
                    toast.error("الفيديو غير مهيأ للتشغيل الفوري", {
                      description:
                        "هذا الفيديو يحتاج تحميله كاملاً قبل التشغيل. أعد تصديره كـ MP4 مع خيار \"faststart\" أو \"web optimized\" (يضع فهرس الفيديو في البداية) ليبدأ فوراً عند الضغط.",
                      duration: 12000,
                    });
                    e.target.value = "";
                    return;
                  }
                  setUploadingVideo(true);
                  setVideoProgress(0);
                  try {
                    const url = await uploadMediaFile(f, setVideoProgress);
                    setForm((prev) => ({ ...prev, video_url: url }));
                    toast.success("تم رفع الفيديو");

                    if (!form.image_url) {
                      try {
                        const thumbFile = await extractVideoThumbnail(f);
                        const thumbUrl = await uploadMediaFile(thumbFile);
                        setForm((prev) => ({ ...prev, image_url: prev.image_url || thumbUrl }));
                        toast.success("تم تعيين أول فريم كصورة غلاف تلقائياً");
                      } catch (thumbErr) {
                        console.warn("Could not auto-generate thumbnail:", thumbErr);
                      }
                    }
                  } catch (err: any) {
                    toast.error(err?.message ?? "فشل رفع الفيديو");
                  } finally {
                    setUploadingVideo(false);
                    setVideoProgress(0);
                    if (videoInputRef.current) videoInputRef.current.value = "";
                  }
                }}
              />
              <p className="text-[10px] text-muted-foreground mt-1">عند وجود فيديو سيُعرض بدل الصورة، والصورة تُستخدم كصورة أولية.</p>
            </div>
            <Field label="العنوان"><Input value={form.title_ar} onChange={(e) => setForm({ ...form, title_ar: e.target.value })} /></Field>
            <Field label="العنوان الفرعي"><Input value={form.subtitle_ar} onChange={(e) => setForm({ ...form, subtitle_ar: e.target.value })} /></Field>
            <Field label="رابط (اختياري)"><Input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="/category/..." /></Field>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
              <Field label="زيادة مشاهدات إضافية">
                <Input
                  type="number"
                  min={0}
                  value={form.manual_views_count}
                  onChange={(e) => setForm({ ...form, manual_views_count: Math.max(0, parseInt(e.target.value) || 0) })}
                  placeholder="0"
                />
              </Field>
              <Field label="زيادة إعجابات إضافية">
                <Input
                  type="number"
                  min={0}
                  value={form.manual_likes_count}
                  onChange={(e) => setForm({ ...form, manual_likes_count: Math.max(0, parseInt(e.target.value) || 0) })}
                  placeholder="0"
                />
              </Field>
            </div>
            {form.id && (
              <div className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded-lg flex items-center justify-between">
                <span>المشاهدات الحقيقية: <strong className="text-foreground">{form.views_count ?? 0}</strong></span>
                <span>المشاهدات الكلية: <strong className="text-gold">{(form.views_count ?? 0) + (form.manual_views_count || 0)}</strong></span>
              </div>
            )}
            <Button className="w-full" onClick={save}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Taxonomy (Categories + Brands) ---------------- */

const ICON_OPTIONS = [
  { key: "engine", label: "محرك" },
  { key: "brake", label: "فرامل" },
  { key: "electrical", label: "كهرباء" },
  { key: "filter", label: "فلتر" },
  { key: "oil", label: "زيوت" },
  { key: "suspension", label: "محرك/تعليق" },
  { key: "body", label: "بدي" },
  { key: "wheel", label: "إطار" },
  { key: "wiper", label: "مساحات" },
  { key: "light", label: "إنارة" },
  { key: "tool", label: "أدوات" },
];

function TaxonomyAdmin() {
  const qc = useQueryClient();
  const { data: categories = [] } = useQuery(categoriesQuery());
  const { data: brands = [] } = useQuery(brandsQuery());
  const { data: carModels = [] } = useQuery(carModelsQuery());
  const [catOpen, setCatOpen] = useState(false);
  const [catForm, setCatForm] = useState<{ id?: string; name_ar: string; name_en: string; icon: string; image_url: string }>({ name_ar: "", name_en: "", icon: "", image_url: "" });
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandForm, setBrandForm] = useState<{ id?: string; name_ar: string; name_en: string; logo_url: string }>({ name_ar: "", name_en: "", logo_url: "" });
  const [modelOpen, setModelOpen] = useState(false);
  const [modelForm, setModelForm] = useState<{ id?: string; brand_id: string; name_ar: string; name_en: string }>({ brand_id: "", name_ar: "", name_en: "" });

  const openCat = (c?: any) => {
    setCatForm({
      id: c?.id,
      name_ar: c?.name_ar ?? "",
      name_en: c?.name_en ?? "",
      icon: c?.icon ?? "",
      image_url: c?.image_url ?? "",
    });
    setCatOpen(true);
  };

  const saveCategory = async () => {
    if (!catForm.name_ar.trim()) {
      toast.error("اسم التصنيف مطلوب");
      return;
    }
    const payload = {
      name_ar: catForm.name_ar,
      name_en: catForm.name_en || catForm.name_ar,
      icon: catForm.icon || null,
      image_url: catForm.image_url || null,
    };
    const res = catForm.id
      ? await supabase.from("categories").update(payload).eq("id", catForm.id)
      : await supabase.from("categories").insert(payload);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(catForm.id ? "تم التحديث" : "تمت الإضافة");
    setCatOpen(false);
    qc.invalidateQueries({ queryKey: ["categories"] });
  };

  const addCategory = () => openCat();
  const removeCategory = async (id: string) => {
    if (!confirm("حذف التصنيف؟")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["categories"] });
  };
  const openBrand = (b?: any) => {
    setBrandForm({
      id: b?.id,
      name_ar: b?.name_ar ?? "",
      name_en: b?.name_en ?? "",
      logo_url: b?.logo_url ?? "",
    });
    setBrandOpen(true);
  };

  const saveBrand = async () => {
    if (!brandForm.name_ar.trim()) {
      toast.error("اسم الماركة مطلوب");
      return;
    }
    const payload = {
      name_ar: brandForm.name_ar,
      name_en: brandForm.name_en || brandForm.name_ar,
      logo_url: brandForm.logo_url || null,
    };
    const res = brandForm.id
      ? await supabase.from("brands").update(payload).eq("id", brandForm.id)
      : await supabase.from("brands").insert(payload);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(brandForm.id ? "تم التحديث" : "تمت الإضافة");
    setBrandOpen(false);
    qc.invalidateQueries({ queryKey: ["brands"] });
  };

  const addBrand = () => openBrand();
  const removeBrand = async (id: string) => {
    if (!confirm("حذف الماركة؟")) return;
    const { error } = await supabase.from("brands").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["brands"] });
  };

  const openModel = (m?: any) => {
    setModelForm({ id: m?.id, brand_id: m?.brand_id ?? "", name_ar: m?.name_ar ?? "", name_en: m?.name_en ?? "" });
    setModelOpen(true);
  };
  const saveModel = async () => {
    if (!modelForm.brand_id) { toast.error("اختر الماركة"); return; }
    if (!modelForm.name_ar.trim()) { toast.error("اسم نوع السيارة مطلوب"); return; }
    const payload = {
      brand_id: modelForm.brand_id,
      name_ar: modelForm.name_ar,
      name_en: modelForm.name_en || modelForm.name_ar,
    };
    const res = modelForm.id
      ? await supabase.from("car_models").update(payload).eq("id", modelForm.id)
      : await supabase.from("car_models").insert(payload);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(modelForm.id ? "تم التحديث" : "تمت الإضافة");
    setModelOpen(false);
    qc.invalidateQueries({ queryKey: ["car_models"] });
  };
  const removeModel = async (id: string) => {
    if (!confirm("حذف نوع السيارة؟")) return;
    const { error } = await supabase.from("car_models").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["car_models"] });
  };

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">التصنيفات</h3>
          <Button size="sm" onClick={addCategory}><Plus className="size-4 me-1" /> جديد</Button>
        </div>
        <div className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
          {categories.map((c) => (
            <div key={c.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="size-12 rounded-lg bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                {c.image_url ? <img src={c.image_url} alt="" className="size-full object-cover" /> : <span className="text-xl">{categoryEmoji(c.icon)}</span>}
              </div>
              <span className="flex-1 text-sm font-semibold truncate">{c.name_ar}</span>
              <Button size="icon" variant="ghost" onClick={() => openCat(c)}><Pencil className="size-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => removeCategory(c.id)}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      </section>

      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{catForm.id ? "تعديل تصنيف" : "إضافة تصنيف"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <ImageUploader images={catForm.image_url ? [catForm.image_url] : []} max={1} resizeTo={256} onChange={(imgs) => setCatForm({ ...catForm, image_url: imgs[0] ?? "" })} />
            <Field label="الاسم بالعربي *"><Input value={catForm.name_ar} onChange={(e) => setCatForm({ ...catForm, name_ar: e.target.value })} /></Field>
            <Field label="الاسم بالإنجليزي"><Input value={catForm.name_en} onChange={(e) => setCatForm({ ...catForm, name_en: e.target.value })} /></Field>
            <Field label="الأيقونة (اختياري)">
              <Select value={catForm.icon || "__none__"} onValueChange={(v) => setCatForm({ ...catForm, icon: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="اختر أيقونة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">بدون</SelectItem>
                  {ICON_OPTIONS.map((opt) => <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Button className="w-full" onClick={saveCategory}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">الماركات</h3>
          <Button size="sm" onClick={addBrand}><Plus className="size-4 me-1" /> جديد</Button>
        </div>
        <div className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
          {brands.map((b) => (
            <div key={b.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="size-12 rounded-lg bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                {b.logo_url ? <img src={b.logo_url} alt="" className="size-full object-contain p-1" /> : <ImageIcon className="size-5 text-muted-foreground" />}
              </div>
              <span className="flex-1 text-sm font-semibold truncate">{b.name_ar}</span>
              <Button size="icon" variant="ghost" onClick={() => openBrand(b)}><Pencil className="size-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => removeBrand(b.id)}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      </section>

      <Dialog open={brandOpen} onOpenChange={setBrandOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{brandForm.id ? "تعديل ماركة" : "إضافة ماركة"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <ImageUploader images={brandForm.logo_url ? [brandForm.logo_url] : []} max={1} resizeTo={256} onChange={(imgs) => setBrandForm({ ...brandForm, logo_url: imgs[0] ?? "" })} />
            <Field label="الاسم بالعربي *"><Input value={brandForm.name_ar} onChange={(e) => setBrandForm({ ...brandForm, name_ar: e.target.value })} /></Field>
            <Field label="الاسم بالإنجليزي"><Input value={brandForm.name_en} onChange={(e) => setBrandForm({ ...brandForm, name_en: e.target.value })} /></Field>
            <Button className="w-full" onClick={saveBrand}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">أنواع السيارات</h3>
          <Button size="sm" onClick={() => openModel()}><Plus className="size-4 me-1" /> جديد</Button>
        </div>
        <div className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
          {carModels.map((m) => {
            const brand = brands.find((b) => b.id === m.brand_id);
            return (
              <div key={m.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                <span className="flex-1 text-sm font-semibold truncate">
                  {m.name_ar}
                  {brand && <span className="text-xs text-muted-foreground font-normal"> — {brand.name_ar}</span>}
                </span>
                <Button size="icon" variant="ghost" onClick={() => openModel(m)}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => removeModel(m.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            );
          })}
          {carModels.length === 0 && <div className="text-sm text-muted-foreground py-2">لا توجد أنواع سيارات مسجلة</div>}
        </div>
      </section>

      <Dialog open={modelOpen} onOpenChange={setModelOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{modelForm.id ? "تعديل نوع سيارة" : "إضافة نوع سيارة"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="الماركة *">
              <Select value={modelForm.brand_id || "__none__"} onValueChange={(v) => setModelForm({ ...modelForm, brand_id: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="اختر الماركة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">اختر الماركة</SelectItem>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="الاسم بالعربي *"><Input value={modelForm.name_ar} onChange={(e) => setModelForm({ ...modelForm, name_ar: e.target.value })} placeholder="مثال: ماليبو" /></Field>
            <Field label="الاسم بالإنجليزي"><Input value={modelForm.name_en} onChange={(e) => setModelForm({ ...modelForm, name_en: e.target.value })} placeholder="Malibu" dir="ltr" /></Field>
            <Button className="w-full" onClick={saveModel}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function categoryEmoji(icon: string | null) {
  const map: Record<string, string> = {
    engine: "⚙️",
    brake: "🛞",
    braking: "🛞",
    electrical: "⚡",
    filter: "🌀",
    oil: "🛢️",
    suspension: "🔩",
    body: "🚙",
    wheel: "🛞",
    wiper: "🌧️",
    light: "💡",
    tool: "🛠️",
  };
  return map[icon ?? ""] ?? "🏷️";
}

/* ---------------- Orders ---------------- */

function OrdersAdmin() {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");

  const { data: activeOrders = [], isLoading: loadingActive } = useQuery({
    queryKey: ["admin", "orders", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .or("is_archived.is.null,is_archived.eq.false")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: archivedOrders = [], isLoading: loadingArchived } = useQuery({
    queryKey: ["admin", "orders", "archived"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("is_archived", true)
        .order("archived_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const orders = viewMode === "active" ? activeOrders : archivedOrders;
  const isLoading = viewMode === "active" ? loadingActive : loadingArchived;

  useEffect(() => {
    const ch = supabase
      .channel(`admin-orders-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          qc.invalidateQueries({ queryKey: ["admin", "orders"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"single_delete" | "selected_delete" | "selected_archive" | "all_archive">("single_delete");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [archiveSecret, setArchiveSecret] = useState("");
  const [processing, setProcessing] = useState(false);
  const [range, setRange] = useState<"24h" | "7d" | "all">("24h");

  const now = Date.now();
  const cutoff24 = now - 24 * 60 * 60 * 1000;
  const cutoff7 = now - 7 * 24 * 60 * 60 * 1000;
  const count24 = (activeOrders as any[]).filter((o) => new Date(o.created_at).getTime() >= cutoff24).length;
  const count7 = (activeOrders as any[]).filter((o) => new Date(o.created_at).getTime() >= cutoff7).length;
  const filtered = (orders as any[]).filter((o) => {
    if (viewMode === "archived") return true;
    const t = new Date(o.created_at).getTime();
    if (range === "24h") return t >= cutoff24;
    if (range === "7d") return t >= cutoff7;
    return true;
  });
  const sum24 = (activeOrders as any[])
    .filter((o) => new Date(o.created_at).getTime() >= cutoff24)
    .reduce((s, o) => s + Number(o.total_iqd || 0), 0);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("orders").update({ status: status as never }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم التحديث");
    qc.invalidateQueries({ queryKey: ["admin", "orders"] });
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    if (selectedOrderIds.size === filtered.length && filtered.length > 0) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filtered.map((o: any) => o.id)));
    }
  };

  const openDeleteSingle = (id: string) => {
    setConfirmMode("single_delete");
    setConfirmId(id);
    setArchiveSecret("");
    setConfirmOpen(true);
  };

  const openDeleteSelected = () => {
    if (selectedOrderIds.size === 0) return;
    setConfirmMode("selected_delete");
    setConfirmId(null);
    setArchiveSecret("");
    setConfirmOpen(true);
  };

  const openArchiveSelected = () => {
    if (selectedOrderIds.size === 0) return;
    setConfirmMode("selected_archive");
    setConfirmId(null);
    setArchiveSecret("");
    setConfirmOpen(true);
  };

  const openArchiveAll = () => {
    if (!activeOrders.length) return;
    setConfirmMode("all_archive");
    setConfirmId(null);
    setArchiveSecret("");
    setConfirmOpen(true);
  };

  const executeAction = async () => {
    if (!archiveSecret.trim()) {
      toast.error("يرجى إدخال الرمز السري");
      return;
    }

    setProcessing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.error("يرجى تسجيل الدخول مجدداً");
        setProcessing(false);
        return;
      }

      if (confirmMode === "all_archive") {
        const res = await fetch("/api/admin/archive-orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ secret: archiveSecret.trim() }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          toast.error(data.error || "الرمز السري غير صحيح");
          setProcessing(false);
          return;
        }
        toast.success(data.message || `تمت أرشفة ${data.count} طلب بنجاح`);
        setSelectedOrderIds(new Set());
        setConfirmOpen(false);
        setArchiveSecret("");
        qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      } else if (confirmMode === "selected_archive") {
        const res = await fetch("/api/admin/archive-orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            secret: archiveSecret.trim(),
            order_ids: Array.from(selectedOrderIds),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          toast.error(data.error || "الرمز السري غير صحيح");
          setProcessing(false);
          return;
        }
        toast.success(data.message || `تمت أرشفة ${data.count} طلب بنجاح`);
        setSelectedOrderIds(new Set());
        setConfirmOpen(false);
        setArchiveSecret("");
        qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      } else if (confirmMode === "selected_delete") {
        const res = await fetch("/api/admin/delete-orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            secret: archiveSecret.trim(),
            order_ids: Array.from(selectedOrderIds),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          toast.error(data.error || "الرمز السري غير صحيح");
          setProcessing(false);
          return;
        }
        toast.success(data.message || `تم حذف ${data.count} طلب بنجاح`);
        setSelectedOrderIds(new Set());
        setConfirmOpen(false);
        setArchiveSecret("");
        qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      } else if (confirmMode === "single_delete" && confirmId) {
        const res = await fetch("/api/admin/delete-orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            secret: archiveSecret.trim(),
            order_ids: [confirmId],
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          toast.error(data.error || "الرمز السري غير صحيح");
          setProcessing(false);
          return;
        }
        toast.success("تم حذف الطلب نهائياً");
        setSelectedOrderIds((prev) => {
          const next = new Set(prev);
          next.delete(confirmId);
          return next;
        });
        setConfirmOpen(false);
        setConfirmId(null);
        setArchiveSecret("");
        qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      }
    } catch {
      toast.error("تعذر الاتصال بالسيرفر");
    } finally {
      setProcessing(false);
    }
  };

  const unarchiveOrder = async (orderId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/admin/unarchive-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error || "تعذرت استعادة الطلب");
        return;
      }
      toast.success(data.message || "تمت استعادة الطلب إلى القائمة النشطة");
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    } catch {
      toast.error("تعذر الاتصال بالسيرفر");
    }
  };

  return (
    <div className="space-y-3">
      {/* Switch between Active and Archived */}
      <div className="flex items-center gap-2 p-1 bg-muted/40 border border-border rounded-2xl w-fit">
        <button
          onClick={() => {
            setViewMode("active");
            setSelectedOrderIds(new Set());
          }}
          className={`h-9 px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            viewMode === "active"
              ? "bg-navy text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ClipboardList className="size-4" /> الطلبات النشطة ({activeOrders.length})
        </button>
        <button
          onClick={() => {
            setViewMode("archived");
            setSelectedOrderIds(new Set());
          }}
          className={`h-9 px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            viewMode === "archived"
              ? "bg-navy text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Archive className="size-4" /> الطلبات المأرشفة ({archivedOrders.length})
        </button>
      </div>

      {viewMode === "active" && (
        <div className="rounded-2xl border border-gold/40 bg-gradient-to-l from-gold/10 to-transparent p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[11px] text-muted-foreground">آخر 24 ساعة</div>
              <div className="text-lg font-black text-navy">{count24} طلب جديد</div>
            </div>
            <div className="text-end">
              <div className="text-[11px] text-muted-foreground">إجمالي</div>
              <div className="text-sm font-bold text-navy">{new Intl.NumberFormat("ar-IQ").format(sum24)} د.ع</div>
            </div>
          </div>
          <div className="flex gap-1.5">
            {([
              { k: "24h", label: `24 ساعة (${count24})` },
              { k: "7d", label: `7 أيام (${count7})` },
              { k: "all", label: `الكل (${activeOrders.length})` },
            ] as const).map((t) => (
              <button
                key={t.k}
                onClick={() => setRange(t.k)}
                className={`h-8 px-3 rounded-xl text-[11px] font-bold border transition ${
                  range === t.k ? "bg-gold text-navy border-gold" : "bg-card border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <button
              onClick={selectAllFiltered}
              className="text-xs font-bold text-navy hover:text-gold flex items-center gap-1.5 bg-muted/60 px-2.5 py-1.5 rounded-xl border border-border transition cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedOrderIds.size > 0 && selectedOrderIds.size === filtered.length}
                readOnly
                className="size-3.5 rounded accent-navy pointer-events-none"
              />
              <span>تحديد الكل ({filtered.length})</span>
            </button>
          )}
          <span className="text-xs text-muted-foreground">
            {viewMode === "active"
              ? `${filtered.length} طلب نشط معروض`
              : `${filtered.length} طلب مأرشف`}
          </span>
        </div>
        {viewMode === "active" && activeOrders.length > 0 && (
          <button
            onClick={openArchiveAll}
            disabled={processing}
            className="h-9 px-3 rounded-xl border border-amber-500/40 text-amber-600 bg-amber-500/5 text-xs font-bold flex items-center gap-1.5 hover:bg-amber-500/10 disabled:opacity-50 transition"
          >
            <Archive className="size-3.5" /> أرشفة جميع الطلبات
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center text-sm text-muted-foreground py-8">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8">
          {viewMode === "active" ? "لا توجد طلبات نشطة ضمن هذه الفترة" : "لا توجد طلبات مأرشفة حالياً"}
        </div>
      ) : (
        <div className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
          {filtered.map((o: any) => (
            <OrderAdminCard
              key={o.id}
              order={o}
              isArchived={viewMode === "archived"}
              isSelected={selectedOrderIds.has(o.id)}
              onToggleSelect={toggleSelectOrder}
              onStatusChange={updateStatus}
              onDelete={openDeleteSingle}
              onUnarchive={unarchiveOrder}
            />
          ))}
        </div>
      )}

      {/* Floating Action Bar when orders are selected */}
      {selectedOrderIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-lg bg-navy/95 backdrop-blur-md text-white rounded-2xl p-3 shadow-2xl border border-gold/40 flex items-center justify-between gap-2 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold bg-gold text-navy px-2.5 py-1 rounded-xl">
              تم تحديد ({selectedOrderIds.size})
            </span>
            <button
              onClick={() => setSelectedOrderIds(new Set())}
              className="text-[11px] text-white/70 hover:text-white underline cursor-pointer"
            >
              إلغاء التحديد
            </button>
          </div>
          <div className="flex items-center gap-2">
            {viewMode === "active" && (
              <button
                onClick={openArchiveSelected}
                className="h-8 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Archive className="size-3.5" /> أرشفة
              </button>
            )}
            <button
              onClick={openDeleteSelected}
              className="h-8 px-3 rounded-xl bg-destructive hover:bg-destructive/90 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            >
              <Trash2 className="size-3.5" /> حذف
            </button>
          </div>
        </div>
      )}

      {/* Confirmation & PIN Modal */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl" className="max-w-sm">
          <AlertDialogHeader className="items-center sm:items-center">
            <div className={`size-12 rounded-full grid place-items-center mb-2 ${confirmMode.includes("archive") ? "bg-amber-500/10" : "bg-destructive/10"}`}>
              {confirmMode.includes("archive") ? (
                <Archive className="size-6 text-amber-600" />
              ) : (
                <Trash2 className="size-6 text-destructive" />
              )}
            </div>
            <AlertDialogTitle className="text-base sm:text-lg">
              {confirmMode === "all_archive"
                ? "أرشفة جميع الطلبات"
                : confirmMode === "selected_archive"
                ? `أرشفة ${selectedOrderIds.size} طلبات محددة`
                : confirmMode === "selected_delete"
                ? `حذف ${selectedOrderIds.size} طلبات محددة نهائياً`
                : "حذف الطلب نهائياً"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              {confirmMode === "all_archive" ? (
                <span>
                  سيتم نقل <strong>{activeOrders.length} طلب</strong> إلى سكرين الطلبات المأرشفة ولن تظهر في قائمة الطلبات النشطة. يمكنك مراجعتها أو استعادتها في أي وقت.
                </span>
              ) : confirmMode === "selected_archive" ? (
                <span>
                  سيتم نقل <strong>{selectedOrderIds.size} طلب</strong> إلى سكرين الطلبات المأرشفة.
                </span>
              ) : (
                "سيتم حذف الطلب(ات) المحددة بشكل نهائي من قاعدة البيانات. لا يمكن التراجع عن هذا الإجراء."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 my-2">
            <label className="text-xs font-bold text-foreground">أدخل الرمز السري للتأكيد (من ملف env):</label>
            <Input
              type="password"
              placeholder="أدخل الرمز السري..."
              value={archiveSecret}
              onChange={(e) => setArchiveSecret(e.target.value)}
              autoFocus
            />
          </div>

          <AlertDialogFooter className="flex-col-reverse sm:flex-col-reverse gap-2">
            <AlertDialogCancel className="w-full mt-0" disabled={processing}>
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              className={`w-full ${confirmMode.includes("archive") ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}`}
              onClick={(e) => {
                e.preventDefault();
                executeAction();
              }}
              disabled={processing || !archiveSecret.trim()}
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : confirmMode === "all_archive" ? (
                `تأكيد أرشفة ${activeOrders.length} طلب`
              ) : confirmMode === "selected_archive" ? (
                `تأكيد أرشفة ${selectedOrderIds.size} طلب`
              ) : confirmMode === "selected_delete" ? (
                `تأكيد حذف ${selectedOrderIds.size} طلب`
              ) : (
                "حذف نهائي"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OrderAdminCard({
  order: o,
  isArchived = false,
  isSelected = false,
  onToggleSelect,
  onStatusChange,
  onDelete,
  onUnarchive,
}: {
  order: any;
  isArchived?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onUnarchive?: (id: string) => void;
}) {
  const isAdminHere = useIsAdmin();
  const staffHere = useStaffPermissions();
  const canBlockHere = isAdminHere || !!staffHere?.can_block;
  const addr = (o.address ?? {}) as { label?: string; full_name?: string; phone?: string; city?: string; area?: string; street?: string; notes?: string };
  const phoneDigits = String(addr.phone ?? "").replace(/\D/g, "");
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`تم نسخ ${label}`); } catch { toast.error("تعذّر النسخ"); }
  };
  const { data: items = [] } = useQuery({
    queryKey: ["admin", "order-items", o.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id,name_ar,oem_number,image_url,unit_price_iqd,quantity,side,note")
        .eq("order_id", o.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: customer } = useQuery({
    queryKey: ["admin", "order-customer", o.user_id],
    enabled: !!o.user_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone, is_blocked, avatar_url")
        .eq("id", o.user_id)
        .maybeSingle();
      return data ?? null;
    },
  });
  const qcCard = useQueryClient();
  const [blockSaving, setBlockSaving] = useState(false);
  const isBlocked = !!(customer as any)?.is_blocked;
  const toggleBlock = async () => {
    if (!o.user_id || blockSaving) return;
    const next = !isBlocked;
    const defaultReason = "تم حظر حسابك لأنك قمت بإرسال أكثر من طلب وهمي. يرجى التواصل مع قسم المبيعات.";
    let reason: string | undefined = next ? defaultReason : undefined;
    setBlockSaving(true);
    try {
      await adminSetUserBlocked({
        data: {
          user_id: o.user_id,
          blocked: next,
          reason,
        },
      });
      toast.success(next ? "تم حظر الزبون وإرسال الإشعار" : "تم رفع الحظر");
      qcCard.invalidateQueries({ queryKey: ["admin", "order-customer", o.user_id] });
      qcCard.invalidateQueries({ queryKey: ["admin", "block-log"] });
      qcCard.invalidateQueries({ queryKey: ["admin", "blocked-users"] });
      qcCard.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تحديث الحالة");
    } finally {
      setBlockSaving(false);
    }
  };
  const addressRows = [
    { key: "label", label: "التسمية", value: addr.label || "—" },
    { key: "full_name", label: "الاسم الكامل", value: addr.full_name || "—" },
    { key: "phone", label: "رقم الهاتف", value: phoneDigits ? `+${phoneDigits}` : "—", mono: true },
    { key: "city", label: "المحافظة", value: addr.city || "—" },
    { key: "area", label: "المنطقة / القضاء", value: addr.area || "—" },
    { key: "street", label: "الشارع / تفاصيل", value: addr.street || "—" },
    { key: "notes", label: "ملاحظات إضافية", value: addr.notes || "—", muted: true },
  ];
  return (
    <div className={`bg-card border rounded-2xl p-3 space-y-3 transition ${isSelected ? "border-gold ring-1 ring-gold shadow-md" : "border-border"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(o.id)}
              className="size-4 rounded border-border accent-navy cursor-pointer"
            />
          )}
          <div className="text-xs font-mono text-muted-foreground">#{(o.order_number ?? o.id).toString().slice(0, 10)}</div>
          {o.admin_reviewed && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 rounded-full px-2 py-0.5">
              <CheckCircle2 className="size-3" /> تمت المراجعة
            </span>
          )}
        </div>
        <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusColor(o.status)}`}>{statusLabel(o.status)}</div>
      </div>

      {(customer as any) && (
        <div className="flex items-center gap-3 -mb-1">
          <div className="size-11 rounded-full overflow-hidden bg-gradient-gold text-navy font-black grid place-items-center shrink-0">
            {(customer as any).avatar_url ? (
              <img src={(customer as any).avatar_url} alt="" className="size-full object-cover" />
            ) : (
              <span>{((customer as any).full_name?.[0] ?? "?").toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate">{(customer as any).full_name || addr.full_name || "زبون"}</div>
            {(customer as any).phone && (
              <div className="text-[11px] text-muted-foreground font-mono truncate">{(customer as any).phone}</div>
            )}
          </div>
          {isBlocked && (
            <span className="text-[10px] font-bold text-destructive bg-destructive/10 border border-destructive/30 rounded-full px-2 py-0.5">
              محظور
            </span>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-gold mb-1">
          <MapPin className="size-4" /> تفاصيل عنوان التوصيل
        </div>
        {addressRows.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-2 text-sm">
            <span className="text-muted-foreground text-xs shrink-0">{row.label}</span>
            <div className={`flex-1 text-end ${row.mono ? "font-mono" : ""} ${row.muted ? "text-muted-foreground text-xs" : "font-semibold"}`}>
              {row.value}
            </div>
          </div>
        ))}
        {phoneDigits && (
          <button
            onClick={() => copy([addr.label, addr.full_name, `+${phoneDigits}`, addr.city, addr.area, addr.street, addr.notes].filter(Boolean).join("\n"), "تفاصيل العنوان")}
            className="w-full mt-1 h-8 rounded-lg border border-border text-muted-foreground text-xs font-bold flex items-center justify-center gap-1.5 hover:text-gold hover:border-gold/50 transition"
          >
            <Copy className="size-3.5" /> نسخ العنوان كاملاً
          </button>
        )}
      </div>

      {items.length > 0 && (
        <div className="rounded-xl border border-border/70 divide-y divide-border/60">
          <div className="px-3 py-1.5 text-[11px] font-bold text-muted-foreground bg-muted/30 rounded-t-xl">
            القطع ({items.length})
          </div>
          {items.map((it: any) => (
            <div key={it.id} className="flex gap-2 p-2">
              <div className="size-12 rounded-lg bg-muted overflow-hidden shrink-0">
                {it.image_url && <img src={it.image_url} alt="" className="size-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0 text-xs">
                <div className="font-bold line-clamp-2">{it.name_ar}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {it.side && (
                    <span className="inline-flex items-center rounded-full bg-navy text-primary-foreground px-2 py-0.5 text-[10px] font-black">
                      {it.side === "LH" ? "LH · يسار" : it.side === "RH" ? "RH · يمين" : "تخم"}
                    </span>
                  )}
                  {it.oem_number && (
                    <span className="font-mono text-[10px] text-muted-foreground">OEM: {it.oem_number}</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-muted-foreground">×{it.quantity}</span>
                  <span className="font-bold">{formatIQD(Number(it.unit_price_iqd) * it.quantity)}</span>
                </div>
                {it.note && (
                  <div className="mt-1 flex items-start gap-1 text-[10px] text-muted-foreground bg-gold/5 border border-gold/20 rounded p-1.5">
                    <StickyNote className="size-3 text-gold shrink-0 mt-0.5" />
                    <span className="whitespace-pre-wrap">{it.note}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {o.notes && (
        <div className="rounded-xl border border-gold/30 bg-gold/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gold mb-1">
            <StickyNote className="size-3.5" /> ملاحظة الزبون على الطلب
          </div>
          <div className="text-sm whitespace-pre-wrap">{o.notes}</div>
        </div>
      )}

      {phoneDigits && (
        <a href={`tel:+${phoneDigits}`} className="flex items-center justify-center gap-1.5 h-9 rounded-lg bg-navy text-primary-foreground text-xs font-bold">
          <Phone className="size-4" /> اتصال
        </a>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground text-xs">الإجمالي</span>
        <span className="font-bold">{formatIQD(o.total_iqd)}</span>
      </div>

      <Select value={o.status} onValueChange={(v) => onStatusChange(o.id, v)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {STATUSES.map((k) => (
            <SelectItem key={k} value={k}>{statusLabel(k)}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <InvoiceActions order={o} items={items} customer={customer ?? null} />

      {o.user_id && canBlockHere && (
        <button
          onClick={toggleBlock}
          disabled={blockSaving}
          className={`w-full h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition ${
            isBlocked
              ? "border-success/40 text-success bg-success/5 hover:bg-success/10"
              : "border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/10"
          } disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {blockSaving ? "جاري التحديث…" : isBlocked ? (<><CheckCircle2 className="size-4" /> رفع الحظر عن الزبون</>) : (<><Ban className="size-4" /> حظر الزبون من الطلبات</>)}
        </button>
      )}
      {isArchived ? (
        <button
          onClick={() => onUnarchive?.(o.id)}
          className="w-full h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-amber-500/40 text-amber-600 bg-amber-500/5 hover:bg-amber-500/10 transition"
        >
          <ArchiveRestore className="size-4" /> استعادة الطلب إلى القائمة النشطة
        </button>
      ) : (
        <button
          onClick={() => onDelete(o.id)}
          className="w-full h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/10 transition"
        >
          <Trash2 className="size-4" /> حذف الطلب نهائياً
        </button>
      )}
    </div>
  );
}

function InvoiceActions({ order, items, customer }: { order: any; items: any[]; customer: { full_name: string | null; phone: string | null } | null }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const domId = `admin-invoice-${order.id}`;
  const previewId = `admin-invoice-preview-${order.id}`;
  const saved = !!order.admin_reviewed;
  const handleSave = async () => {
    const { error } = await supabase
      .from("orders")
      .update({ admin_reviewed: true, reviewed_at: new Date().toISOString() } as never)
      .eq("id", order.id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["admin", "orders"] });
  };
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 h-9 rounded-lg bg-gradient-gold text-navy text-xs font-bold shadow-gold"
      >
        <Receipt className="size-4" /> معاينة الفاتورة {saved && <CheckCircle2 className="size-4 text-emerald-700" />}
      </button>
      <PrintableInvoice order={order} items={items} customer={customer} domId={domId} />
      <InvoicePreviewDialog
        order={order}
        items={items}
        customer={customer}
        open={open}
        onOpenChange={setOpen}
        domId={previewId}
        onSave={handleSave}
        saved={saved}
      />
    </>
  );
}

/* ---------------- External API Connector ---------------- */

function ExternalApiSettings() {
  const qc = useQueryClient();
  const getConfig = useServerFn(getExternalApiConfig);
  const testFn = useServerFn(testExternalApi);
  const { data: config, isLoading } = useQuery({
    queryKey: ["app_settings", "external_api"],
    queryFn: () => getConfig(),
  });

  const [baseUrl, setBaseUrl] = useState("");
  const [keyHeader, setKeyHeader] = useState("Authorization");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [endpoints, setEndpoints] = useState<ExternalApiEndpoint[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ endpointId: string; ok: boolean; message: string } | null>(null);
  const [connTesting, setConnTesting] = useState(false);
  const [connResult, setConnResult] = useState<{ ok: boolean; status?: number; endpoint?: string; message: string; body?: string } | null>(null);

  useEffect(() => {
    if (config) {
      setBaseUrl(config.baseUrl);
      setKeyHeader(config.keyHeader || "Authorization");
      setApiKey(config.apiKey || "");
      setEndpoints(config.endpoints || []);
    }
  }, [config]);

  const addEndpoint = () => {
    setEndpoints((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", method: "GET", path: "" },
    ]);
  };

  const updateEndpoint = (id: string, patch: Partial<ExternalApiEndpoint>) => {
    setEndpoints((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const removeEndpoint = (id: string) => {
    setEndpoints((prev) => prev.filter((e) => e.id !== id));
  };

  const save = async () => {
    const errs = validateExternalApiConfig({
      baseUrl,
      keyHeader,
      apiKey,
      endpoints,
    });
    if (errs.length > 0) {
      toast.error(errs[0].message);
      return;
    }
    setSaving(true);
    try {
      const rows = [
        { key: "external_api_base_url", value: baseUrl.trim() },
        { key: "external_api_key_header", value: keyHeader.trim() || "Authorization" },
        { key: "external_api_key", value: apiKey.trim() },
        { key: "external_api_endpoints", value: JSON.stringify(endpoints) },
      ];
      const { error } = await supabase
        .from("app_settings")
        .upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
      if (error) throw error;
      toast.success("تم حفظ إعدادات API الخارجي");
      qc.invalidateQueries({ queryKey: ["app_settings"] });
      qc.invalidateQueries({ queryKey: ["app_settings", "external_api"] });
    } catch (e: any) {
      toast.error(e.message ?? "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const testEndpoint = async (id: string) => {
    setTesting(id);
    setTestResult(null);
    try {
      const result = await testFn({ data: { endpointId: id } });
      setTestResult({
        endpointId: id,
        ok: result.ok,
        message: result.ok ? `نجاح (${result.status})` : `فشل (${result.status})`,
      });
    } catch (e: any) {
      setTestResult({ endpointId: id, ok: false, message: e.message ?? "فشل الاتصال" });
    } finally {
      setTesting(null);
    }
  };

  const testConnection = async () => {
    setConnResult(null);
    const first = endpoints[0];
    if (!first) {
      setConnResult({ ok: false, message: "أضف endpoint واحدًا على الأقل ثم احفظ الإعدادات." });
      return;
    }
    if (!config || config.baseUrl.trim() !== baseUrl.trim() || config.apiKey.trim() !== apiKey.trim() || JSON.stringify(config.endpoints) !== JSON.stringify(endpoints)) {
      setConnResult({ ok: false, message: "احفظ الإعدادات أولاً قبل الاختبار." });
      return;
    }
    setConnTesting(true);
    try {
      const r = await testFn({ data: { endpointId: first.id } });
      const preview = (r.body || "").slice(0, 240);
      setConnResult({
        ok: r.ok,
        status: r.status,
        endpoint: `${first.method} ${first.path}`,
        message: r.ok ? "تم الاتصال بنجاح" : "فشل الاتصال",
        body: preview,
      });
    } catch (e: any) {
      setConnResult({ ok: false, message: e?.message ?? "خطأ غير متوقع" });
    } finally {
      setConnTesting(false);
    }
  };

  if (isLoading) return <div className="text-center text-xs text-muted-foreground py-4">جاري التحميل…</div>;

  return (
    <div className="bg-muted/30 border border-border rounded-2xl p-3 space-y-3">
      <div className="text-sm font-bold text-gold flex items-center gap-2">
        <Webhook className="size-4" /> ربط API خارجي
      </div>
      <Field label="Base URL">
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.example.com/v1"
          dir="ltr"
        />
      </Field>
      <Field label="API Key Header">
        <Input
          value={keyHeader}
          onChange={(e) => setKeyHeader(e.target.value)}
          placeholder="Authorization أو X-API-Key"
          dir="ltr"
        />
        <p className="text-xs text-muted-foreground mt-1">
          إذا كان Header = Authorization سيرسل تلقائياً كـ Bearer Token.
        </p>
      </Field>

      <Field label="مفتاح API (API Key)">
        <div className="flex gap-2">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="ألصق مفتاح API هنا"
            dir="ltr"
            className="flex-1"
          />
          <Button type="button" size="sm" variant="outline" onClick={() => setShowKey((v) => !v)}>
            {showKey ? "إخفاء" : "إظهار"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          يُخزَّن المفتاح في قاعدة البيانات (app_settings). لا تشاركه مع أحد.
        </p>
      </Field>

      <div className="space-y-2">
        <div className="text-xs font-bold">الـ Endpoints</div>
        {endpoints.length === 0 && (
          <div className="text-xs text-muted-foreground">لا توجد endpoints مضافة.</div>
        )}
        {endpoints.map((ep) => (
          <div key={ep.id} className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-3">
              <Input
                value={ep.name}
                onChange={(e) => updateEndpoint(ep.id, { name: e.target.value })}
                placeholder="اسم"
                className="h-8 text-xs"
              />
            </div>
            <div className="col-span-2">
              <Select
                value={ep.method}
                onValueChange={(v) => updateEndpoint(ep.id, { method: v as ExternalApiEndpoint["method"] })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["GET", "POST", "PUT", "DELETE", "PATCH"].map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-5">
              <Input
                value={ep.path}
                onChange={(e) => updateEndpoint(ep.id, { path: e.target.value })}
                placeholder="/endpoint"
                dir="ltr"
                className="h-8 text-xs"
              />
            </div>
            <div className="col-span-2 flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2"
                onClick={() => testEndpoint(ep.id)}
                disabled={testing === ep.id}
              >
                {testing === ep.id ? <Loader2 className="size-3 animate-spin" /> : <Activity className="size-3" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 text-destructive"
                onClick={() => removeEndpoint(ep.id)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
            {testResult?.endpointId === ep.id && (
              <div className={`col-span-12 text-xs ${testResult.ok ? "text-emerald-600" : "text-destructive"}`}>
                {testResult.message}
              </div>
            )}
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={addEndpoint} className="gap-1">
          <Plus className="size-3" /> إضافة endpoint
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-background/60 p-3 space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={testConnection}
          disabled={connTesting}
        >
          {connTesting ? <Loader2 className="size-4 animate-spin" /> : <Activity className="size-4" />}
          {connTesting ? "جاري الاختبار..." : "اختبار الاتصال"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          يُجرَّب أول endpoint من السيرفر باستخدام Base URL ومفتاح API المحفوظين.
        </p>
        {connResult && (
          <div
            className={`rounded-lg border p-2 text-xs space-y-1 ${
              connResult.ok
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            <div className="font-bold flex items-center gap-1">
              {connResult.ok ? "✓" : "✕"} {connResult.message}
              {connResult.status != null && <span className="opacity-70">— HTTP {connResult.status}</span>}
            </div>
            {connResult.endpoint && (
              <div dir="ltr" className="font-mono opacity-80">{connResult.endpoint}</div>
            )}
            {connResult.body && (
              <pre dir="ltr" className="mt-1 max-h-32 overflow-auto rounded bg-black/5 dark:bg-white/5 p-1.5 font-mono text-[10px] whitespace-pre-wrap break-all">
                {connResult.body}
              </pre>
            )}
          </div>
        )}
      </div>

      <Button className="w-full" onClick={save} disabled={saving}>
        {saving ? "جاري الحفظ..." : "حفظ إعدادات API"}
      </Button>
    </div>
  );
}

/* ---------------- Settings ---------------- */

/* ---------------- Broadcast ---------------- */

/** Typed into the confirm box before the send button unlocks. A broadcast writes
 *  one row per customer and cannot be undone, so a stray Enter must not send it. */
const BROADCAST_CONFIRM_WORD = "إرسال";

function BroadcastAdmin() {
  const countFn = useServerFn(adminBroadcastAudienceCount);
  const sendFn = useServerFn(sendAdminBroadcast);

  const [audienceType, setAudienceType] = useState<"all_users" | "all_customers">("all_users");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [sending, setSending] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const { data: audience, isLoading: countLoading, refetch: refetchCount } = useQuery({
    queryKey: ["admin", "broadcast", "count", audienceType],
    queryFn: () => countFn({ data: { audience: audienceType } }),
    staleTime: 30_000,
  });
  const recipients = audience?.count ?? 0;

  const titleTrimmed = title.trim();
  const canOpenConfirm = titleTrimmed.length > 0 && recipients > 0 && !sending && !imageUploading;

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
  };

  const send = async () => {
    setSending(true);
    try {
      let uploadedUrl: string | undefined;

      // Upload image first if provided
      if (imageFile) {
        setImageUploading(true);
        try {
          uploadedUrl = await uploadProductImage(imageFile);
        } catch (uploadErr: any) {
          toast.error("تعذّر رفع الصورة", { description: uploadErr?.message ?? "خطأ أثناء رفع الملف" });
          setSending(false);
          setImageUploading(false);
          return;
        }
        setImageUploading(false);
      }

      const res = await sendFn({
        data: {
          title: titleTrimmed,
          body: body.trim(),
          audience: audienceType,
          image_url: uploadedUrl ?? null,
        },
      });
      toast.success(`تم إرسال الإشعار إلى ${res.sent} مستخدم`);
      setTitle("");
      setBody("");
      clearImage();
      setConfirmOpen(false);
      setConfirmText("");
      refetchCount();
    } catch (err: any) {
      toast.error("تعذّر إرسال الإشعار", { description: err?.message ?? "خطأ غير معروف" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-muted/30 border border-border rounded-2xl p-3 space-y-3">
        <div className="text-sm font-bold text-gold flex items-center gap-2">
          <Megaphone className="size-4" /> إرسال إشعار جماعي
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          يصل الإشعار داخل التطبيق فوراً لجميع المستخدمين، ويرسل تنبيهاً خارجياً (Push Notification) لجميع هواتف أندرويد وآيفون المسجلة.
        </p>

        <Field label="الجمهور المستهدف">
          <Select
            value={audienceType}
            onValueChange={(v: "all_users" | "all_customers") => setAudienceType(v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_users">جميع المستخدمين والزبائن (يشمل الإدارة للتجربة)</SelectItem>
              <SelectItem value="all_customers">الزبائن والعملاء فقط (بدون حسابات الإدارة)</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="العنوان">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, BROADCAST_TITLE_MAX))}
            placeholder="وصلت قطع جديدة 🎉"
            maxLength={BROADCAST_TITLE_MAX}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            {titleTrimmed.length}/{BROADCAST_TITLE_MAX}
          </p>
        </Field>

        <Field label="نص الرسالة (اختياري)">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, BROADCAST_BODY_MAX))}
            rows={4}
            placeholder="تفقّد أحدث قطع الغيار المتوفرة الآن في المتجر."
            maxLength={BROADCAST_BODY_MAX}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            {body.trim().length}/{BROADCAST_BODY_MAX}
          </p>
        </Field>

        <Field label="صورة الإشعار (اختياري)">
          {imagePreview ? (
            <div className="relative inline-block">
              <img src={imagePreview} alt="معاينة" className="h-24 rounded-lg object-cover border" />
              <button
                type="button"
                onClick={clearImage}
                className="absolute -top-2 -end-2 bg-destructive text-destructive-foreground rounded-full size-5 flex items-center justify-center text-xs hover:bg-destructive/80"
              >
                ✕
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border rounded-lg p-3">
              <ImageIcon className="size-4" />
              اختر صورة للإشعار
              <input type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
            </label>
          )}
          {imageUploading && <p className="text-[11px] text-gold mt-1">جاري رفع الصورة…</p>}
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-sm">
            {countLoading ? (
              <span className="text-muted-foreground">جاري حساب عدد المستلمين…</span>
            ) : (
              <span className="font-bold">
                سيتم الإرسال إلى <span className="text-gold">{recipients}</span> مستخدم
              </span>
            )}
          </div>
          <Button
            size="sm"
            disabled={!canOpenConfirm}
            onClick={() => { setConfirmText(""); setConfirmOpen(true); }}
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <><Megaphone className="size-4 me-1" /> مراجعة وإرسال</>}
          </Button>
        </div>

        {recipients === 0 && !countLoading && (
          <p className="text-xs text-destructive">لا يوجد مستخدمين في هذه الشريحة لإرسال الإشعار إليهم.</p>
        )}
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(v) => { if (!sending) { setConfirmOpen(v); if (!v) setConfirmText(""); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الإرسال الجماعي</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-start">
                <div>
                  سيصل هذا الإشعار إلى{" "}
                  <span className="font-bold text-foreground">{recipients} عميل</span>{" "}
                  ولا يمكن التراجع عنه.
                </div>
                <div className="rounded-xl border border-border bg-muted/40 p-3">
                  <div className="font-bold text-foreground">{titleTrimmed || "—"}</div>
                  {body.trim() && (
                    <div className="text-sm mt-1 whitespace-pre-wrap">{body.trim()}</div>
                  )}
                </div>
                <div>
                  اكتب «<span className="font-bold text-foreground">{BROADCAST_CONFIRM_WORD}</span>»
                  للتأكيد:
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={BROADCAST_CONFIRM_WORD}
            disabled={sending}
          />

          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); send(); }}
              disabled={sending || confirmText.trim() !== BROADCAST_CONFIRM_WORD}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : `إرسال إلى ${recipients} عميل`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SettingsAdmin() {
  const qc = useQueryClient();
  const { data: settings = {} } = useQuery(settingsQuery());
  const [wa, setWa] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [logo, setLogo] = useState("");
  const [address, setAddress] = useState("");
  const [locationLink, setLocationLink] = useState("");
  const [years, setYears] = useState("");
  const [frontImage, setFrontImage] = useState("");
  const [about, setAbout] = useState("");
  const [shipLocalName, setShipLocalName] = useState("");
  const [shipLocalCost, setShipLocalCost] = useState("");
  const [shipAramexName, setShipAramexName] = useState("");
  const [shipAramexCost, setShipAramexCost] = useState("");
  const [priceAdjust, setPriceAdjust] = useState<string | null>(null);
  const [ptsRedeem, setPtsRedeem] = useState<string | null>(null);
  const [ptsEarn, setPtsEarn] = useState<string | null>(null);
  const [ptsCapPct, setPtsCapPct] = useState<string | null>(null);
  const [ptsMin, setPtsMin] = useState<string | null>(null);
  const [ptsCardText, setPtsCardText] = useState<string | null>(null);
  const [minVersionAndroid, setMinVersionAndroid] = useState<string | null>(null);
  const [minVersionIos, setMinVersionIos] = useState<string | null>(null);
  const [forceUpdateMsg, setForceUpdateMsg] = useState<string | null>(null);
  const [playStoreUrl, setPlayStoreUrl] = useState<string | null>(null);
  const [appStoreUrl, setAppStoreUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const waVal = wa || settings.whatsapp_number || "";
  const phoneVal = phone || settings.phone_number || "";
  const nameVal = name || settings.store_name || "";
  const taglineVal = tagline || settings.store_tagline || "";
  const logoVal = logo || settings.store_logo || "";
  const addressVal = address || settings.store_address || "";
  const locationLinkVal = locationLink || settings.store_location_link || "";
  const yearsVal = years || settings.store_years || "7";
  const frontImageVal = frontImage || settings.store_front_image || "";
  const aboutVal = about || settings.store_about || "";
  const shipLocalNameVal = shipLocalName || settings.ship_local_name || "التوصيل المحلي";
  const shipLocalCostVal = shipLocalCost || settings.ship_local_cost || "5000";
  const shipAramexNameVal = shipAramexName || settings.ship_aramex_name || "أرامكس";
  const shipAramexCostVal = shipAramexCost || settings.ship_aramex_cost || "10000";
  // null = user hasn't touched the field yet → show saved value.
  // Any string (including "") = user's current input; "" means "reset to 0".
  const priceAdjustVal =
    priceAdjust !== null
      ? priceAdjust
      : String(settings.global_price_adjustment_iqd ?? "0");
  const DEFAULT_POINTS_CARD = "كل 100 نقطة = 1,000 دينار خصم عند الشراء";
  const ptsRedeemVal = ptsRedeem !== null ? ptsRedeem : String(settings.points_redeem_iqd_per_point ?? "10");
  const ptsEarnVal = ptsEarn !== null ? ptsEarn : String(settings.points_earn_per_1000_iqd ?? "10");
  const ptsCapPctVal = ptsCapPct !== null ? ptsCapPct : String(settings.points_max_redeem_pct ?? "50");
  const ptsMinVal = ptsMin !== null ? ptsMin : String(settings.points_min_redeem ?? "100");
  const ptsCardTextVal = ptsCardText !== null ? ptsCardText : String(settings.points_card_text ?? DEFAULT_POINTS_CARD);
  const minVersionAndroidVal = minVersionAndroid !== null ? minVersionAndroid : (settings.min_app_version_android || "1.0.0");
  const minVersionIosVal = minVersionIos !== null ? minVersionIos : (settings.min_app_version_ios || "1.0.0");
  const forceUpdateMsgVal = forceUpdateMsg !== null ? forceUpdateMsg : (settings.force_update_message || "يرجى تحديث التطبيق إلى أحدث إصدار لمتابعة الاستخدام والتمتع بأحدث الميزات وتحسينات الأمان.");
  const playStoreUrlVal = playStoreUrl !== null ? playStoreUrl : (settings.play_store_url || "https://play.google.com");
  const appStoreUrlVal = appStoreUrl !== null ? appStoreUrl : (settings.app_store_url || "https://apps.apple.com");

  const upsert = async (rows: { key: string; value: string }[]) => {
    const { error } = await supabase
      .from("app_settings")
      .upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
    if (error) throw error;
  };

  const save = async () => {
    const clean = waVal.replace(/\D/g, "");
    if (clean.length < 8) { toast.error("أدخل رقم واتساب صحيح"); return; }
    setSaving(true);
    try {
      await upsert([
        { key: "whatsapp_number", value: clean },
        { key: "phone_number", value: phoneVal.replace(/\D/g, "") },
        { key: "store_name", value: nameVal },
        { key: "store_tagline", value: taglineVal },
        { key: "store_logo", value: logoVal },
        { key: "store_address", value: addressVal },
        { key: "store_location_link", value: locationLinkVal },
        { key: "store_years", value: String(Number(yearsVal) || 7) },
        { key: "store_front_image", value: frontImageVal },
        { key: "store_about", value: aboutVal },
        { key: "ship_local_name", value: shipLocalNameVal },
        { key: "ship_local_cost", value: String(Number(shipLocalCostVal) || 0) },
        { key: "ship_aramex_name", value: shipAramexNameVal },
        { key: "ship_aramex_cost", value: String(Number(shipAramexCostVal) || 0) },
        {
          key: "global_price_adjustment_iqd",
          value: String(
            priceAdjustVal.trim() === "" || priceAdjustVal.trim() === "-"
              ? 0
              : Math.trunc(Number(priceAdjustVal)) || 0,
          ),
        },
        // Loyalty points config. Validated/clamped so the server never divides
        // by zero and the cap stays 0–100.
        { key: "points_redeem_iqd_per_point", value: String(Math.max(1, Math.trunc(Number(ptsRedeemVal)) || 10)) },
        { key: "points_earn_per_1000_iqd", value: String(Math.max(0, Math.trunc(Number(ptsEarnVal)) || 0)) },
        { key: "points_max_redeem_pct", value: String(Math.min(100, Math.max(0, Math.trunc(Number(ptsCapPctVal)) || 0))) },
        { key: "points_min_redeem", value: String(Math.max(0, Math.trunc(Number(ptsMinVal)) || 0)) },
        { key: "points_card_text", value: ptsCardTextVal.trim() || DEFAULT_POINTS_CARD },
        // App Force Update
        { key: "min_app_version_android", value: minVersionAndroidVal.trim() || "1.0.0" },
        { key: "min_app_version_ios", value: minVersionIosVal.trim() || "1.0.0" },
        { key: "force_update_message", value: forceUpdateMsgVal.trim() },
        { key: "play_store_url", value: playStoreUrlVal.trim() },
        { key: "app_store_url", value: appStoreUrlVal.trim() },
      ]);
      toast.success("تم حفظ الإعدادات");
      qc.invalidateQueries({ queryKey: ["app_settings"] });
    } catch (e: any) {
      toast.error(e.message ?? "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 md:grid md:grid-cols-2 md:gap-x-4 md:gap-y-4 md:space-y-0 md:items-start">
      <Field label="اسم المتجر">
        <Input value={nameVal} onChange={(e) => setName(e.target.value)} placeholder="Ali Parts" />
      </Field>
      <Field label="الشعار الفرعي (تحت الاسم)">
        <Input value={taglineVal} onChange={(e) => setTagline(e.target.value)} placeholder="قطع أصلية · العراق" />
      </Field>
      <div className="md:col-span-2">
        <Label className="text-xs mb-1 block">شعار المتجر (لوگو)</Label>
        <ImageUploader
          images={logoVal ? [logoVal] : []}
          max={1}
          onChange={(imgs) => setLogo(imgs[0] ?? "")}
        />
        <p className="text-xs text-muted-foreground mt-1">إذا لم يتم رفع صورة سيظهر الحرف الأول من اسم المتجر.</p>
      </div>
      <Field label="رقم الواتساب (صيغة دولية بدون +)">
        <Input
          value={waVal}
          onChange={(e) => setWa(e.target.value)}
          placeholder="9647701234567"
          inputMode="numeric"
          dir="ltr"
        />
        <p className="text-xs text-muted-foreground mt-1">مثال: 9647701234567 (964 رمز العراق + الرقم بدون صفر)</p>
      </Field>
      <Field label="رقم الاتصال الهاتفي (صيغة دولية بدون +)">
        <Input
          value={phoneVal}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="9647701234567"
          inputMode="numeric"
          dir="ltr"
        />
        <p className="text-xs text-muted-foreground mt-1">يظهر في زر "اتصال هاتفي" بصفحة اتصل بنا. اتركه فارغاً لاستخدام رقم الواتساب.</p>
      </Field>
      <Field label="العنوان (يظهر في صفحة اتصل بنا ومن نحن)">
        <Input value={addressVal} onChange={(e) => setAddress(e.target.value)} placeholder="بغداد، العراق" />
      </Field>
      <Field label="رابط موقع المحل على الخريطة (Google Maps)">
        <Input
          value={locationLinkVal}
          onChange={(e) => setLocationLink(e.target.value)}
          placeholder="https://maps.google.com/?q=..."
          dir="ltr"
        />
      </Field>
      <Field label="عدد سنوات الخبرة في السوق">
        <Input
          type="number"
          value={yearsVal}
          onChange={(e) => setYears(e.target.value)}
          inputMode="numeric"
        />
      </Field>
      <div className="md:col-span-2">
        <Label className="text-xs mb-1 block">صورة واجهة المحل</Label>
        <ImageUploader
          images={frontImageVal ? [frontImageVal] : []}
          max={1}
          onChange={(imgs) => setFrontImage(imgs[0] ?? "")}
        />
        <p className="text-xs text-muted-foreground mt-1">تظهر في صفحة من نحن.</p>
      </div>
      <div className="md:col-span-2">
        <Field label="نبذة عن المتجر (يظهر في من نحن)">
          <Textarea value={aboutVal} onChange={(e) => setAbout(e.target.value)} rows={4} placeholder="متجر متخصص في بيع قطع غيار..." />
        </Field>
      </div>
      <div className="bg-muted/30 border border-border rounded-2xl p-3 space-y-2 md:col-span-2">
        <div className="text-sm font-bold text-gold">تعديل السعر العام (د.ع)</div>
        <Input
          type="number"
          value={priceAdjustVal}
          onChange={(e) => setPriceAdjust(e.target.value)}
          inputMode="numeric"
          dir="ltr"
          placeholder="0"
        />
        <p className="text-xs text-muted-foreground">
          يُضاف هذا المبلغ (أو يُطرح إذا كان سالباً) إلى سعر كل منتج عند عرضه للزبائن.
          مثال: 1000 يعني رفع كل الأسعار 1000 د.ع، و -1000 يعني خصم 1000 د.ع. لا يغيّر
          الأسعار الأصلية المحفوظة في قاعدة البيانات.
        </p>
      </div>
      <div className="bg-muted/30 border border-border rounded-2xl p-3 space-y-3 md:col-span-2">
        <div className="text-sm font-bold text-gold flex items-center gap-2">
          <Sparkles className="size-4" /> نظام نقاط الولاء
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="قيمة النقطة بالدينار عند الاستبدال">
            <Input type="number" value={ptsRedeemVal} onChange={(e) => setPtsRedeem(e.target.value)} inputMode="numeric" dir="ltr" placeholder="10" min={1} />
          </Field>
          <Field label="النقاط المكتسبة لكل 1000 دينار">
            <Input type="number" value={ptsEarnVal} onChange={(e) => setPtsEarn(e.target.value)} inputMode="numeric" dir="ltr" placeholder="10" min={0} />
          </Field>
          <Field label="أقصى نسبة خصم بالنقاط من الطلب %">
            <Input type="number" value={ptsCapPctVal} onChange={(e) => setPtsCapPct(e.target.value)} inputMode="numeric" dir="ltr" placeholder="50" min={0} max={100} />
          </Field>
          <Field label="أقل عدد نقاط للاستبدال">
            <Input type="number" value={ptsMinVal} onChange={(e) => setPtsMin(e.target.value)} inputMode="numeric" dir="ltr" placeholder="100" min={0} />
          </Field>
        </div>
        <Field label="وصف بطاقة النقاط (يظهر للزبون)">
          <Input value={ptsCardTextVal} onChange={(e) => setPtsCardText(e.target.value)} placeholder="كل 100 نقطة = 1,000 دينار خصم عند الشراء" />
        </Field>
        <p className="text-xs text-muted-foreground">
          تغيير «قيمة النقطة» يُعيد تقييم رصيد كل الزبائن مباشرة عند الاستبدال (رصيدهم بالنقاط لا يتغيّر، لكن قيمته بالدينار تتغيّر). «النقاط المكتسبة» تؤثّر فقط على الطلبات المستقبلية.
        </p>
      </div>
      <div className="md:col-span-2"><ExchangeRateSettings /></div>
      <div className="md:col-span-2"><VideoCacheSettings /></div>
      <div className="md:col-span-2"><FcmTokensClearSettings /></div>
      <div className="md:col-span-2"><DatabaseBackupSettings /></div>
      <div className="bg-muted/30 border border-border rounded-2xl p-3 space-y-3 md:col-span-2">
        <div className="text-sm font-bold text-gold flex items-center gap-2">
          <Package className="size-4" /> إعدادات شركات التوصيل
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="اسم الخيار الأول">
            <Input value={shipLocalNameVal} onChange={(e) => setShipLocalName(e.target.value)} placeholder="التوصيل المحلي" />
          </Field>
          <Field label="كلفة التوصيل (د.ع)">
            <Input type="number" value={shipLocalCostVal} onChange={(e) => setShipLocalCost(e.target.value)} inputMode="numeric" dir="ltr" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="اسم الخيار الثاني">
            <Input value={shipAramexNameVal} onChange={(e) => setShipAramexName(e.target.value)} placeholder="أرامكس" />
          </Field>
          <Field label="كلفة التوصيل (د.ع)">
            <Input type="number" value={shipAramexCostVal} onChange={(e) => setShipAramexCost(e.target.value)} inputMode="numeric" dir="ltr" />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">اترك الاسم فارغاً لإخفاء الخيار من صفحة الدفع.</p>
      </div>
      <div className="bg-muted/30 border border-border rounded-2xl p-4 space-y-3 md:col-span-2">
        <div className="text-sm font-bold text-gold flex items-center gap-2">
          <RefreshCw className="size-4" /> إعدادات التحديث الإجباري للتطبيقات (Force Update)
        </div>
        <p className="text-xs text-muted-foreground">
          عند تعيين رقم إصدار أعلى من إصدار التطبيق المثبت لدى المستخدم، سيظهر له تنبيه إجباري يمنعه من استخدام التطبيق ويوجهه للمتجر فوراً للتحديث.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="أقل إصدار مطلوب للأندرويد (Android)">
            <Input
              value={minVersionAndroidVal}
              onChange={(e) => setMinVersionAndroid(e.target.value)}
              placeholder="1.0.0"
              dir="ltr"
            />
          </Field>
          <Field label="أقل إصدار مطلوب للآيفون (iOS)">
            <Input
              value={minVersionIosVal}
              onChange={(e) => setMinVersionIos(e.target.value)}
              placeholder="1.0.0"
              dir="ltr"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="رابط Google Play Store">
            <Input
              value={playStoreUrlVal}
              onChange={(e) => setPlayStoreUrl(e.target.value)}
              placeholder="https://play.google.com/store/apps/details?id=..."
              dir="ltr"
            />
          </Field>
          <Field label="رابط Apple App Store">
            <Input
              value={appStoreUrlVal}
              onChange={(e) => setAppStoreUrl(e.target.value)}
              placeholder="https://apps.apple.com/app/id..."
              dir="ltr"
            />
          </Field>
        </div>
        <Field label="رسالة التحديث الإجباري">
          <Textarea
            value={forceUpdateMsgVal}
            onChange={(e) => setForceUpdateMsg(e.target.value)}
            rows={2}
            placeholder="يرجى تحديث التطبيق إلى أحدث إصدار لمتابعة الاستخدام..."
          />
        </Field>
      </div>
      <div className="md:col-span-2"><ExternalApiSettings /></div>
      <Button className="w-full md:col-span-2" onClick={save} disabled={saving}>
        {saving ? "جاري الحفظ..." : "حفظ"}
      </Button>
    </div>
  );
}

/* ---------------- Shared ---------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {

  return (
    <div>
      <Label className="text-xs mb-1 block">{label}</Label>
      {children}
    </div>
  );
}

/* ---------------- Bulk USD Price Update ---------------- */

async function invalidateAllPriceCaches(qc: ReturnType<typeof useQueryClient>) {
  // Cover every query that reads product prices so cards, details, cart, and
  // checkout refresh immediately after a bulk update.
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["products"] }),
    qc.invalidateQueries({ queryKey: ["product"] }),
    qc.invalidateQueries({ queryKey: ["cart"] }),
    qc.invalidateQueries({ queryKey: ["admin", "products"] }),
    qc.invalidateQueries({ queryKey: ["favorites"] }),
  ]);
  await qc.refetchQueries({ type: "active" });
  // Notify other tabs / devices to refresh too.
  broadcastPricesChanged().catch(() => {});
}

function ExchangeRateSettings() {
  const qc = useQueryClient();
  const { data: settings = {} } = useQuery(settingsQuery());
  const [rate, setRate] = useState<string | null>(null);
  const [rounding, setRounding] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rateVal = rate ?? String(settings.usd_exchange_rate ?? "1500");
  const roundingVal = rounding ?? String(settings.usd_rounding ?? "500");

  const save = async () => {
    const r = Number(rateVal);
    if (!(r > 0)) {
      toast.error("أدخل سعر صرف صحيح");
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from("app_settings").upsert([
        { key: "usd_exchange_rate", value: String(r), updated_at: now },
        { key: "usd_rounding", value: String(Number(roundingVal) || 0), updated_at: now },
      ]);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["app_settings"] });
      toast.success("تم حفظ سعر الصرف، وتم تحديث جميع أسعار المنتجات تلقائياً");
      setRate(null);
      setRounding(null);
      await invalidateAllPriceCaches(qc);
    } catch (e: any) {
      toast.error(e.message ?? "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-muted/30 border border-border rounded-2xl p-3 space-y-3">
      <div className="text-sm font-bold text-gold flex items-center gap-2">
        💵 سعر صرف الدولار
      </div>
      <p className="text-xs text-muted-foreground">
        كل الأسعار محفوظة بالدولار. عند تغيير سعر الصرف هنا، تُحسب أسعار جميع
        المنتجات بالدينار تلقائياً وتظهر مباشرة للزبائن.
      </p>

      <Field label="سعر صرف الدولار (د.ع لكل 1$)">
        <Input
          type="number"
          value={rateVal}
          onChange={(e) => setRate(e.target.value)}
          inputMode="numeric"
          dir="ltr"
          placeholder="1500"
        />
        <div className="text-[11px] text-muted-foreground mt-1" dir="ltr">
          1 USD = {Number(rateVal) || 0} IQD
        </div>
      </Field>

      <Field label="التقريب">
        <Select value={roundingVal} onValueChange={(v) => setRounding(v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">بدون تقريب</SelectItem>
            <SelectItem value="250">أقرب 250 د.ع</SelectItem>
            <SelectItem value="500">أقرب 500 د.ع</SelectItem>
            <SelectItem value="1000">أقرب 1000 د.ع</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Button className="w-full" onClick={save} disabled={saving}>
        {saving ? "جاري الحفظ..." : "حفظ سعر الصرف وتحديث كل الأسعار"}
      </Button>
    </div>
  );
}

function _FieldPlaceholder({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs mb-1 block">{label}</Label>
      {children}
    </div>
  );
}


async function resizeImageFile(file: File, size: number): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.clearRect(0, 0, size, size);
    // contain: keep aspect ratio, center
    const scale = Math.min(size / bitmap.width, size / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png", 0.92));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" });
  } catch {
    return file;
  }
}

function ImageUploader({ images, onChange, max = 6, resizeTo, onUploadingChange }: { images: string[]; onChange: (imgs: string[]) => void; max?: number; resizeTo?: number; onUploadingChange?: (uploading: boolean) => void }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    onUploadingChange?.(true);
    const list = Array.from(files).slice(0, max - images.length);
    setTotal(list.length);
    setDone(0);
    setProgress(0);
    try {
      const urls: string[] = [];
      for (const f of list) {
        if (images.length + urls.length >= max) break;
        const toUpload = resizeTo ? await resizeImageFile(f, resizeTo) : f;
        const url = await uploadProductImage(toUpload, setProgress);
        if (url) urls.push(url);
        setDone((d) => d + 1);
        setProgress(0);
      }
      onChange([...images, ...urls]);
      toast.success("تم رفع الصور");
    } catch (e: any) {
      toast.error(e.message ?? "فشل رفع الصور");
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      setProgress(0);
      setDone(0);
      setTotal(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <Label className="text-xs mb-1 block">الصور</Label>
      <div className="flex gap-2 flex-wrap">
        {images.map((url, i) => (
          <div key={i} className="relative size-20 rounded-xl overflow-hidden border border-border">
            <img src={url} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(images.filter((_, j) => j !== i))}
              className="absolute top-0.5 end-0.5 size-6 rounded-full bg-destructive text-white grid place-items-center"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}
        {images.length < max && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="size-20 rounded-xl border-2 border-dashed border-border grid place-items-center text-muted-foreground hover:bg-muted transition"
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-bold">{Math.round(progress * 100)}%</span>
                {total > 1 && <span className="text-[9px] text-muted-foreground">{done + 1}/{total}</span>}
              </div>
            ) : (
              <Upload className="size-5" />
            )}
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
    </div>
  );
}

/* ---------------- Diagnostics ---------------- */

function DiagnosticsAdmin() {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const r = await runDiagnostics();
      setReport(r);
    } catch (e: any) {
      setError(e?.message || "تعذّر تشغيل الفحص");
    } finally {
      setRunning(false);
    }
  };

  // Auto-run once on first open
  const didRunRef = useRef(false);
  if (!didRunRef.current && !running && !report && !error) {
    didRunRef.current = true;
    void run();
  }

  const statusMeta = (s: CheckStatus) =>
    s === "ok"
      ? { icon: <CheckCircle className="size-4" />, cls: "bg-success/10 text-success", label: "سليم" }
      : s === "warn"
      ? { icon: <AlertTriangle className="size-4" />, cls: "bg-amber-500/10 text-amber-600", label: "تحذير" }
      : { icon: <XCircle className="size-4" />, cls: "bg-destructive/10 text-destructive", label: "فشل" };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-extrabold flex items-center gap-2">
          <Activity className="size-4" /> تشخيص النظام
        </div>
        <Button size="sm" variant="secondary" onClick={run} disabled={running} className="gap-1">
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          إعادة الفحص
        </Button>
      </div>

      {report && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-success/10 text-success p-3 text-center">
            <div className="text-xl font-extrabold">{report.summary.ok}</div>
            <div className="text-[11px]">سليم</div>
          </div>
          <div className="rounded-2xl bg-amber-500/10 text-amber-600 p-3 text-center">
            <div className="text-xl font-extrabold">{report.summary.warn}</div>
            <div className="text-[11px]">تحذير</div>
          </div>
          <div className="rounded-2xl bg-destructive/10 text-destructive p-3 text-center">
            <div className="text-xl font-extrabold">{report.summary.fail}</div>
            <div className="text-[11px]">فشل</div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</div>
      )}

      {running && !report && (
        <div className="text-center text-xs text-muted-foreground py-8 flex flex-col items-center gap-2">
          <Loader2 className="size-6 animate-spin" />
          جاري تنفيذ الفحص الشامل…
        </div>
      )}

      {report?.sections.map((sec) => (
        <div key={sec.title} className="space-y-2">
          <div className="text-xs font-bold text-muted-foreground pt-2">{sec.title}</div>
          {sec.checks.map((c) => {
            const m = statusMeta(c.status);
            return (
              <div key={c.id} className="bg-card border border-border rounded-2xl p-3 flex items-start gap-3">
                <div className={`size-9 rounded-full grid place-items-center shrink-0 ${m.cls}`}>{m.icon}</div>
                <div className="flex-1 min-w-0 text-sm">
                  <div className="font-bold flex items-center gap-2">
                    {c.label}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${m.cls}`}>{m.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{c.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {report && (
        <div className="text-[11px] text-muted-foreground text-center pt-2">
          آخر فحص: {new Date(report.ranAt).toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Replacements ---------------- */

const REPLACEMENT_STATUSES = ["pending", "in_review", "approved", "rejected", "resolved"] as const;
type ReplacementStatus = typeof REPLACEMENT_STATUSES[number];

function replacementStatusLabel(s: string) {
  switch (s) {
    case "pending": return "بانتظار المراجعة";
    case "in_review": return "قيد المراجعة";
    case "approved": return "مقبول";
    case "rejected": return "مرفوض";
    case "resolved": return "منجز";
    default: return s;
  }
}

function replacementStatusColor(s: string) {
  switch (s) {
    case "pending": return "bg-amber-100 text-amber-800 border-amber-300";
    case "in_review": return "bg-blue-100 text-blue-800 border-blue-300";
    case "approved": return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case "rejected": return "bg-rose-100 text-rose-800 border-rose-300";
    case "resolved": return "bg-navy text-primary-foreground border-navy";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function ReplacementsAdmin() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | ReplacementStatus>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const runUpdateStatus = useServerFn(adminUpdateReplacementStatus);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "replacements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("replacement_requests" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
  const { data: profiles = [] } = useQuery({
    queryKey: ["admin", "replacement-profiles", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      // Direct profiles read (admins + staff can, per RLS) so we get the phone —
      // get_public_profiles is the public function and deliberately omits it.
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", userIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const profileMap = new Map(profiles.map((p: any) => [p.id, p]));

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  const changeStatus = async (id: string, status: ReplacementStatus) => {
    try {
      await runUpdateStatus({ data: { id, status } });
      toast.success("تم تحديث الحالة وإرسال إشعار للزبون");
      qc.invalidateQueries({ queryKey: ["admin", "replacements"] });
    } catch (err: any) {
      toast.error(err?.message ?? "تعذّر تحديث الحالة");
    }
  };

  const saveNotes = async (id: string, notes: string) => {
    const { error } = await supabase
      .from("replacement_requests" as any)
      .update({ admin_notes: notes } as any)
      .eq("id", id);
    if (error) {
      toast.error("تعذّر حفظ الملاحظات");
      return;
    }
    toast.success("تم حفظ الملاحظات");
    qc.invalidateQueries({ queryKey: ["admin", "replacements"] });
  };

  const executeDelete = async () => {
    if (!confirmDeleteId) return;
    const { error } = await supabase
      .from("replacement_requests" as any)
      .delete()
      .eq("id", confirmDeleteId);
    setConfirmDeleteId(null);
    if (error) {
      toast.error("تعذّر حذف الطلب");
      return;
    }
    toast.success("تم حذف الطلب");
    qc.invalidateQueries({ queryKey: ["admin", "replacements"] });
  };

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`h-8 px-3 rounded-full text-xs font-bold border ${filter === "all" ? "bg-navy text-primary-foreground border-navy" : "border-border hover:bg-muted"}`}
        >
          الكل ({rows.length})
        </button>
        {REPLACEMENT_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`h-8 px-3 rounded-full text-xs font-bold border ${filter === s ? "bg-navy text-primary-foreground border-navy" : "border-border hover:bg-muted"}`}
          >
            {replacementStatusLabel(s)} ({counts[s] ?? 0})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground text-sm">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <div className="size-16 rounded-full bg-muted grid place-items-center mx-auto mb-3">
            <Repeat className="size-8 text-muted-foreground" />
          </div>
          <div className="text-sm text-muted-foreground">لا توجد طلبات استبدال</div>
        </div>
      ) : (
        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
          {filtered.map((r) => (
            <ReplacementCard
              key={r.id}
              row={r}
              profile={profileMap.get(r.user_id)}
              onStatusChange={changeStatus}
              onSaveNotes={saveNotes}
              onDelete={() => setConfirmDeleteId(r.id)}
            />
          ))}
        </div>
      )}

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent dir="rtl" className="max-w-sm">
          <AlertDialogHeader className="items-center sm:items-center">
            <div className="size-12 rounded-full bg-destructive/10 grid place-items-center mb-2">
              <AlertTriangle className="size-6 text-destructive" />
            </div>
            <AlertDialogTitle>حذف طلب الاستبدال</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              سيتم حذف الطلب نهائياً. لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2">
            <AlertDialogCancel className="w-full mt-0">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={executeDelete}
            >
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReplacementCard({
  row,
  profile,
  onStatusChange,
  onSaveNotes,
  onDelete,
}: {
  row: any;
  profile: any;
  onStatusChange: (id: string, s: ReplacementStatus) => void;
  onSaveNotes: (id: string, notes: string) => void;
  onDelete: () => void;
}) {
  const [notes, setNotes] = useState<string>(row.admin_notes ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = (notes ?? "") !== (row.admin_notes ?? "");

  return (
    <div className="bg-card rounded-2xl border border-border p-4 shadow-card space-y-3">
      <div className="flex items-start gap-2 flex-wrap">
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${replacementStatusColor(row.status)}`}>
          {replacementStatusLabel(row.status)}
        </span>
        <span className="text-[10px] text-muted-foreground ms-auto">
          {new Date(row.created_at).toLocaleString("ar-IQ", { dateStyle: "short", timeStyle: "short" })}
        </span>
      </div>

      <div>
        <div className="text-sm font-bold text-navy">{row.product_name_ar ?? "منتج غير معروف"}</div>
        <div className="text-[11px] text-muted-foreground font-mono">طلب #{String(row.order_id).slice(0, 8)}</div>
      </div>

      {profile && (
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <UserIcon className="size-3.5 text-muted-foreground" />
          <span className="font-semibold">{profile.full_name ?? "بدون اسم"}</span>
          {profile.phone && (
            <a
              href={`tel:${profile.phone}`}
              dir="ltr"
              className="ms-auto inline-flex items-center gap-1 font-mono font-semibold text-navy hover:text-gold"
            >
              <Phone className="size-3" /> {profile.phone}
            </a>
          )}
        </div>
      )}

      <div className="rounded-xl bg-muted/40 p-3">
        <div className="text-[11px] font-bold text-gold mb-1">سبب الاستبدال</div>
        <div className="text-sm whitespace-pre-wrap">{row.reason}</div>
      </div>

      <div>
        <Label className="text-[11px] font-bold text-gold mb-1 block">ملاحظات الإدارة</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="ملاحظات داخلية عن المتابعة..."
          rows={2}
          className="text-sm"
          dir="rtl"
        />
        {dirty && (
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onSaveNotes(row.id, notes);
              setSaving(false);
            }}
          >
            {saving ? "جاري الحفظ..." : "حفظ الملاحظات"}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={row.status} onValueChange={(v) => onStatusChange(row.id, v as ReplacementStatus)}>
          <SelectTrigger className="h-9 w-auto min-w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPLACEMENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{replacementStatusLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Link
          to="/replacements/$id"
          params={{ id: row.id }}
          className="h-9 px-3 rounded-xl border border-border text-xs font-bold flex items-center gap-1.5 hover:bg-muted"
        >
          <History className="size-3.5" /> السجل
        </Link>
        <button
          type="button"
          onClick={onDelete}
          className="h-9 px-3 rounded-xl border border-destructive/40 text-destructive text-xs font-bold flex items-center gap-1.5 hover:bg-destructive/10 ms-auto"
        >
          <Trash2 className="size-3.5" /> حذف
        </button>
      </div>
    </div>
  );
}

/* ---------------- Stock Movements ---------------- */

const REASON_LABEL: Record<string, string> = {
  order_placed: "طلب جديد",
  order_cancelled: "إلغاء طلب",
  order_uncancelled: "إعادة تفعيل طلب",
  order_deleted: "حذف طلب",
};
const REASON_TONE: Record<string, string> = {
  order_placed: "bg-rose-50 text-rose-700 border-rose-200",
  order_cancelled: "bg-emerald-50 text-emerald-700 border-emerald-200",
  order_uncancelled: "bg-amber-50 text-amber-700 border-amber-200",
  order_deleted: "bg-blue-50 text-blue-700 border-blue-200",
};

function StockMovementsAdmin() {
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "stock-movements", reasonFilter],
    queryFn: async () => {
      let q = supabase
        .from("stock_movements" as any)
        .select("id, product_id, product_name_ar, delta, reason, order_id, order_number, actor_id, note, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (reasonFilter !== "all") q = q.eq("reason", reasonFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean)));
  const { data: actors = [] } = useQuery({
    queryKey: ["admin", "stock-movements-actors", actorIds.join("|")],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_profiles", { _ids: actorIds });
      if (error) return [] as any[];
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
  });
  const actorName = (id: string | null | undefined) =>
    actors.find((a) => a.id === id)?.full_name || (id ? id.slice(0, 8) : "—");

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return (
      (r.product_name_ar ?? "").toLowerCase().includes(s) ||
      (r.order_number ?? "").toLowerCase().includes(s) ||
      (r.note ?? "").toLowerCase().includes(s)
    );
  });

  const totals = filtered.reduce(
    (acc, r) => {
      if (r.delta > 0) acc.in += r.delta;
      else acc.out += -r.delta;
      return acc;
    },
    { in: 0, out: 0 },
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="flex items-center gap-1.5 text-emerald-700 text-[11px] font-bold">
            <ArrowUp className="size-3.5" /> إعادة إلى المخزون
          </div>
          <div className="text-xl font-black text-emerald-700 mt-1">+{totals.in}</div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-3">
          <div className="flex items-center gap-1.5 text-rose-700 text-[11px] font-bold">
            <ArrowDown className="size-3.5" /> خصم من المخزون
          </div>
          <div className="text-xl font-black text-rose-700 mt-1">−{totals.out}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="size-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالمنتج، رقم الطلب، أو الملاحظة"
            className="h-9 ps-8 text-xs"
          />
        </div>
        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger className="h-9 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأسباب</SelectItem>
            <SelectItem value="order_placed">طلب جديد</SelectItem>
            <SelectItem value="order_cancelled">إلغاء طلب</SelectItem>
            <SelectItem value="order_uncancelled">إعادة تفعيل</SelectItem>
            <SelectItem value="order_deleted">حذف طلب</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin inline-block me-1" /> جاري التحميل...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-xs text-muted-foreground bg-muted/40 rounded-2xl">
          لا توجد حركات مخزون
        </div>
      ) : (
        <ul className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
          {filtered.map((r) => {
            const positive = r.delta > 0;
            return (
              <li
                key={r.id}
                className="rounded-2xl border border-border bg-card p-3 shadow-card"
              >
                <div className="flex items-start gap-2">
                  <div
                    className={`shrink-0 size-10 rounded-xl grid place-items-center font-black text-sm ${
                      positive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {positive ? "+" : "−"}
                    {Math.abs(r.delta)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-navy truncate">
                        {r.product_name_ar ?? "منتج محذوف"}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${
                          REASON_TONE[r.reason] ?? "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {REASON_LABEL[r.reason] ?? r.reason}
                      </span>
                    </div>
                    {r.note && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">{r.note}</div>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" />
                        {new Date(r.created_at).toLocaleString("ar-IQ")}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UserIcon className="size-3" />
                        {actorName(r.actor_id)}
                      </span>
                      {r.order_number && (
                        <span className="inline-flex items-center gap-1">
                          <Receipt className="size-3" />#{r.order_number}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FcmTokensClearSettings() {
  const clearFn = useServerFn(adminClearAllFcmTokens);
  const [clearing, setClearing] = useState(false);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Fetch the current count of device tokens
  useEffect(() => {
    (async () => {
      try {
        const { count } = await supabase
          .from("device_tokens")
          .select("*", { count: "exact", head: true });
        setTokenCount(count ?? 0);
      } catch {
        setTokenCount(null);
      }
    })();
  }, [clearing]);

  const handleClear = async () => {
    setShowConfirm(false);
    setClearing(true);
    try {
      const result = await clearFn({ data: undefined });
      toast.success(`تم مسح ${result.cleared} رمز FCM بنجاح. سيتم تسجيل رموز جديدة عند دخول المستخدمين.`);
    } catch (e: any) {
      toast.error(e.message ?? "تعذّر مسح رموز FCM");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="bg-muted/30 border border-border rounded-2xl p-3 space-y-3">
      <div className="text-sm font-bold text-gold flex items-center gap-2">
        <Bell className="size-4" /> مسح رموز الإشعارات (FCM Tokens)
      </div>
      <p className="text-xs text-muted-foreground">
        يمسح جميع رموز الإشعارات (FCM) المسجّلة لجميع المستخدمين. عند دخول المستخدم مرة أخرى
        سيتم تسجيل رمز جديد تلقائياً سواء كان على آيفون أو أندرويد.
        مفيد لحل مشاكل الإشعارات المتوقفة (خصوصاً على iOS).
      </p>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs">
          <span className="text-muted-foreground">عدد الرموز المسجّلة حالياً: </span>
          <span className="font-bold">{tokenCount !== null ? tokenCount : "..."}</span>
        </div>
        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfirm(true)}
            disabled={clearing || tokenCount === 0}
            className="border-destructive/50 text-destructive hover:bg-destructive/10"
          >
            <Trash className="size-4 ms-1" />
            {clearing ? "جاري المسح..." : "مسح جميع الرموز"}
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>مسح جميع رموز FCM؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم حذف {tokenCount ?? 0} رمز إشعار مسجّل. لن يستلم أي مستخدم إشعارات خارجية
                حتى يفتح التطبيق مرة أخرى ويتم تسجيل رمز جديد تلقائياً.
                هذا الإجراء لا يمكن التراجع عنه.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={handleClear} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                تأكيد المسح
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function VideoCacheSettings() {
  const [size, setSize] = useState<number>(0);
  const [clearing, setClearing] = useState(false);

  const refresh = () => {
    getVideoCacheSize().then(setSize).catch(() => setSize(0));
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleClear = async () => {
    setClearing(true);
    try {
      const removed = await clearVideoCache();
      toast.success(removed > 0 ? `تم مسح ${removed} فيديو من التخزين المؤقت` : "لا يوجد فيديو مخزّن");
      refresh();
    } catch {
      toast.error("تعذّر مسح كاش الفيديوهات");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="bg-muted/30 border border-border rounded-2xl p-3 space-y-3">
      <div className="text-sm font-bold text-gold flex items-center gap-2">
        <Film className="size-4" /> كاش الفيديوهات
      </div>
      <p className="text-xs text-muted-foreground">
        يتم تخزين الفيديوهات محلياً في المتصفح لتشغيلها بسرعة عند تكرار الفتح. امسح الكاش لتحرير المساحة أو لإجبار
        التطبيق على جلب أحدث نسخة من الفيديو.
      </p>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs">
          <span className="text-muted-foreground">عدد الفيديوهات المخزّنة: </span>
          <span className="font-bold">{size}</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleClear} disabled={clearing}>
          <Trash className="size-4 ms-1" />
          {clearing ? "جاري المسح..." : "مسح الكاش"}
        </Button>
      </div>
    </div>
  );
}

function DatabaseBackupSettings() {
  const [downloadingDb, setDownloadingDb] = useState(false);
  const [downloadingStorage, setDownloadingStorage] = useState(false);

  const handleDownloadDb = async () => {
    setDownloadingDb(true);
    const toastId = toast.loading("جاري تجهيز وتصدير النسخة الاحتياطية للداتابيس...");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error("يجب تسجيل الدخول كمدير لتنزيل النسخة الاحتياطية");
      }

      const res = await fetch("/api/admin/backup", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        let errMsg = "فشل تصدير النسخة الاحتياطية";
        try {
          const errJson = await res.json();
          if (errJson?.error) errMsg = errJson.error;
        } catch { /* noop */ }
        throw new Error(errMsg);
      }

      const disposition = res.headers.get("content-disposition");
      let filename = `maktabali_db_backup_${new Date().toISOString().slice(0, 10)}.sql`;
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) filename = match[1];
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("تم تحميل نسخة الداتابيس بنجاح!", { id: toastId });
    } catch (err: any) {
      toast.error(err?.message || "تعذّر تنزيل نسخة الداتابيس", { id: toastId });
    } finally {
      setDownloadingDb(false);
    }
  };

  const handleDownloadStorage = async () => {
    setDownloadingStorage(true);
    const toastId = toast.loading("جاري ضغط وتجهيز ملفات الصور والمرفقات...");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error("يجب تسجيل الدخول كمدير لتنزيل نسخة الصور");
      }

      const res = await fetch("/api/admin/backup-storage", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        let errMsg = "فشل ضغط ملفات الصور";
        try {
          const errJson = await res.json();
          if (errJson?.error) errMsg = errJson.error;
        } catch { /* noop */ }
        throw new Error(errMsg);
      }

      const disposition = res.headers.get("content-disposition");
      let filename = `maktabali_storage_${new Date().toISOString().slice(0, 10)}.tar.gz`;
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) filename = match[1];
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("تم تحميل نسخة الصور والملفات بنجاح!", { id: toastId });
    } catch (err: any) {
      toast.error(err?.message || "تعذّر تنزيل نسخة الصور", { id: toastId });
    } finally {
      setDownloadingStorage(false);
    }
  };

  return (
    <div className="bg-muted/30 border border-gold/40 rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="size-9 rounded-xl bg-gold/15 text-gold grid place-items-center flex-shrink-0">
          <Database className="size-5" />
        </div>
        <div>
          <div className="text-sm font-bold text-foreground">النسخ الاحتياطي للنظام (قاعدة البيانات والصور)</div>
          <div className="text-xs text-muted-foreground">تصدير وتحميل نسخ كاملة لجميع بيانات المتجر والملفات مباشرة لجهازك</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {/* Database Backup Card */}
        <div className="border border-border/80 bg-card rounded-xl p-3.5 space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-gold">
              <Database className="size-4" />
              <span>قاعدة البيانات (.sql)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              تصدير كافة جداول وبيانات المتجر (المنتجات، الحسابات، الطلبات، الأسعار، والإعدادات) كملف SQL قياسي.
            </p>
          </div>
          <Button
            onClick={handleDownloadDb}
            disabled={downloadingDb}
            className="w-full h-9 rounded-xl bg-gold hover:bg-gold/90 text-navy font-bold flex items-center justify-center gap-1.5 shadow-sm transition text-xs mt-2"
          >
            {downloadingDb ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                جاري تجهيز الداتابيس...
              </>
            ) : (
              <>
                <Download className="size-3.5" />
                تحميل نسخة الداتابيس (.sql)
              </>
            )}
          </Button>
        </div>

        {/* Storage / Images Backup Card */}
        <div className="border border-border/80 bg-card rounded-xl p-3.5 space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-blue-500">
              <ImageIcon className="size-4" />
              <span>الصور والمرفقات (.tar.gz)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              ضغط وتحميل كافة ملفات التخزين (صور المنتجات، صور الحسابات، ومرفقات الاستبدال) بأرشيف مضغوط واحد.
            </p>
          </div>
          <Button
            onClick={handleDownloadStorage}
            disabled={downloadingStorage}
            variant="outline"
            className="w-full h-9 rounded-xl border-blue-500/40 text-blue-600 hover:bg-blue-500/10 dark:text-blue-400 font-bold flex items-center justify-center gap-1.5 shadow-sm transition text-xs mt-2"
          >
            {downloadingStorage ? (
              <>
                <Loader2 className="size-3.5 animate-spin text-blue-500" />
                جاري ضغط الصور...
              </>
            ) : (
              <>
                <Download className="size-3.5" />
                تحميل نسخة الصور (.tar.gz)
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}