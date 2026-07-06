import { useEffect, useState } from "react";
import { BellRing, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getExistingSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-client";

export function PushOptIn() {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (!isPushSupported()) {
      setSupported(false);
      return;
    }
    setPermission(Notification.permission);
    (async () => {
      const sub = await getExistingSubscription();
      setEnabled(!!sub);
    })();
  }, []);

  if (!supported) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (enabled) {
        const res = await unsubscribeFromPush();
        if (!res.ok) toast.error(res.error ?? "تعذّر إيقاف الإشعارات");
        else {
          toast.success("تم إيقاف إشعارات الاستبدال");
          setEnabled(false);
        }
      } else {
        const res = await subscribeToPush();
        if (!res.ok) toast.error(res.error ?? "تعذّر تفعيل الإشعارات");
        else {
          toast.success("تم تفعيل إشعارات الاستبدال");
          setEnabled(true);
          setPermission(Notification.permission);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const blocked = permission === "denied";

  return (
    <div className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
      <div className={`size-10 rounded-full grid place-items-center ${enabled ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
        {enabled ? <BellRing className="size-5" /> : <BellOff className="size-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-navy">إشعارات تحديث الاستبدال</div>
        <div className="text-[11px] text-muted-foreground line-clamp-2">
          {blocked
            ? "تم منع الإشعارات من إعدادات المتصفح. فعّلها يدويًا لتلقّي التحديثات."
            : enabled
            ? "ستصلك رسالة عند كل تغيير في حالة طلبك."
            : "فعّل الإشعارات لتصلك تحديثات حالة طلب الاستبدال فورًا."}
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy || blocked}
        className={`h-9 px-3 rounded-full text-xs font-bold border ${enabled ? "border-border hover:bg-muted" : "bg-navy text-primary-foreground border-navy hover:bg-navy/90"} disabled:opacity-50`}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : enabled ? "إيقاف" : "تفعيل"}
      </button>
    </div>
  );
}