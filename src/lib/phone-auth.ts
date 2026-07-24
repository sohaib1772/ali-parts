/**
 * Extract ASCII digits from a string while also converting
 * Arabic-Indic (٠-٩) and Persian/Urdu (۰-۹) digits and stripping
 * bidi/format control characters that RTL keyboards often inject.
 */
export function toAsciiDigits(raw: string): string {
  if (!raw) return "";
  let s = "";
  for (const ch of raw) {
    const c = ch.codePointAt(0)!;
    // Arabic-Indic 0660..0669
    if (c >= 0x0660 && c <= 0x0669) s += String(c - 0x0660);
    // Extended Arabic-Indic (Persian/Urdu) 06F0..06F9
    else if (c >= 0x06F0 && c <= 0x06F9) s += String(c - 0x06F0);
    // ASCII 0-9
    else if (c >= 0x30 && c <= 0x39) s += ch;
  }
  return s;
}

/**
 * Normalize an Iraqi mobile number to `964XXXXXXXXXX` (no `+`, 13 digits).
 * Accepts input with spaces, dashes, `+`, `00964`, `964`, or a leading `0`,
 * and both ASCII and Arabic-Indic digits.
 */
export function normalizePhone(raw: string): string | null {
  const digits = toAsciiDigits(raw ?? "");
  if (!digits) return null;
  let n = digits;
  if (n.startsWith("00964")) n = n.slice(5);
  else if (n.startsWith("964")) n = n.slice(3);
  else if (n.startsWith("0")) n = n.slice(1);
  if (n.length !== 10 || !n.startsWith("7")) return null;
  return "964" + n;
}

export function phoneToEmail(phone: string) {
  return `p${phone}@aliparts.app`;
}
