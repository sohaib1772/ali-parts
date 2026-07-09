import { Inbox, PackageCheck, Package as PackageBox, Truck, Bike, Home, XCircle, CheckCircle2 } from "lucide-react";

export const TRACK_STEPS = [
  { key: "received", label: "استلام", icon: Inbox },
  { key: "preparing", label: "تجهيز", icon: PackageCheck },
  { key: "packed", label: "تغليف", icon: PackageBox },
  { key: "shipped", label: "شحن", icon: Truck },
  { key: "out_for_delivery", label: "خرج", icon: Bike },
  { key: "delivered", label: "تسليم", icon: Home },
] as const;

interface Props {
  status: string;
  pulse?: boolean;
}

export function OrderTracking({ status, pulse }: Props) {
  if (status === "cancelled") {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700">
        <XCircle className="size-4 shrink-0" />
        <span className="text-xs font-bold">تم إلغاء الطلب</span>
      </div>
    );
  }
  if (status === "delivered") {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-emerald-700">
        <CheckCircle2 className="size-4 shrink-0" />
        <span className="text-xs font-bold">تم تسليم الطلب بنجاح</span>
      </div>
    );
  }
  const activeIdx = TRACK_STEPS.findIndex((s) => s.key === status);
  const progress = activeIdx < 0 ? 0 : (activeIdx / (TRACK_STEPS.length - 1)) * 100;
  return (
    <div className="mt-3">
      <div className="relative mb-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="absolute inset-y-0 right-0 bg-gradient-to-l from-gold via-gold to-amber-400 rounded-full transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex items-start justify-between gap-1">
        {TRACK_STEPS.map((s, i) => {
          const done = i <= activeIdx;
          const active = i === activeIdx;
          const Icon = s.icon;
          return (
            <div key={s.key} className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <div
                className={`size-6 rounded-full grid place-items-center transition ${
                  active
                    ? `bg-gold text-navy ring-2 ring-gold/40 shadow-sm ${pulse ? "animate-pulse" : ""}`
                    : done
                      ? "bg-gold/90 text-navy"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="size-3" />
              </div>
              <span
                className={`text-[9px] font-bold leading-tight text-center truncate w-full ${
                  active ? "text-gold" : done ? "text-navy" : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}