import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

type Check = {
  name: string;
  pass: boolean;
  expected: string;
  actual: string;
  detail?: string;
};

type Scenario = {
  scenario: string;
  description: string;
  checks: Check[];
};

export const runStockTests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; scenarios: Scenario[]; summary: { passed: number; failed: number } }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const scenarios: Scenario[] = [];
    const runId = `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const createdProductIds: string[] = [];
    const createdOrderIds: string[] = [];

    const getStock = async (productId: string) => {
      const { data, error } = await supabaseAdmin
        .from("products")
        .select("stock_qty, in_stock")
        .eq("id", productId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    };

    const getMovements = async (orderId: string) => {
      const { data, error } = await supabaseAdmin
        .from("stock_movements")
        .select("delta, reason")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    };

    const countByReason = (rows: { reason: string }[], reason: string) =>
      rows.filter((r) => r.reason === reason).length;

    // Create a fresh test product
    const makeProduct = async (initialStock: number) => {
      const { data, error } = await supabaseAdmin
        .from("products")
        .insert({
          name_ar: `${runId} product`,
          price_iqd: 1000,
          price_usd: 1,
          stock_qty: initialStock,
          in_stock: initialStock > 0,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      createdProductIds.push(data.id);
      return data.id as string;
    };

    // Simulate an order created via place_order: insert order + order_items and decrement stock manually.
    const makeOrder = async (productId: string, qty: number) => {
      const { data: order, error: orderErr } = await supabaseAdmin
        .from("orders")
        .insert({
          user_id: context.userId,
          status: "received",
          address: { test: true, run_id: runId },
          payment_method: "cod",
          subtotal_iqd: 1000 * qty,
          shipping_iqd: 0,
          total_iqd: 1000 * qty,
        })
        .select("id, order_number")
        .single();
      if (orderErr) throw new Error(orderErr.message);
      createdOrderIds.push(order.id);

      const { error: itemErr } = await supabaseAdmin.from("order_items").insert({
        order_id: order.id,
        product_id: productId,
        name_ar: `${runId} item`,
        unit_price_iqd: 1000,
        quantity: qty,
      });
      if (itemErr) throw new Error(itemErr.message);

      // Mimic place_order stock decrement (trigger only logs; it does NOT touch stock_qty)
      const before = await getStock(productId);
      const newStock = Math.max(0, before.stock_qty - qty);
      const { error: updErr } = await supabaseAdmin
        .from("products")
        .update({ stock_qty: newStock, in_stock: newStock > 0 })
        .eq("id", productId);
      if (updErr) throw new Error(updErr.message);

      return order.id as string;
    };

    try {
      // ------------------------------------------------------------
      // Scenario 1: cancel → re-save cancelled (no dup) → uncancel
      // ------------------------------------------------------------
      {
        const checks: Check[] = [];
        const productId = await makeProduct(100);
        const orderId = await makeOrder(productId, 3);

        // After order creation
        const s1 = await getStock(productId);
        checks.push({
          name: "بعد إنشاء الطلب: المخزون 97",
          pass: s1.stock_qty === 97,
          expected: "97",
          actual: String(s1.stock_qty),
        });
        const m1 = await getMovements(orderId);
        checks.push({
          name: "حركة واحدة (order_placed = -3)",
          pass: m1.length === 1 && m1[0].delta === -3 && m1[0].reason === "order_placed",
          expected: "[-3, order_placed]",
          actual: JSON.stringify(m1),
        });

        // Cancel
        await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", orderId);
        const s2 = await getStock(productId);
        checks.push({
          name: "بعد الإلغاء: المخزون 100",
          pass: s2.stock_qty === 100,
          expected: "100",
          actual: String(s2.stock_qty),
        });
        const m2 = await getMovements(orderId);
        checks.push({
          name: "حركة إلغاء واحدة (order_cancelled = +3)",
          pass: countByReason(m2, "order_cancelled") === 1,
          expected: "1",
          actual: String(countByReason(m2, "order_cancelled")),
          detail: JSON.stringify(m2),
        });

        // Re-save with same status (should NOT trigger anything)
        await supabaseAdmin.from("orders").update({ status: "cancelled", notes: "no-op" }).eq("id", orderId);
        const m3 = await getMovements(orderId);
        checks.push({
          name: "حفظ بنفس الحالة → لا تكرار",
          pass: countByReason(m3, "order_cancelled") === 1 && m3.length === m2.length,
          expected: String(m2.length),
          actual: String(m3.length),
        });
        const s3 = await getStock(productId);
        checks.push({
          name: "المخزون لم يتغير بعد الحفظ الفارغ",
          pass: s3.stock_qty === 100,
          expected: "100",
          actual: String(s3.stock_qty),
        });

        // Uncancel
        await supabaseAdmin.from("orders").update({ status: "preparing" }).eq("id", orderId);
        const s4 = await getStock(productId);
        checks.push({
          name: "بعد إعادة التفعيل: المخزون 97",
          pass: s4.stock_qty === 97,
          expected: "97",
          actual: String(s4.stock_qty),
        });
        const m4 = await getMovements(orderId);
        checks.push({
          name: "حركة uncancelled واحدة (-3)",
          pass: countByReason(m4, "order_uncancelled") === 1,
          expected: "1",
          actual: String(countByReason(m4, "order_uncancelled")),
          detail: JSON.stringify(m4),
        });

        scenarios.push({
          scenario: "إلغاء → حفظ فارغ → إعادة تفعيل",
          description: "التأكد من الإرجاع والخصم مرة واحدة فقط بدون تكرار",
          checks,
        });
      }

      // ------------------------------------------------------------
      // Scenario 2: delete non-cancelled order
      // ------------------------------------------------------------
      {
        const checks: Check[] = [];
        const productId = await makeProduct(50);
        const orderId = await makeOrder(productId, 4);

        checks.push({
          name: "بعد الإنشاء: المخزون 46",
          pass: (await getStock(productId)).stock_qty === 46,
          expected: "46",
          actual: String((await getStock(productId)).stock_qty),
        });

        // Snapshot movements BEFORE delete (order_id will be gone after cascade)
        const before = await getMovements(orderId);

        await supabaseAdmin.from("orders").delete().eq("id", orderId);
        // Remove from cleanup list since already deleted
        const idx = createdOrderIds.indexOf(orderId);
        if (idx >= 0) createdOrderIds.splice(idx, 1);

        const s = await getStock(productId);
        checks.push({
          name: "بعد الحذف: المخزون 50",
          pass: s.stock_qty === 50,
          expected: "50",
          actual: String(s.stock_qty),
        });

        const after = await getMovements(orderId);
        const deletedRows = after.filter((r) => r.reason === "order_deleted");
        checks.push({
          name: "حركة order_deleted واحدة (+4)",
          pass: deletedRows.length === 1 && deletedRows[0].delta === 4,
          expected: "[+4]",
          actual: JSON.stringify(deletedRows),
          detail: `before=${before.length} after=${after.length}`,
        });

        scenarios.push({
          scenario: "حذف طلب نشط",
          description: "يجب إرجاع المخزون وتسجيل حركة واحدة فقط",
          checks,
        });
      }

      // ------------------------------------------------------------
      // Scenario 3: delete cancelled order → no double refund
      // ------------------------------------------------------------
      {
        const checks: Check[] = [];
        const productId = await makeProduct(20);
        const orderId = await makeOrder(productId, 5);

        await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", orderId);
        const sAfterCancel = await getStock(productId);
        checks.push({
          name: "بعد الإلغاء: المخزون 20",
          pass: sAfterCancel.stock_qty === 20,
          expected: "20",
          actual: String(sAfterCancel.stock_qty),
        });
        const mBefore = await getMovements(orderId);

        await supabaseAdmin.from("orders").delete().eq("id", orderId);
        const idx = createdOrderIds.indexOf(orderId);
        if (idx >= 0) createdOrderIds.splice(idx, 1);

        const sAfterDel = await getStock(productId);
        checks.push({
          name: "بعد حذف طلب ملغى: المخزون 20 (لا استرداد مزدوج)",
          pass: sAfterDel.stock_qty === 20,
          expected: "20",
          actual: String(sAfterDel.stock_qty),
        });

        const mAfter = await getMovements(orderId);
        checks.push({
          name: "لا حركة order_deleted لطلب ملغى",
          pass: countByReason(mAfter, "order_deleted") === 0,
          expected: "0",
          actual: String(countByReason(mAfter, "order_deleted")),
          detail: `before=${mBefore.length} after=${mAfter.length}`,
        });

        scenarios.push({
          scenario: "حذف طلب ملغى مسبقاً",
          description: "يجب ألا يعيد المخزون مرة ثانية (منع الازدواج)",
          checks,
        });
      }

      // ------------------------------------------------------------
      // Scenario 4: multiple status changes (not cancel-related) → no stock movement
      // ------------------------------------------------------------
      {
        const checks: Check[] = [];
        const productId = await makeProduct(30);
        const orderId = await makeOrder(productId, 2);

        const statuses = ["preparing", "packed", "shipped", "out_for_delivery", "delivered"] as const;
        for (const status of statuses) {
          await supabaseAdmin.from("orders").update({ status }).eq("id", orderId);
        }

        const s = await getStock(productId);
        checks.push({
          name: "بعد سلسلة تغييرات (تجهيز→تسليم): المخزون 28",
          pass: s.stock_qty === 28,
          expected: "28",
          actual: String(s.stock_qty),
        });

        const m = await getMovements(orderId);
        checks.push({
          name: "حركة واحدة فقط (order_placed)",
          pass: m.length === 1 && m[0].reason === "order_placed",
          expected: "1",
          actual: String(m.length),
          detail: JSON.stringify(m),
        });

        scenarios.push({
          scenario: "تغييرات حالة اعتيادية",
          description: "تحديث الحالة بغير إلغاء لا يؤثر على المخزون",
          checks,
        });
      }
    } finally {
      // Cleanup — delete remaining test orders (some may already be deleted)
      for (const oid of createdOrderIds) {
        // Cancel first so the delete trigger doesn't re-restore stock for cleanup
        await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", oid);
        await supabaseAdmin.from("orders").delete().eq("id", oid);
      }
      // Delete all test stock_movements referencing these products (order_id may already be null after cascade)
      if (createdProductIds.length > 0) {
        await supabaseAdmin.from("stock_movements").delete().in("product_id", createdProductIds);
        await supabaseAdmin.from("products").delete().in("id", createdProductIds);
      }
    }

    let passed = 0;
    let failed = 0;
    for (const s of scenarios) {
      for (const c of s.checks) {
        if (c.pass) passed++;
        else failed++;
      }
    }

    return { ok: failed === 0, scenarios, summary: { passed, failed } };
  });