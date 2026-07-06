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

export function whatsappLink(text: string, number?: string): string {
  const n = (number || WHATSAPP_NUMBER).replace(/\D/g, "");
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}