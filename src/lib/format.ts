export function formatIQD(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  if (!isFinite(n)) return "0 د.ع";
  return `${new Intl.NumberFormat("ar-IQ").format(Math.round(n))} د.ع`;
}

/** Iraqi dinar formatted with Latin (ASCII) digits — for invoices/receipts. */
export function formatIQDEn(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  if (!isFinite(n)) return "0 د.ع";
  return `${new Intl.NumberFormat("en-US").format(Math.round(n))} د.ع`;
}

export function formatUSD(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  if (!isFinite(n)) return "$0";
  return `$${n.toFixed(0)}`;
}

export function formatArabicDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Date with Latin digits — used for printable invoices. */
export function formatDateEn(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const WHATSAPP_NUMBER = "9647800000000";

/** Normalizes any Iraqi phone number into wa.me format (9647XXXXXXXX). */
export function formatIraqiWhatsAppNumber(input: string): string {
  let digits = input.replace(/\D/g, "");

  if (digits.startsWith("00964")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("964")) {
    return digits;
  }

  if (digits.startsWith("0") && digits.length === 11) {
    return `964${digits.slice(1)}`;
  }

  if (digits.length === 10 && digits.startsWith("7")) {
    return `964${digits}`;
  }

  return digits;
}

export function whatsappLink(text: string, number?: string): string {
  const n = formatIraqiWhatsAppNumber(number || WHATSAPP_NUMBER);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

/** Builds the Arabic WhatsApp order message shared on the success screen. */
export function buildOrderWhatsAppMessage(order: any, items: any[], customer: any): string {
  const addr = (order?.address ?? {}) as Record<string, any>;
  const lines: string[] = [];
  lines.push(`🛒 *طلب جديد*`);
  lines.push(`رقم الطلب: #${order.order_number ?? String(order.id).slice(0, 8)}`);
  lines.push("");
  lines.push(`👤 الاسم: ${addr.full_name || customer?.full_name || "—"}`);
  const phone = addr.phone || customer?.phone;
  if (phone) lines.push(`📞 الهاتف: ${phone}`);
  const addrParts = [addr.city, addr.area, addr.street].filter(Boolean).join(" · ");
  if (addrParts) lines.push(`📍 العنوان: ${addrParts}`);
  if (addr.notes) lines.push(`📝 ملاحظات العنوان: ${addr.notes}`);
  lines.push("");
  lines.push(`🧾 القطع (${items?.length ?? 0}):`);
  (items ?? []).forEach((it: any, i: number) => {
    const side = it.side === "LH" ? " · يسار" : it.side === "RH" ? " · يمين" : it.side === "PAIR" ? " · تخم" : "";
    lines.push(`${i + 1}. ${it.name_ar}${side} ×${it.quantity} — ${formatIQD(Number(it.unit_price_iqd) * it.quantity)}`);
    if (it.oem_number) lines.push(`   OEM: ${it.oem_number}`);
  });
  lines.push("");
  lines.push(`💰 الإجمالي: ${formatIQD(order.total_iqd)}`);
  lines.push(`💳 الدفع: ${order.payment_method === "cod" ? "عند الاستلام" : "حوالة"}`);
  if (order.notes) lines.push(`📌 ملاحظة الطلب: ${order.notes}`);
  return lines.join("\n");
}
