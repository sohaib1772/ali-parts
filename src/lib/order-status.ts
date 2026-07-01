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
    received: "bg-muted text-navy",
    preparing: "bg-gold/20 text-gold",
    packed: "bg-gold/20 text-gold",
    shipped: "bg-navy/10 text-navy",
    out_for_delivery: "bg-navy/10 text-navy",
    delivered: "bg-success/20 text-success",
    cancelled: "bg-destructive/20 text-destructive",
  };
  return m[s] ?? "bg-muted text-navy";
}