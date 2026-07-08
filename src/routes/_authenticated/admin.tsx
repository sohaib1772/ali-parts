import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useStaffPermissions, useAdminAccessStatus, uploadProductImage, uploadMediaFile, settingsQuery } from "@/lib/admin";
import {
  categoriesQuery,
  brandsQuery,
  bannersQuery,
  carModelsQuery,
  type CarModel,
} from "@/lib/queries";
import { VehicleBar, getSavedVehicle, useSavedVehicle } from "@/components/vehicle-picker";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Plus, Pencil, Trash2, Upload, ShieldAlert, Package, Image as ImageIcon, Tags, Settings as SettingsIcon, ClipboardList, Phone, MapPin, User as UserIcon, Copy, StickyNote, Receipt, Search as SearchIcon, Ban, CheckCircle2, History, Users as UsersIcon, KeyRound, Loader2, Repeat, Boxes, ArrowUp, ArrowDown, UserPlus, ShieldCheck } from "lucide-react";
import { BellRing, MailCheck, MailX, Clock } from "lucide-react";
import { Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { runDiagnostics, type DiagnosticsReport, type CheckStatus } from "@/lib/diagnostics.functions";
import { adminUpdateReplacementStatus } from "@/lib/replacement-admin.functions";
import { useServerFn } from "@tanstack/react-start";
import { WhatsappIcon } from "@/components/icons";
import { formatIQD, whatsappLink } from "@/lib/format";
import { statusLabel, statusColor } from "@/lib/order-status";
import { PrintableInvoice, InvoicePreviewDialog } from "@/components/printable-invoice";
import { adminListUsers, adminSetUserBlocked, adminSetUserPassword } from "@/lib/admin.functions";
import { adminOtpStatus, requestAdminOtp, verifyAdminOtp } from "@/lib/admin-otp.functions";
import { createStaff, updateStaff, deleteStaff, listStaff } from "@/lib/staff.functions";
import {
  previewBulkPriceUpdate,
  applyBulkPriceUpdate,
  listPriceBackups,
  restorePriceBackup,
} from "@/lib/bulk-price.functions";
import { broadcastPricesChanged } from "@/lib/price-sync";
import { normalizePhone } from "@/lib/phone-auth";

const STATUSES = ["received", "preparing", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"] as const;

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
        <div className="space-y-2">
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
      await verifyFn({ data: { code } });
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
          الرمز صالح لمدة 10 دقائق. جلسة التحقق تدوم 8 ساعات.
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
    queryFn: () => otpStatusFn(),
    enabled: hasAnyAccess && !isLoading,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <PageShell title="لوحة الإدارة">
        <div className="px-4 pt-16 flex flex-col items-center text-center gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">جاري التحقق من الصلاحيات…</p>
        </div>
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell title="لوحة الإدارة">
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
      <PageShell title="لوحة الإدارة">
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
      <PageShell title="لوحة الإدارة">
        <div className="px-4 pt-16 flex flex-col items-center text-center gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">جاري التحقق…</p>
        </div>
      </PageShell>
    );
  }

  if (otp.required && !otp.verified) {
    return (
      <PageShell title="تحقق ثنائي">
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

  return (
    <PageShell title="لوحة الإدارة">
      <div className="px-4 pt-3 pb-6">
        <PermissionsBadge
          isAdmin={isAdmin}
          canOrders={canOrders}
          canProducts={canProducts}
          canReplacements={canReplacements}
          canBlock={canBlock}
        />
        <Tabs defaultValue={defaultTab}>
          <TabsList className="w-full grid grid-cols-4 h-auto gap-1">
            {canProducts && (
              <TabsTrigger value="products" className="flex-col gap-1 py-2 text-[10px]"><Package className="size-4" />منتجات</TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="banners" className="flex-col gap-1 py-2 text-[10px]"><ImageIcon className="size-4" />عروض</TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="taxonomy" className="flex-col gap-1 py-2 text-[10px]"><Tags className="size-4" />تصنيفات</TabsTrigger>
            )}
            {canOrders && (
              <TabsTrigger value="orders" className="flex-col gap-1 py-2 text-[10px]"><ClipboardList className="size-4" />طلبات</TabsTrigger>
            )}
            {canReplacements && (
              <TabsTrigger value="replacements" className="flex-col gap-1 py-2 text-[10px]"><Repeat className="size-4" />استبدال</TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="users" className="flex-col gap-1 py-2 text-[10px]"><UsersIcon className="size-4" />مستخدمون</TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="staff" className="flex-col gap-1 py-2 text-[10px]"><ShieldCheck className="size-4" />موظفون</TabsTrigger>
            )}
            {canBlock && (
              <TabsTrigger value="block-log" className="flex-col gap-1 py-2 text-[10px]"><History className="size-4" />سجل الحظر</TabsTrigger>
            )}
            {canProducts && (
              <TabsTrigger value="stock" className="flex-col gap-1 py-2 text-[10px]"><Boxes className="size-4" />سجل المخزون</TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="settings" className="flex-col gap-1 py-2 text-[10px]"><SettingsIcon className="size-4" />إعدادات</TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="diagnostics" className="flex-col gap-1 py-2 text-[10px]"><Activity className="size-4" />تشخيص</TabsTrigger>
            )}
          </TabsList>

          {canProducts && <TabsContent value="products" className="mt-4"><ProductsAdmin /></TabsContent>}
          {isAdmin && <TabsContent value="banners" className="mt-4"><BannersAdmin /></TabsContent>}
          {isAdmin && <TabsContent value="taxonomy" className="mt-4"><TaxonomyAdmin /></TabsContent>}
          {canOrders && <TabsContent value="orders" className="mt-4"><OrdersAdmin /></TabsContent>}
          {canReplacements && <TabsContent value="replacements" className="mt-4"><ReplacementsAdmin /></TabsContent>}
          {isAdmin && <TabsContent value="users" className="mt-4"><UsersAdmin /></TabsContent>}
          {isAdmin && <TabsContent value="staff" className="mt-4"><StaffAdmin /></TabsContent>}
          {canBlock && <TabsContent value="block-log" className="mt-4"><BlockLogAdmin /></TabsContent>}
          {canProducts && <TabsContent value="stock" className="mt-4"><StockMovementsAdmin /></TabsContent>}
          {isAdmin && <TabsContent value="settings" className="mt-4"><SettingsAdmin /></TabsContent>}
          {isAdmin && <TabsContent value="diagnostics" className="mt-4"><DiagnosticsAdmin /></TabsContent>}
        </Tabs>
      </div>
    </PageShell>
  );
}

/* ---------------- Users ---------------- */

function UsersAdmin() {
  const [search, setSearch] = useState("");
  const [pwOpen, setPwOpen] = useState(false);
  const [pwUser, setPwUser] = useState<{ id: string; label: string } | null>(null);
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => adminListUsers(),
    refetchInterval: 30_000,
  });

  const users = data?.users ?? [];
  const filtered = (() => {
    const s = search.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) =>
      [u.full_name, u.email, u.phone, u.profile_phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  })();

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
    setSaving(true);
    try {
      await adminSetUserPassword({ data: { user_id: pwUser.id, password: pw } });
      toast.success("تم تحديث كلمة السر");
      setPwOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر التحديث");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gradient-navy text-primary-foreground rounded-2xl p-4 shadow-luxe">
          <div className="text-[11px] text-gold font-bold">إجمالي المستخدمين</div>
          <div className="text-3xl font-black leading-tight mt-0.5">{data?.total ?? "—"}</div>
        </div>
        <div className="bg-gradient-gold text-navy rounded-2xl p-4 shadow-gold">
          <div className="text-[11px] font-bold opacity-70">متصلون الآن</div>
          <div className="text-3xl font-black leading-tight mt-0.5 flex items-center gap-2">
            {data?.active ?? "—"}
            <span className="size-2.5 rounded-full bg-success animate-pulse" />
          </div>
          <div className="text-[10px] opacity-70 mt-1">آخر دخول خلال 15 دقيقة</div>
        </div>
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

      {isLoading ? (
        <div className="text-center text-sm text-muted-foreground py-8">جاري التحميل…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8">لا يوجد مستخدمون مطابقون</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => {
            const displayPhone = u.profile_phone || u.phone;
            return (
              <div key={u.id} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
                <div className={`size-11 rounded-full grid place-items-center font-black text-lg shrink-0 ${u.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                  {(u.full_name?.[0] ?? u.email?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 text-sm">
                  <div className="font-bold truncate flex items-center gap-1.5">
                    {u.full_name || "بلا اسم"}
                    {u.is_blocked && <Ban className="size-3.5 text-destructive" />}
                    {u.is_active && <span className="text-[9px] font-black text-success bg-success/10 px-1.5 py-0.5 rounded-full">متصل</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate" dir="ltr">
                    {displayPhone ? `+${String(displayPhone).replace(/\D/g, "")}` : (u.email ?? "—")}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    آخر دخول: {fmt(u.last_sign_in_at)}
                  </div>
                </div>
                <button
                  onClick={() => openPw(u)}
                  className="h-9 px-3 rounded-lg border border-gold/40 text-gold text-xs font-bold flex items-center gap-1 hover:bg-gold/10 transition"
                >
                  <KeyRound className="size-3.5" /> كلمة السر
                </button>
              </div>
            );
          })}
        </div>
      )}

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
            <Button className="w-full" onClick={submitPw} disabled={saving}>
              {saving ? <><Loader2 className="size-4 me-1 animate-spin" /> جاري الحفظ…</> : "حفظ كلمة السر الجديدة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
        <div className="space-y-2">
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
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "تعديل موظف" : "إضافة موظف"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
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
            <div>
              <Label className="text-xs mb-2 block">الصلاحيات</Label>
              <div className="space-y-2">
                <PermRow label="إدارة الطلبات" desc="عرض وتعديل حالة الطلبات وطباعة الفواتير" checked={form.can_orders} onChange={(v) => setForm({ ...form, can_orders: v })} />
                <PermRow label="إدارة المنتجات والمخزون" desc="إضافة/تعديل المنتجات وتحديث الكميات" checked={form.can_products} onChange={(v) => setForm({ ...form, can_products: v })} />
                <PermRow label="إدارة طلبات الاستبدال والتعليقات" desc="الرد على المستخدمين ومعالجة الاستبدال" checked={form.can_replacements} onChange={(v) => setForm({ ...form, can_replacements: v })} />
                <PermRow label="حظر المستخدمين من التعليق" desc="حظر ورفع الحظر عن المستخدمين المسيئين وعرض سجل الحظر" checked={form.can_block} onChange={(v) => setForm({ ...form, can_block: v })} />
              </div>
            </div>
            <Button className="w-full" onClick={save} disabled={busy}>
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

type ProductForm = {
  id?: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  oem_number: string;
  price_iqd: string;
  compare_price_iqd: string;
  shipping_iqd: string;
  category_id: string;
  brand_id: string;
  images: string[];
  in_stock: boolean;
  stock_qty: string;
  is_featured: boolean;
  is_deal: boolean;
  compatible_models: string[];
  deal_expires_at: string;
  condition: "new" | "used";
};

const emptyProduct: ProductForm = {
  name_ar: "", name_en: "", description_ar: "", oem_number: "",
  price_iqd: "", compare_price_iqd: "", shipping_iqd: "", category_id: "", brand_id: "",
  images: [], in_stock: true, is_featured: false, is_deal: false,
  compatible_models: [], deal_expires_at: "", stock_qty: "0",
  condition: "new",
};

function ProductsAdmin() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyProduct);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteProduct, setDeleteProduct] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin", "products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const filteredProducts = (() => {
    const s = search.trim().toLowerCase();
    if (!s) return products;
    return products.filter((p: any) =>
      [p.name_ar, p.name_en, p.oem_number]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(s)),
    );
  })();
  const { data: categories = [] } = useQuery(categoriesQuery());
  const { data: brands = [] } = useQuery(brandsQuery());
  const { data: carModels = [] } = useQuery(carModelsQuery());
  const savedVehicle = useSavedVehicle();

  const openNew = () => { setForm(emptyProduct); setOpen(true); };
  const openEdit = (p: any) => {
    setForm({
      id: p.id,
      name_ar: p.name_ar ?? "",
      name_en: p.name_en ?? "",
      description_ar: p.description_ar ?? "",
      oem_number: p.oem_number ?? "",
      price_iqd: String(p.price_iqd ?? ""),
      compare_price_iqd: String(p.compare_price_iqd ?? ""),
      shipping_iqd: String(p.shipping_iqd ?? ""),
      category_id: p.category_id ?? "",
      brand_id: p.brand_id ?? "",
      images: p.images ?? [],
      in_stock: !!p.in_stock,
      stock_qty: String(p.stock_qty ?? 0),
      is_featured: !!p.is_featured,
      is_deal: !!p.is_deal,
      compatible_models: p.compatible_models ?? [],
      deal_expires_at: p.deal_expires_at ? new Date(p.deal_expires_at).toISOString().slice(0, 16) : "",
      condition: (p.condition === "used" ? "used" : "new"),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name_ar.trim() || !form.price_iqd) {
      toast.error("الاسم والسعر مطلوبان");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name_ar: form.name_ar,
        name_en: form.name_en || null,
        description_ar: form.description_ar || null,
        oem_number: form.oem_number || null,
        price_iqd: Number(form.price_iqd),
        price_usd: Number(form.price_iqd) / 1310,
        compare_price_iqd: form.compare_price_iqd ? Number(form.compare_price_iqd) : null,
        shipping_iqd: form.shipping_iqd ? Number(form.shipping_iqd) : 0,
        category_id: form.category_id || null,
        brand_id: form.brand_id || null,
        images: form.images,
        in_stock: form.in_stock,
        stock_qty: form.stock_qty ? Math.max(0, Math.floor(Number(form.stock_qty))) : 0,
        is_featured: form.is_featured,
        is_deal: form.is_deal,
        compatible_models: form.compatible_models.length > 0 ? form.compatible_models : null,
        deal_expires_at: form.is_deal && form.deal_expires_at ? new Date(form.deal_expires_at).toISOString() : null,
        condition: form.condition,
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
        <div className="space-y-2">
          {filteredProducts.map((p: any) => (
            <div key={p.id} className="bg-card border border-border rounded-2xl p-3 flex gap-3 items-center">
              <div className="size-14 rounded-xl bg-muted overflow-hidden shrink-0">
                {p.images?.[0] && <img src={p.images[0]} alt="" className="size-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{p.name_ar}</div>
                <div className="text-xs text-muted-foreground">{formatIQD(p.price_iqd)}</div>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "تعديل منتج" : "إضافة منتج جديد"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <ImageUploader images={form.images} onChange={(imgs) => setForm({ ...form, images: imgs })} />
            <Field label="الاسم بالعربي *">
              <Input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
            </Field>
            <Field label="الاسم بالإنجليزي">
              <Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
            </Field>
            <Field label="الوصف">
              <Textarea value={form.description_ar} onChange={(e) => setForm({ ...form, description_ar: e.target.value })} rows={3} />
            </Field>
            <Field label="رقم القطعة (OEM)">
              <Input value={form.oem_number} onChange={(e) => setForm({ ...form, oem_number: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="السعر (د.ع) *">
                <Input type="number" value={form.price_iqd} onChange={(e) => setForm({ ...form, price_iqd: e.target.value })} />
              </Field>
              <Field label="السعر قبل الخصم">
                <Input type="number" value={form.compare_price_iqd} onChange={(e) => setForm({ ...form, compare_price_iqd: e.target.value })} />
              </Field>
            </div>
            <Field label="كلفة التوصيل لهذا المنتج (د.ع)">
              <Input type="number" value={form.shipping_iqd} onChange={(e) => setForm({ ...form, shipping_iqd: e.target.value })} inputMode="numeric" dir="ltr" placeholder="0" />
            </Field>
            <Field label="التصنيف">
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختر تصنيف" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="الماركة">
              <Select value={form.brand_id} onValueChange={(v) => setForm({ ...form, brand_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختر ماركة" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <CompatibleModelsField
              models={carModels}
              selected={form.compatible_models}
              savedVehicle={savedVehicle}
              onChange={(ids) => setForm({ ...form, compatible_models: ids })}
            />

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
            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ"}
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
  const [form, setForm] = useState<{ id?: string; title_ar: string; subtitle_ar: string; image_url: string; video_url: string; link: string }>({
    title_ar: "", subtitle_ar: "", image_url: "", video_url: "", link: "",
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
        <Button size="sm" onClick={() => { setForm({ title_ar: "", subtitle_ar: "", image_url: "", video_url: "", link: "" }); setOpen(true); }}>
          <Plus className="size-4 me-1" /> إضافة عرض
        </Button>
      </div>
      {banners.map((b) => (
        <div key={b.id} className="bg-card border border-border rounded-2xl overflow-hidden">
          {(b as any).video_url ? (
            <video src={(b as any).video_url} className="w-full h-32 object-cover bg-black" muted playsInline preload="metadata" poster={b.image_url || undefined} />
          ) : (
            <img src={b.image_url} alt={b.title_ar ?? ""} className="w-full h-32 object-cover" />
          )}
          <div className="p-3 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm truncate">{b.title_ar ?? "بدون عنوان"}</div>
              <div className="text-xs text-muted-foreground truncate">{b.subtitle_ar ?? ""}</div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => { setForm({ id: b.id, title_ar: b.title_ar ?? "", subtitle_ar: b.subtitle_ar ?? "", image_url: b.image_url ?? "", video_url: (b as any).video_url ?? "", link: b.link ?? "" }); setOpen(true); }}>
              <Pencil className="size-4" />
            </Button>
            <Button size="sm" variant="destructive" onClick={() => remove(b.id)} className="gap-1">
              <Trash2 className="size-4" /> حذف
            </Button>
          </div>
        </div>
      ))}

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
              <Label className="text-xs mb-1 block">فيديو (اختياري)</Label>
              {form.video_url ? (
                <div className="relative rounded-xl overflow-hidden border border-border">
                  <video src={form.video_url} className="w-full max-h-48 bg-black" controls playsInline preload="metadata" />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, video_url: "" })}
                    className="absolute top-1 end-1 size-7 rounded-full bg-destructive text-white grid place-items-center"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={uploadingVideo}
                  className="w-full h-24 rounded-xl border-2 border-dashed border-border grid place-items-center text-muted-foreground hover:bg-muted transition text-xs gap-1"
                >
                  {uploadingVideo ? (
                    <div className="w-full px-4">
                      <div className="text-[11px] font-bold mb-1">جاري الرفع… {Math.round(videoProgress * 100)}%</div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-gold transition-all" style={{ width: `${videoProgress * 100}%` }} />
                      </div>
                    </div>
                  ) : (
                    <><Upload className="size-5" /> رفع فيديو</>
                  )}
                </button>
              )}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploadingVideo(true);
                  setVideoProgress(0);
                  try {
                    const url = await uploadMediaFile(f, setVideoProgress);
                    setForm((prev) => ({ ...prev, video_url: url }));
                    toast.success("تم رفع الفيديو");
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
  const [catOpen, setCatOpen] = useState(false);
  const [catForm, setCatForm] = useState<{ id?: string; name_ar: string; name_en: string; icon: string; image_url: string }>({ name_ar: "", name_en: "", icon: "", image_url: "" });

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
  const addBrand = async () => {
    const name = prompt("اسم الماركة:");
    if (!name) return;
    const { error } = await supabase.from("brands").insert({ name_ar: name, name_en: name });
    if (error) toast.error(error.message);
    else { toast.success("تمت الإضافة"); qc.invalidateQueries({ queryKey: ["brands"] }); }
  };
  const removeBrand = async (id: string) => {
    if (!confirm("حذف الماركة؟")) return;
    const { error } = await supabase.from("brands").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["brands"] });
  };

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">التصنيفات</h3>
          <Button size="sm" onClick={addCategory}><Plus className="size-4 me-1" /> جديد</Button>
        </div>
        <div className="space-y-2">
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
        <div className="space-y-2">
          {brands.map((b) => (
            <div key={b.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-2">
              <span className="flex-1 text-sm font-semibold">{b.name_ar}</span>
              <Button size="icon" variant="ghost" onClick={() => removeBrand(b.id)}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      </section>
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
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"single" | "all">("single");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("orders").update({ status: status as never }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم التحديث");
    qc.invalidateQueries({ queryKey: ["admin", "orders"] });
  };

  const openDeleteSingle = (id: string) => {
    setConfirmMode("single");
    setConfirmId(id);
    setConfirmOpen(true);
  };

  const openDeleteAll = () => {
    if (!orders.length) return;
    setConfirmMode("all");
    setConfirmId(null);
    setConfirmOpen(true);
  };

  const executeDelete = async () => {
    setDeleting(true);
    setConfirmOpen(false);
    if (confirmMode === "single" && confirmId) {
      const { error } = await supabase.from("orders").delete().eq("id", confirmId);
      setDeleting(false);
      if (error) { toast.error(error.message); return; }
      toast.success("تم حذف الطلب");
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    } else {
      const ids = orders.map((o: any) => o.id);
      const { error } = await supabase.from("orders").delete().in("id", ids);
      setDeleting(false);
      if (error) { toast.error(error.message); return; }
      toast.success("تم حذف جميع الطلبات");
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    }
    setConfirmId(null);
  };

  if (isLoading) return <div className="text-center text-sm text-muted-foreground py-8">جاري التحميل...</div>;
  if (!orders.length) return <div className="text-center text-sm text-muted-foreground py-8">لا توجد طلبات</div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{orders.length} طلب</span>
        <button
          onClick={openDeleteAll}
          disabled={deleting}
          className="h-9 px-3 rounded-xl border border-destructive/40 text-destructive text-xs font-bold flex items-center gap-1.5 hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 className="size-3.5" /> حذف جميع الطلبات
        </button>
      </div>
      {orders.map((o: any) => (
        <OrderAdminCard key={o.id} order={o} onStatusChange={updateStatus} onDelete={openDeleteSingle} />
      ))}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl" className="max-w-sm">
          <AlertDialogHeader className="items-center sm:items-center">
            <div className="size-12 rounded-full bg-destructive/10 grid place-items-center mb-2">
              <AlertTriangle className="size-6 text-destructive" />
            </div>
            <AlertDialogTitle className="text-base sm:text-lg">
              {confirmMode === "all" ? "حذف جميع الطلبات" : "حذف الطلب"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              {confirmMode === "all"
                ? `سيتم حذف ${orders.length} طلب بشكل نهائي. لا يمكن التراجع عن هذا الإجراء.`
                : "سيتم حذف هذا الطلب بشكل نهائي. لا يمكن التراجع عن هذا الإجراء."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-col-reverse gap-2">
            <AlertDialogCancel className="w-full mt-0">
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={executeDelete}
              disabled={deleting}
            >
              {deleting ? "جاري الحذف..." : "حذف نهائي"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OrderAdminCard({ order: o, onStatusChange, onDelete }: { order: any; onStatusChange: (id: string, status: string) => void; onDelete: (id: string) => void }) {
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
    <div className="bg-card border border-border rounded-2xl p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-mono text-muted-foreground">#{(o.order_number ?? o.id).toString().slice(0, 10)}</div>
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
        <div className="grid grid-cols-2 gap-2">
          <a href={whatsappLink(`مرحباً، بخصوص طلبك #${(o.order_number ?? o.id).toString().slice(0, 10)}`, phoneDigits)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 h-9 rounded-lg bg-whatsapp text-white text-xs font-bold">
            <WhatsappIcon className="size-4" /> واتساب
          </a>
          <a href={`tel:+${phoneDigits}`} className="flex items-center justify-center gap-1.5 h-9 rounded-lg bg-navy text-primary-foreground text-xs font-bold">
            <Phone className="size-4" /> اتصال
          </a>
        </div>
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
      <button
        onClick={() => onDelete(o.id)}
        className="w-full h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/10 transition"
      >
        <Trash2 className="size-4" /> حذف الطلب نهائياً
      </button>
    </div>
  );
}

function InvoiceActions({ order, items, customer }: { order: any; items: any[]; customer: { full_name: string | null; phone: string | null } | null }) {
  const [open, setOpen] = useState(false);
  const domId = `admin-invoice-${order.id}`;
  const previewId = `admin-invoice-preview-${order.id}`;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 h-9 rounded-lg bg-gradient-gold text-navy text-xs font-bold shadow-gold"
      >
        <Receipt className="size-4" /> معاينة الفاتورة
      </button>
      <PrintableInvoice order={order} items={items} customer={customer} domId={domId} />
      <InvoicePreviewDialog
        order={order}
        items={items}
        customer={customer}
        open={open}
        onOpenChange={setOpen}
        domId={previewId}
      />
    </>
  );
}

/* ---------------- Settings ---------------- */

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
    <div className="space-y-4">
      <Field label="اسم المتجر">
        <Input value={nameVal} onChange={(e) => setName(e.target.value)} placeholder="Ali Parts" />
      </Field>
      <Field label="الشعار الفرعي (تحت الاسم)">
        <Input value={taglineVal} onChange={(e) => setTagline(e.target.value)} placeholder="قطع أصلية · العراق" />
      </Field>
      <div>
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
      <div>
        <Label className="text-xs mb-1 block">صورة واجهة المحل</Label>
        <ImageUploader
          images={frontImageVal ? [frontImageVal] : []}
          max={1}
          onChange={(imgs) => setFrontImage(imgs[0] ?? "")}
        />
        <p className="text-xs text-muted-foreground mt-1">تظهر في صفحة من نحن.</p>
      </div>
      <Field label="نبذة عن المتجر (يظهر في من نحن)">
        <Textarea value={aboutVal} onChange={(e) => setAbout(e.target.value)} rows={4} placeholder="متجر متخصص في بيع قطع غيار..." />
      </Field>
      <div className="bg-muted/30 border border-border rounded-2xl p-3 space-y-2">
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
      <BulkUsdPriceUpdate />
      <UsdFormulaChecker />
      <div className="bg-muted/30 border border-border rounded-2xl p-3 space-y-3">
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
      <Button className="w-full" onClick={save} disabled={saving}>
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

function BulkUsdPriceUpdate() {
  const qc = useQueryClient();
  const { data: settings = {} } = useQuery(settingsQuery());
  const previewFn = useServerFn(previewBulkPriceUpdate);
  const applyFn = useServerFn(applyBulkPriceUpdate);
  const listFn = useServerFn(listPriceBackups);
  const restoreFn = useServerFn(restorePriceBackup);

  const [oldRate, setOldRate] = useState<string | null>(null);
  const [newRate, setNewRate] = useState<string | null>(null);
  const [rounding, setRounding] = useState<string | null>(null);
  const oldRateVal = oldRate ?? String(settings.usd_rate_old ?? "1500");
  const newRateVal = newRate ?? String(settings.usd_rate_new ?? settings.usd_rate_old ?? "1500");
  const roundingVal = rounding ?? String(settings.usd_rate_rounding ?? "500");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<null | {
    items: Array<{ id: string; name_ar: string; old_price: number; new_price: number; diff: number; excluded: boolean }>;
    count: number;
    adjustment?: number;
  }>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: backups = [], refetch: refetchBackups } = useQuery({
    queryKey: ["price_backups"],
    queryFn: () => listFn(),
  });

  const doPreview = async () => {
    const oldN = Number(oldRateVal);
    const newN = Number(newRateVal);
    if (!(oldN > 0) || !(newN > 0)) {
      toast.error("أدخل سعر دولار صحيح");
      return;
    }
    setLoading(true);
    try {
      const res = await previewFn({
        data: {
          old_rate: oldN,
          new_rate: newN,
          rounding: Number(roundingVal) || 0,
          excluded_ids: Array.from(excluded),
        },
      });
      setPreview(res);
    } catch (e: any) {
      toast.error(e.message ?? "خطأ في المعاينة");
    } finally {
      setLoading(false);
    }
  };

  const doApply = async () => {
    setApplying(true);
    try {
      const oldN = Number(oldRateVal);
      const newN = Number(newRateVal);
      const roundN = Number(roundingVal) || 0;
      const res = await applyFn({
        data: {
          old_rate: oldN,
          new_rate: newN,
          rounding: roundN,
          excluded_ids: Array.from(excluded),
          note: note || undefined,
        },
      });
      // Persist the rates so they load across sessions. After a successful
      // apply, keep whatever values the admin typed so they can freely edit
      // the old rate later (don't auto-overwrite it with the new rate).
      await supabase.from("app_settings").upsert([
        { key: "usd_rate_old", value: String(oldN), updated_at: new Date().toISOString() },
        { key: "usd_rate_new", value: String(newN), updated_at: new Date().toISOString() },
        { key: "usd_rate_rounding", value: String(roundN), updated_at: new Date().toISOString() },
      ]);
      qc.invalidateQueries({ queryKey: ["app_settings"] });
      setOldRate(null);
      setNewRate(null);
      setRounding(null);
      toast.success(`تم تحديث ${res.updated} منتج`);
      setConfirmOpen(false);
      setPreview(null);
      await invalidateAllPriceCaches(qc);
      refetchBackups();
    } catch (e: any) {
      toast.error(e.message ?? "فشل التحديث");
    } finally {
      setApplying(false);
    }
  };

  const doRestore = async (id: string) => {
    if (!confirm("استعادة الأسعار من هذه النسخة الاحتياطية؟")) return;
    try {
      const res = await restoreFn({ data: { backup_id: id } });
      toast.success(`تم استعادة ${res.restored} منتج`);
      await invalidateAllPriceCaches(qc);
    } catch (e: any) {
      toast.error(e.message ?? "فشل الاستعادة");
    }
  };

  const toggleExclude = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreview(null);
  };

  const changedCount = preview?.items.filter((i) => !i.excluded && i.diff !== 0).length ?? 0;

  return (
    <div className="bg-muted/30 border border-border rounded-2xl p-3 space-y-3">
      <div className="text-sm font-bold text-gold flex items-center gap-2">
        💵 تحديث جماعي للأسعار حسب سعر الدولار
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="سعر الدولار القديم">
          <Input
            type="number"
            value={oldRateVal}
            onChange={(e) => { setOldRate(e.target.value); setPreview(null); }}
            inputMode="numeric"
            dir="ltr"
            placeholder="1500"
          />
        </Field>
        <Field label="سعر الدولار الجديد">
          <Input
            type="number"
            value={newRateVal}
            onChange={(e) => { setNewRate(e.target.value); setPreview(null); }}
            inputMode="numeric"
            dir="ltr"
            placeholder="1600"
          />
        </Field>
      </div>
      <Field label="التقريب">
        <Select value={roundingVal} onValueChange={(v) => { setRounding(v); setPreview(null); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">بدون تقريب</SelectItem>
            <SelectItem value="250">أقرب 250 د.ع</SelectItem>
            <SelectItem value="500">أقرب 500 د.ع</SelectItem>
            <SelectItem value="1000">أقرب 1000 د.ع</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="ملاحظة (اختياري)">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: تحديث بعد رفع الدولار" />
      </Field>

      <Button className="w-full" onClick={doPreview} disabled={loading} variant="secondary">
        {loading ? "جاري التحضير..." : "معاينة التغييرات"}
      </Button>

      {preview && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            سيتم تحديث <span className="text-gold font-bold">{changedCount}</span> من أصل {preview.count} منتج. اضغط على المنتج لاستثنائه.
          </div>
          {(preview.adjustment ?? 0) !== 0 && (
            <div className="text-xs text-amber-500">
              ملاحظة: الأسعار المعروضة تشمل تعديل السعر العام ({preview.adjustment! > 0 ? "+" : ""}{preview.adjustment} د.ع). إذا تريد الحساب صافي، صفّر حقل "تعديل السعر العام" أعلاه.
            </div>
          )}
          <div className="max-h-72 overflow-y-auto border border-border rounded-lg divide-y divide-border">
            {preview.items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => toggleExclude(it.id)}
                className={`w-full text-right px-2 py-1.5 flex items-center justify-between gap-2 hover:bg-muted/50 ${it.excluded ? "opacity-50 line-through" : ""}`}
              >
                <div className="text-xs truncate flex-1 text-right">{it.name_ar}</div>
                <div className="text-xs flex items-center gap-1 flex-shrink-0" dir="ltr">
                  <span className="text-muted-foreground">{formatIQD(it.old_price)}</span>
                  <span>→</span>
                  <span className="text-gold font-bold">{formatIQD(it.new_price)}</span>
                  {it.diff !== 0 && !it.excluded && (
                    <span className={it.diff > 0 ? "text-green-500" : "text-red-500"}>
                      ({it.diff > 0 ? "+" : ""}{it.diff})
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
          <Button
            className="w-full"
            onClick={() => setConfirmOpen(true)}
            disabled={changedCount === 0}
          >
            تطبيق التحديث على {changedCount} منتج
          </Button>
        </div>
      )}

      {backups.length > 0 && (
        <div className="pt-2 border-t border-border space-y-1">
          <div className="text-xs font-bold text-muted-foreground">النسخ الاحتياطية</div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {backups.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-xs bg-background rounded px-2 py-1">
                <div>
                  <div dir="ltr">{b.old_rate} → {b.new_rate} ({b.count} منتج)</div>
                  <div className="text-muted-foreground">{new Date(b.created_at).toLocaleString("ar-IQ")}</div>
                  {b.note && <div className="text-muted-foreground">{b.note}</div>}
                </div>
                <Button size="sm" variant="outline" onClick={() => doRestore(b.id)}>استعادة</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد التحديث الجماعي</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم تحديث أسعار {changedCount} منتج نهائياً في قاعدة البيانات، مع حفظ نسخة احتياطية للأسعار القديمة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={doApply} disabled={applying}>
              {applying ? "جاري..." : "تأكيد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function ImageUploader({ images, onChange, max = 6, resizeTo }: { images: string[]; onChange: (imgs: string[]) => void; max?: number; resizeTo?: number }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
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
      const { data, error } = await supabase.rpc("get_public_profiles", { _ids: userIds });
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
        filtered.map((r) => (
          <ReplacementCard
            key={r.id}
            row={r}
            profile={profileMap.get(r.user_id)}
            onStatusChange={changeStatus}
            onSaveNotes={saveNotes}
            onDelete={() => setConfirmDeleteId(r.id)}
          />
        ))
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
        <div className="flex items-center gap-2 text-xs">
          <UserIcon className="size-3.5 text-muted-foreground" />
          <span className="font-semibold">{profile.full_name ?? "بدون اسم"}</span>
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
        <ul className="space-y-2">
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