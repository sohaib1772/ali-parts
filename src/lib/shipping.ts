// Shipping cost computation shared by cart & checkout.
// Simple rule: `merge_delivery !== false` → item joins the shared "merged"
// shipment (MAX(shipping_iqd) wins across all merged items).
// `merge_delivery === false` → item is billed as its own independent shipment.
// `delivery_group` is ignored.

export type ShippingItem = {
  product?: {
    id?: unknown;
    shipping_iqd?: unknown;
    delivery_group?: unknown;
    merge_delivery?: unknown;
  } | null;
};

export function computeShipping(items: ReadonlyArray<ShippingItem> | null | undefined): number {
  if (!items || !Array.isArray(items)) return 0;
  const groups = new Map<string, number>();
  let anon = 0; // fallback counter for items missing an id
  for (const i of items) {
    const p = i?.product;
    if (!p) continue;
    const rawFee = Number((p as any).shipping_iqd ?? 0);
    const fee = Number.isFinite(rawFee) && rawFee > 0 ? rawFee : 0;
    const merge = (p as any).merge_delivery !== false;
    const id = typeof (p as any).id === "string" || typeof (p as any).id === "number"
      ? String((p as any).id)
      : `__anon_${anon++}`;
    const key = merge ? "g:__merged__" : `p:${id}`;
    groups.set(key, Math.max(groups.get(key) ?? 0, fee));
  }
  let sum = 0;
  for (const v of groups.values()) sum += v;
  return sum;
}

export function shipmentCount(items: ReadonlyArray<ShippingItem> | null | undefined): number {
  if (!items || !Array.isArray(items)) return 0;
  const keys = new Set<string>();
  let anon = 0;
  for (const i of items) {
    const p = i?.product;
    if (!p) continue;
    const merge = (p as any).merge_delivery !== false;
    const id = typeof (p as any).id === "string" || typeof (p as any).id === "number"
      ? String((p as any).id)
      : `__anon_${anon++}`;
    keys.add(merge ? "g:__merged__" : `p:${id}`);
  }
  return keys.size;
}