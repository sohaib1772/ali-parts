import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listNotificationLogs,
  clearOldNotificationLogs,
  type NotificationLogItem,
} from "@/lib/notification-logs.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  BellRing,
  RefreshCw,
  Search as SearchIcon,
  Smartphone,
  Laptop,
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Copy,
  Trash2,
  Clock,
  User as UserIcon,
  Phone,
  Code2,
  Layers,
  Activity,
  Check,
} from "lucide-react";
import { WhatsappIcon } from "@/components/icons";

export function NotificationLogsAdmin() {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotificationLogs);
  const clearFn = useServerFn(clearOldNotificationLogs);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [selectedLog, setSelectedLog] = useState<NotificationLogItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin", "notification-logs", statusFilter, platformFilter, search],
    queryFn: () =>
      listFn({
        data: {
          status: statusFilter as any,
          platform: platformFilter as any,
          search: search.trim() || undefined,
          limit: 100,
          offset: 0,
        },
      }),
    refetchInterval: 30_000, // Live poll every 30s
  });

  const logs = data?.logs ?? [];
  const stats = data?.stats ?? {
    total24h: 0,
    failures24h: 0,
    successes24h: 0,
    iosCount: 0,
    androidCount: 0,
    webCount: 0,
  };

  const copyToClipboard = (text: string, id: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(`تم نسخ ${label}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearOld = async () => {
    setClearing(true);
    try {
      await clearFn({ data: { keepDays: 30 } });
      toast.success("تم تنظيف السجلات الأقدم من 30 يوماً بنجاح");
      refetch();
    } catch (err: any) {
      toast.error(`فشل الحذف: ${err?.message || "خطأ غير متوقع"}`);
    } finally {
      setClearing(false);
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat("ar-IQ", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(d);
    } catch {
      return iso;
    }
  };

  const getPlatformIcon = (platform: string | null) => {
    switch (platform) {
      case "ios":
        return <Smartphone className="size-4 text-purple-500" />;
      case "android":
        return <Smartphone className="size-4 text-emerald-500" />;
      case "web":
        return <Laptop className="size-4 text-sky-500" />;
      case "server":
        return <Server className="size-4 text-amber-500" />;
      default:
        return <Layers className="size-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="size-3" />
            ناجح
          </span>
        );
      case "failure":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 animate-pulse">
            <XCircle className="size-3" />
            فشل
          </span>
        );
      case "warning":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangle className="size-3" />
            تحذير
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Info className="size-3" />
            معلومة
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Header & Quick Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border/70 p-4 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 grid place-items-center text-primary">
            <BellRing className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              سجل أحداث وتوكنات الإشعارات (Notification Logs)
              {isFetching && <RefreshCw className="size-3.5 animate-spin text-muted-foreground" />}
            </h2>
            <p className="text-xs text-muted-foreground">
              متابعة حفظ توكنات أجهزة المستخدمين (iPhone و Android)، أسباب الفشل، وحالة إرسال الـ Push عبر السيرفر.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="text-xs text-muted-foreground hover:text-rose-600">
                <Trash2 className="size-3.5 ms-1" />
                تنظيف القديم
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تنظيف السجلات القديمة</AlertDialogTitle>
                <AlertDialogDescription>
                  هل تريد مسح جميع سجلات الإشعارات الأقدم من 30 يوماً؟ لن يتم حذف التوكنات النشطة وإنما السجلات المؤرشفة فقط.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearOld} disabled={clearing}>
                  {clearing ? "جاري المسح..." : "تأكيد المسح"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="text-xs font-semibold gap-1.5">
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
            <span>تحديث</span>
          </Button>
        </div>
      </div>

      {/* 2. KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Card 1: Total 24h */}
        <div className="bg-card border border-border/70 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>أحداث آخر 24 ساعة</span>
            <Activity className="size-3.5 text-blue-500" />
          </div>
          <div className="text-xl font-extrabold mt-1 text-foreground">
            {stats.total24h.toLocaleString("ar-IQ")}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            تحديث مباشر وتلقائي
          </div>
        </div>

        {/* Card 2: Devices Breakdown */}
        <div className="bg-card border border-border/70 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>الأجهزة المسجلة (24س)</span>
            <Smartphone className="size-3.5 text-purple-500" />
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1 text-sm font-bold text-purple-600 dark:text-purple-400">
              <span>iPhone:</span>
              <span>{stats.iosCount}</span>
            </div>
            <div className="text-muted-foreground text-xs">•</div>
            <div className="flex items-center gap-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">
              <span>Android:</span>
              <span>{stats.androidCount}</span>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {stats.webCount > 0 ? `+ ${stats.webCount} متصفح ويب` : "تتبع تفصيلي للنظام والموديل"}
          </div>
        </div>

        {/* Card 3: Successes */}
        <div className="bg-card border border-border/70 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>العمليات الناجحة</span>
            <CheckCircle2 className="size-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-extrabold mt-1 text-emerald-600 dark:text-emerald-400">
            {stats.successes24h.toLocaleString("ar-IQ")}
          </div>
          <div className="text-[10px] text-emerald-600/80 mt-0.5">
            توكنات مسجلة وإشعارات مسلمة
          </div>
        </div>

        {/* Card 4: Failures (Interactive Filter) */}
        <button
          onClick={() => setStatusFilter(statusFilter === "failure" ? "all" : "failure")}
          className={`border rounded-xl p-3 text-start flex flex-col justify-between transition-all ${
            statusFilter === "failure"
              ? "bg-rose-500/15 border-rose-500 ring-2 ring-rose-500/20"
              : "bg-card border-border/70 hover:border-rose-500/50"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground w-full">
            <span className="font-semibold text-rose-600 dark:text-rose-400">حالات الفشل والأخطاء</span>
            <XCircle className="size-3.5 text-rose-500" />
          </div>
          <div className="text-xl font-extrabold mt-1 text-rose-600 dark:text-rose-400">
            {stats.failures24h.toLocaleString("ar-IQ")}
          </div>
          <div className="text-[10px] text-rose-500 font-bold mt-0.5">
            {statusFilter === "failure" ? "← يتم الآن عرض الأخطاء فقط (انقر للإلغاء)" : "انقر لتصفية الأخطاء فقط"}
          </div>
        </button>
      </div>

      {/* 3. Filters Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-card border border-border/70 p-2.5 rounded-xl">
        <div className="relative">
          <SearchIcon className="size-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم، الهاتف، الجهاز، التوكن، أو نص الخطأ..."
            className="ps-9 h-9 text-xs rounded-lg"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 text-xs rounded-lg">
            <SelectValue placeholder="حالة الحدث" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            <SelectItem value="failure">الأخطاء وحالات الفشل فقط</SelectItem>
            <SelectItem value="warning">التحذيرات والتوكنات المنتهية</SelectItem>
            <SelectItem value="success">العمليات الناجحة فقط</SelectItem>
          </SelectContent>
        </Select>

        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="h-9 text-xs rounded-lg">
            <SelectValue placeholder="المنصة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع المنصات (iPhone / Android / Web)</SelectItem>
            <SelectItem value="ios">أجهزة iPhone و Apple (iOS)</SelectItem>
            <SelectItem value="android">أجهزة أندرويد (Android)</SelectItem>
            <SelectItem value="web">متصفح الويب (Web)</SelectItem>
            <SelectItem value="server">السيرفر وخادم الإرسال (Server)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 4. Logs List */}
      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
          <RefreshCw className="size-6 animate-spin text-primary" />
          <span>جاري تحميل سجلات الإشعارات...</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="py-16 text-center bg-card border border-border/70 rounded-2xl p-8 space-y-2">
          <div className="size-12 rounded-full bg-muted grid place-items-center mx-auto text-muted-foreground">
            <BellRing className="size-6" />
          </div>
          <div className="font-bold text-sm">لا توجد سجلات مطابقة للبحث أو الفلتر</div>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            ستظهر هنا كل عمليات تسجيل التوكنات عند دخول المستخدمين من iPhone و Android وأي إشعار يتم إرساله أو فشله.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const hasError = Boolean(log.error_details || log.status === "failure");
            const isCopied = copiedId === log.id;

            return (
              <div
                key={log.id}
                className={`border rounded-xl p-3.5 transition-all text-xs space-y-2.5 ${
                  log.status === "failure"
                    ? "bg-rose-500/[0.04] border-rose-500/30 dark:bg-rose-950/20"
                    : log.status === "warning"
                      ? "bg-amber-500/[0.04] border-amber-500/30 dark:bg-amber-950/20"
                      : "bg-card border-border/70 hover:border-border"
                }`}
              >
                {/* Top Row: Platform, Status, Event Title & Timestamp */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {/* Platform Tag */}
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-muted/80 text-[11px] font-bold text-foreground">
                      {getPlatformIcon(log.platform)}
                      <span>
                        {log.platform === "ios"
                          ? "iPhone / iOS"
                          : log.platform === "android"
                            ? "Android"
                            : log.platform === "web"
                              ? "Web"
                              : log.platform === "server"
                                ? "Server"
                                : "جهاز"}
                      </span>
                      {log.device_model && (
                        <span className="text-muted-foreground font-normal">
                          ({log.device_model})
                        </span>
                      )}
                    </div>

                    {/* Status Badge */}
                    {getStatusBadge(log.status)}

                    {/* Event Title */}
                    <span className="font-bold text-foreground text-xs">
                      {log.title || log.event_type}
                    </span>
                  </div>

                  {/* Timestamp */}
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="size-3" />
                    <span>{formatTime(log.created_at)}</span>
                  </div>
                </div>

                {/* Message in Arabic */}
                {log.message && (
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {log.message}
                  </p>
                )}

                {/* User & Device Details Pill Bar */}
                <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground border-t border-border/40">
                  {/* User Profile */}
                  <div className="flex items-center gap-1.5">
                    <UserIcon className="size-3 text-primary" />
                    {log.user ? (
                      <span className="font-semibold text-foreground">
                        {log.user.full_name || "مستخدم مسجل"}
                      </span>
                    ) : log.user_id ? (
                      <span className="font-mono text-[10px]">{log.user_id.slice(0, 8)}...</span>
                    ) : (
                      <span>زائر / تشغيل التطبيق</span>
                    )}
                  </div>

                  {/* Phone */}
                  {log.user?.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="size-3 text-emerald-500" />
                      <span className="font-mono text-foreground font-medium">{log.user.phone}</span>
                      <a
                        href={`https://wa.me/${log.user.phone.replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-500 hover:text-emerald-600"
                        title="واتساب"
                      >
                        <WhatsappIcon className="size-3.5 inline" />
                      </a>
                    </div>
                  )}

                  {/* OS / App Version */}
                  {log.os_version && (
                    <div>
                      <span className="text-muted-foreground/80">النظام: </span>
                      <span className="text-foreground">{log.os_version}</span>
                    </div>
                  )}

                  {log.app_version && (
                    <div>
                      <span className="text-muted-foreground/80">الإصدار: </span>
                      <span className="text-foreground">{log.app_version}</span>
                    </div>
                  )}

                  {/* Token Preview */}
                  {log.token_preview && (
                    <button
                      onClick={() => copyToClipboard(log.token_preview!, log.id, "معاينة التوكن")}
                      className="flex items-center gap-1 hover:text-foreground font-mono bg-muted/60 px-1.5 py-0.5 rounded text-[10px]"
                      title="نسخ التوكن المختصر"
                    >
                      <span>التوكن: {log.token_preview}</span>
                      {isCopied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                    </button>
                  )}

                  {/* Inspect Details Button */}
                  <div className="ms-auto">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedLog(log)}
                      className="h-6 px-2 text-[10px] text-primary hover:text-primary/90 font-bold gap-1"
                    >
                      <Code2 className="size-3" />
                      التفاصيل والـ Payload
                    </Button>
                  </div>
                </div>

                {/* Error Banner Highlight (if failed) */}
                {hasError && log.error_details && (
                  <div className="mt-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 font-mono text-[11px] leading-relaxed break-words">
                    <div className="font-bold flex items-center gap-1.5 mb-1 text-xs text-rose-600 dark:text-rose-400">
                      <XCircle className="size-3.5" />
                      سبب الفشل البرمجي (Error Reason):
                    </div>
                    {log.error_details}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Detail & Payload Dialog */}
      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold">
              <Code2 className="size-4 text-primary" />
              تفاصيل الحدث والـ Payload البرمجي
            </DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-muted/40 p-3 rounded-xl border">
                <div>
                  <span className="text-muted-foreground">نوع الحدث: </span>
                  <span className="font-bold font-mono">{selectedLog.event_type}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">الحالة: </span>
                  <span className="font-bold">{selectedLog.status}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">المنصة: </span>
                  <span className="font-bold">{selectedLog.platform || "غير محدد"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">الجهاز: </span>
                  <span className="font-bold">{selectedLog.device_model || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">نظام التشغيل: </span>
                  <span className="font-bold">{selectedLog.os_version || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">الوقت: </span>
                  <span className="font-bold font-mono">{selectedLog.created_at}</span>
                </div>
              </div>

              {selectedLog.error_details && (
                <div className="space-y-1">
                  <div className="font-bold text-rose-500">تفاصيل الخطأ الدقيقة:</div>
                  <pre className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 font-mono text-[11px] overflow-x-auto text-rose-700 dark:text-rose-300 whitespace-pre-wrap">
                    {selectedLog.error_details}
                  </pre>
                </div>
              )}

              <div className="space-y-1">
                <div className="font-bold text-muted-foreground">البيانات الإضافية (Metadata JSON):</div>
                <pre className="p-3 rounded-lg bg-muted/60 border font-mono text-[11px] overflow-x-auto text-foreground whitespace-pre-wrap">
                  {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                </pre>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2));
                    toast.success("تم نسخ كامل السجل كـ JSON");
                  }}
                  className="text-xs gap-1"
                >
                  <Copy className="size-3" />
                  نسخ كامل السجل
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
