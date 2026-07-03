import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({ imageDataUrl: z.string().min(20) });

export const analyzeProductImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    // Load catalog from DB and ask AI to pick matching products only from it.
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: products } = await sb
      .from("products")
      .select("id, name_ar, name_en, oem_number, category_id")
      .limit(500);
    const catalog = (products ?? []).map((p, i) => ({
      idx: i,
      id: p.id,
      label: `${p.name_ar}${p.oem_number ? ` (OEM: ${p.oem_number})` : ""}`,
    }));
    const catalogText = catalog.map((c) => `${c.idx}. ${c.label}`).join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "أنت خبير قطع غيار سيارات. لديك قائمة منتجات المتجر. حلل صورة القطعة واختر فقط المنتجات المطابقة من القائمة (0 إلى 8 منتجات). أعد JSON فقط: {\"matches\":[<idx>,...],\"name_ar\":\"...\"}. لا تخترع منتجات خارج القائمة. إذا لا يوجد تطابق أعد matches فارغة.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `قائمة المنتجات:\n${catalogText}\n\nاختر المطابقين للصورة. أعد JSON فقط.` },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) throw new Error("تم تجاوز الحد المسموح، حاول لاحقاً");
    if (res.status === 402) throw new Error("انتهت الأرصدة، يرجى التواصل مع الدعم");
    if (!res.ok) throw new Error("تعذر تحليل الصورة");

    const json = await res.json();
    const content: string = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { matches?: number[]; name_ar?: string } = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    const ids = (parsed.matches ?? [])
      .map((i) => catalog[i]?.id)
      .filter((v): v is string => !!v);
    return { productIds: ids, name_ar: parsed.name_ar ?? "" };
  });