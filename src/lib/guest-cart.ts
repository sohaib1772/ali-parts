// Guest cart stored in localStorage. Independent from the DB cart used by
// signed-in users; nothing else in the app is changed by this module.

const KEY = "aliparts.guest_cart.v1";
const TOKENS_KEY = "aliparts.guest_orders.v1";

export type GuestCartItem = {
  product_id: string;
  quantity: number;
  side: "LH" | "RH" | "PAIR" | null;
  note?: string | null;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readGuestCart(): GuestCartItem[] {
  if (typeof window === "undefined") return [];
  return safeParse<GuestCartItem[]>(window.localStorage.getItem(KEY), []);
}

function writeGuestCart(items: GuestCartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
  try {
    window.dispatchEvent(new CustomEvent("guest-cart:changed"));
    window.dispatchEvent(new CustomEvent("cart:changed", { detail: { delta: 0, bump: true } }));
  } catch {}
}

export function addGuestCartItem(item: GuestCartItem) {
  const items = readGuestCart();
  const idx = items.findIndex(
    (i) => i.product_id === item.product_id && (i.side ?? null) === (item.side ?? null),
  );
  if (idx >= 0) {
    items[idx] = { ...items[idx], quantity: items[idx].quantity + item.quantity };
  } else {
    items.push(item);
  }
  writeGuestCart(items);
}

export function updateGuestCartItem(
  index: number,
  patch: Partial<GuestCartItem>,
) {
  const items = readGuestCart();
  if (!items[index]) return;
  items[index] = { ...items[index], ...patch };
  if ((items[index].quantity ?? 0) <= 0) items.splice(index, 1);
  writeGuestCart(items);
}

export function removeGuestCartItem(index: number) {
  const items = readGuestCart();
  items.splice(index, 1);
  writeGuestCart(items);
}

export function clearGuestCart() {
  writeGuestCart([]);
}

export function guestCartCount(): number {
  return readGuestCart().reduce((s, i) => s + i.quantity, 0);
}

// ---- Guest order tokens (for retrieving order details/tracking) ----
export type GuestOrderRef = { order_number: string; guest_token: string; created_at: string };

export function readGuestOrders(): GuestOrderRef[] {
  if (typeof window === "undefined") return [];
  return safeParse<GuestOrderRef[]>(window.localStorage.getItem(TOKENS_KEY), []);
}

export function saveGuestOrder(ref: GuestOrderRef) {
  if (typeof window === "undefined") return;
  const list = readGuestOrders().filter((r) => r.order_number !== ref.order_number);
  list.unshift(ref);
  window.localStorage.setItem(TOKENS_KEY, JSON.stringify(list.slice(0, 20)));
}

export function findGuestToken(orderNumber: string): string | null {
  return readGuestOrders().find((r) => r.order_number === orderNumber)?.guest_token ?? null;
}

export function findGuestTokenById(_orderId: string): string | null {
  // Not indexed by id; kept for API symmetry.
  return null;
}