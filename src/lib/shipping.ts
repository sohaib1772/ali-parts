// Shipping cost and shipment count computation shared by cart & checkout.
// Rules:
// 1. Groups: 'small' (قطع صغيرة), 'medium' (قطع متوسطة), 'large' (قطع كبيرة).
// 2. Independent / No Group:
//    - If product has no delivery group selected, it is ALWAYS independent (fee * quantity).
// 3. Large items:
//    - Large items merging with 'large' (e.g. Bumpers) merge into large shipments respecting max_merge_qty.
//    - Large items NOT merging with 'large' (e.g. Doors, Engines) are billed independently: fee * quantity.
// 4. Merging with Large:
//    - If cart contains large shipments, any item (medium or small)
//      that includes 'large' in its merge_with_groups is absorbed at 0 extra shipping fee (taped to large item).
// 5. Medium shipment:
//    - If medium items (not absorbed into large) exist with merge enabled,
//      they pack into medium shipments (respecting max_merge_qty).
//    - Any small items with 'medium' in merge_with_groups can absorb into medium shipments.
// 6. Small shipment:
//    - Remaining small items with 'small' in merge_with_groups pack into small shipments.
// 7. Unmerged items:
//    - Items with merge disabled, no delivery group, or no compatible group in cart are billed as fee * quantity.

export type ShippingGroup = "small" | "medium" | "large";

export type ShippingItem = {
  quantity?: number | null;
  product?: {
    id?: unknown;
    shipping_iqd?: unknown;
    delivery_group?: unknown;
    merge_delivery?: unknown;
    merge_with_groups?: unknown;
    max_merge_qty?: unknown;
    specs?: {
      merge_with_groups?: unknown;
      max_merge_qty?: unknown;
      [key: string]: unknown;
    } | null;
  } | null;
};

export function normalizeDeliveryGroup(group: unknown): ShippingGroup | null {
  if (typeof group === "string") {
    const g = group.toLowerCase().trim();
    if (!g) return null;
    if (g.includes("large") || g.includes("كبير")) return "large";
    if (g.includes("medium") || g.includes("متوسط")) return "medium";
    if (g.includes("small") || g.includes("صغير")) return "small";
  }
  return null;
}

export function normalizeMergeWithGroups(
  rawGroups: unknown,
  fallbackGroup: ShippingGroup | null,
  mergeDelivery?: boolean | null
): ShippingGroup[] {
  // If product has no delivery group, it cannot merge with anything (always independent)
  if (!fallbackGroup) return [];

  if (Array.isArray(rawGroups) && rawGroups.length > 0) {
    const list: ShippingGroup[] = [];
    for (const g of rawGroups) {
      if (typeof g === "string") {
        const norm = normalizeDeliveryGroup(g);
        if (norm && !list.includes(norm)) list.push(norm);
      }
    }
    return list;
  }

  // Fallback for legacy data where merge_with_groups is not set:
  if (mergeDelivery !== false) {
    if (fallbackGroup === "large") return []; // Legacy large items default to independent unless configured
    if (fallbackGroup === "medium") return ["medium", "large"];
    return ["small", "medium", "large"];
  }

  return [];
}

type ParsedItem = {
  fee: number;
  qty: number;
  group: ShippingGroup | null;
  mergeWith: ShippingGroup[];
  canMerge: boolean;
  maxMergeQty: number | null;
};

function parseItems(items: ReadonlyArray<ShippingItem> | null | undefined): ParsedItem[] {
  if (!items || !Array.isArray(items)) return [];
  const parsed: ParsedItem[] = [];

  for (const i of items) {
    const p = i?.product;
    if (!p) continue;
    const rawFee = Number((p as any).shipping_iqd ?? 0);
    const fee = Number.isFinite(rawFee) && rawFee > 0 ? rawFee : 0;
    const qty = Math.max(1, Math.floor(Number((i as any).quantity ?? 1)));
    const group = normalizeDeliveryGroup((p as any).delivery_group);
    const mergeBool = (p as any).merge_delivery !== false;
    const rawMergeWith = (p as any).merge_with_groups ?? (p as any).specs?.merge_with_groups;
    const mergeWith = normalizeMergeWithGroups(rawMergeWith, group, mergeBool);
    const canMerge = group !== null && mergeBool && mergeWith.length > 0;

    const rawMaxQty = (p as any).max_merge_qty ?? (p as any).specs?.max_merge_qty;
    const maxMergeQty =
      typeof rawMaxQty === "number" && Number.isFinite(rawMaxQty) && rawMaxQty > 0
        ? Math.floor(rawMaxQty)
        : typeof rawMaxQty === "string" && /^\d+$/.test(rawMaxQty.trim()) && Number(rawMaxQty.trim()) > 0
        ? Number(rawMaxQty.trim())
        : null;

    parsed.push({ fee, qty, group, mergeWith, canMerge, maxMergeQty });
  }

  return parsed;
}

interface Parcel {
  maxFee: number;
  capacity: number;
  count: number;
}

interface Unit {
  fee: number;
  maxQty: number; // Infinity if no limit
}

function packParcels(units: Unit[]): { fee: number; count: number } {
  if (units.length === 0) return { fee: 0, count: 0 };

  // Sort descending by fee so higher fee items anchor parcels
  const sorted = [...units].sort((a, b) => b.fee - a.fee);
  const parcels: Parcel[] = [];

  for (const unit of sorted) {
    let placed = false;
    for (const p of parcels) {
      if (p.count < p.capacity && p.count < unit.maxQty) {
        p.count += 1;
        p.capacity = Math.min(p.capacity, unit.maxQty);
        p.maxFee = Math.max(p.maxFee, unit.fee);
        placed = true;
        break;
      }
    }
    if (!placed) {
      parcels.push({
        maxFee: unit.fee,
        capacity: unit.maxQty,
        count: 1,
      });
    }
  }

  const fee = parcels.reduce((sum, p) => sum + p.maxFee, 0);
  return { fee, count: parcels.length };
}

export function evaluateShipping(items: ReadonlyArray<ShippingItem> | null | undefined): {
  shipping: number;
  shipments: number;
} {
  const parsed = parseItems(items);
  if (parsed.length === 0) return { shipping: 0, shipments: 0 };

  // 1. Large items
  const mergeableLargeUnits: Unit[] = [];
  let largeIndependentShipping = 0;
  let largeIndependentCount = 0;

  for (const it of parsed) {
    if (it.group === "large") {
      if (it.canMerge && it.mergeWith.includes("large")) {
        const cap = it.maxMergeQty ?? Infinity;
        for (let k = 0; k < it.qty; k++) {
          mergeableLargeUnits.push({ fee: it.fee, maxQty: cap });
        }
      } else {
        largeIndependentShipping += it.fee * it.qty;
        largeIndependentCount += it.qty;
      }
    }
  }

  const largeMergedPack = packParcels(mergeableLargeUnits);
  const largeShipping = largeMergedPack.fee + largeIndependentShipping;
  const totalLargeParcels = largeMergedPack.count + largeIndependentCount;

  // 2. Non-large items absorbing into large
  const nonLarge = parsed.filter((it) => it.group !== "large");
  const afterLargeAbsorption: ParsedItem[] = [];

  for (const it of nonLarge) {
    if (totalLargeParcels > 0 && it.canMerge && it.mergeWith.includes("large")) {
      const maxAbsorbable = it.maxMergeQty != null ? totalLargeParcels * it.maxMergeQty : Infinity;
      const absorbedQty = Math.min(it.qty, maxAbsorbable);
      const remainingQty = it.qty - absorbedQty;
      if (remainingQty > 0) {
        afterLargeAbsorption.push({ ...it, qty: remainingQty });
      }
    } else {
      afterLargeAbsorption.push(it);
    }
  }

  // 3. Medium items
  const mergeableMediumUnits: Unit[] = [];
  let mediumIndependentShipping = 0;
  let mediumIndependentCount = 0;
  const nonMediumItems: ParsedItem[] = [];

  for (const it of afterLargeAbsorption) {
    if (it.group === "medium") {
      if (it.canMerge && it.mergeWith.includes("medium")) {
        const cap = it.maxMergeQty ?? Infinity;
        for (let k = 0; k < it.qty; k++) {
          mergeableMediumUnits.push({ fee: it.fee, maxQty: cap });
        }
      } else {
        mediumIndependentShipping += it.fee * it.qty;
        mediumIndependentCount += it.qty;
      }
    } else {
      nonMediumItems.push(it);
    }
  }

  const mediumMergedPack = packParcels(mergeableMediumUnits);
  const mediumShipping = mediumMergedPack.fee + mediumIndependentShipping;
  const totalMediumParcels = mediumMergedPack.count + mediumIndependentCount;

  // Absorption of small items into medium shipments
  const afterMediumAbsorption: ParsedItem[] = [];
  for (const it of nonMediumItems) {
    if (mediumMergedPack.count > 0 && it.canMerge && it.mergeWith.includes("medium")) {
      const maxAbsorbable = it.maxMergeQty != null ? mediumMergedPack.count * it.maxMergeQty : Infinity;
      const absorbedQty = Math.min(it.qty, maxAbsorbable);
      const remainingQty = it.qty - absorbedQty;
      if (remainingQty > 0) {
        afterMediumAbsorption.push({ ...it, qty: remainingQty });
      }
    } else {
      afterMediumAbsorption.push(it);
    }
  }

  // 4. Small items
  const mergeableSmallUnits: Unit[] = [];
  let unmergedShipping = 0;
  let unmergedCount = 0;

  for (const it of afterMediumAbsorption) {
    if (it.group === "small" && it.canMerge && it.mergeWith.includes("small")) {
      const cap = it.maxMergeQty ?? Infinity;
      for (let k = 0; k < it.qty; k++) {
        mergeableSmallUnits.push({ fee: it.fee, maxQty: cap });
      }
    } else {
      unmergedShipping += it.fee * it.qty;
      unmergedCount += it.qty;
    }
  }

  const smallPack = packParcels(mergeableSmallUnits);

  const totalShipping =
    largeShipping +
    mediumShipping +
    smallPack.fee +
    unmergedShipping;

  const totalShipments =
    totalLargeParcels +
    totalMediumParcels +
    smallPack.count +
    unmergedCount;

  return { shipping: totalShipping, shipments: totalShipments };
}

export function computeShipping(items: ReadonlyArray<ShippingItem> | null | undefined): number {
  return evaluateShipping(items).shipping;
}

export function shipmentCount(items: ReadonlyArray<ShippingItem> | null | undefined): number {
  return evaluateShipping(items).shipments;
}