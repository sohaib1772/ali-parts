import type { LucideIcon } from "lucide-react";
import {
  Inbox,
  PackageCheck,
  Package,
  Truck,
  Bike,
  CheckCircle2,
  XCircle,
  Circle,
} from "lucide-react";

export function statusLabel(s: string): string {
  const m: Record<string, string> = {
    received: "تم الاستلام",
    preparing: "جاري التجهيز",
    packed: "تم التغليف",
    shipped: "شحن للتوصيل",
    out_for_delivery: "خرج للتوصيل",
    delivered: "تم التسليم",
    cancelled: "ملغى",
  };
  return m[s] ?? s;
}

export function statusColor(s: string): string {
  const m: Record<string, string> = {
    received: "bg-blue-100 text-blue-700 border border-blue-200",
    preparing: "bg-amber-100 text-amber-700 border border-amber-200",
    packed: "bg-orange-100 text-orange-700 border border-orange-200",
    shipped: "bg-indigo-100 text-indigo-700 border border-indigo-200",
    out_for_delivery: "bg-purple-100 text-purple-700 border border-purple-200",
    delivered: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    cancelled: "bg-red-100 text-red-700 border border-red-200",
  };
  return m[s] ?? "bg-muted text-navy border border-border";
}

export function statusIcon(s: string): LucideIcon {
  const m: Record<string, LucideIcon> = {
    received: Inbox,
    preparing: PackageCheck,
    packed: Package,
    shipped: Truck,
    out_for_delivery: Bike,
    delivered: CheckCircle2,
    cancelled: XCircle,
  };
  return m[s] ?? Circle;
}