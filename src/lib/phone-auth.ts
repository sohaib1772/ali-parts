export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
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

export function phoneToEmailLegacy(phone: string) {
  return `p${phone}@aliparts.local`;
}
