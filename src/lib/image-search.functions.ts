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
    const [{ data: products }, { data: cats }] = await Promise.all([
      sb.from("products").select("id, name_ar, name_en, oem_number, category_id").limit(500),
      sb.from("categories").select("id, name_ar"),
    ]);
    const catMap = new Map((cats ?? []).map((c) => [c.id, c.name_ar]));
    const catalog = (products ?? []).map((p, i) => {
      const parts = [p.name_ar];
      if (p.name_en) parts.push(`/ ${p.name_en}`);
      const catName = p.category_id ? catMap.get(p.category_id) : null;
      if (catName) parts.push(`[${catName}]`);
      if (p.oem_number) parts.push(`OEM:${p.oem_number}`);
      return { idx: i, id: p.id, label: parts.join(" ") };
    });
    const catalogText = catalog.map((c) => `${c.idx}. ${c.label}`).join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "أنت خبير قطع غيار سيارات. حدد نوع القطعة في الصورة، ثم أعد منتجات من قائمة المتجر مرتبة من الأقرب للأبعد.\n\nالقواعد:\n1. حدد نوع/فئة القطعة (فلتر، مساعد، دسك، رديتر، شمعة، حساس…).\n2. أعد نتيجتين:\n   - exact: منتجات من نفس النوع تماماً (الأولوية القصوى).\n   - similar: منتجات قريبة/مشابهة أو من نفس الفئة أو مكمّلة للقطعة (حتى لو ليست نفس النوع بالضبط)، مرتبة بالأهم.\n3. مجموع النتائج حتى 12 منتج. لا تكرّر idx بين القائمتين.\n4. إذا ما توفر أي منتج من نفس النوع، اترك exact فارغة واملأ similar بأقرب البدائل من نفس الفئة.\n5. لا تخترع idx خارج القائمة.\n\nأعد JSON فقط: {\"name_ar\":\"اسم القطعة\",\"exact\":[<idx>,...],\"similar\":[<idx>,...]}",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `قائمة منتجات المتجر (idx. الاسم [الفئة] OEM):\n${catalogText}\n\nحلل الصورة وأعد exact + similar. JSON فقط.` },
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
    let parsed: { matches?: number[]; exact?: number[]; similar?: number[]; name_ar?: string } = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    const toIds = (arr?: number[]) =>
      (arr ?? []).map((i) => catalog[i]?.id).filter((v): v is string => !!v);
    const exactIds = toIds(parsed.exact ?? parsed.matches);
    const similarIds = toIds(parsed.similar).filter((id) => !exactIds.includes(id));
    const productIds = [...exactIds, ...similarIds];
    return { productIds, exactIds, similarIds, name_ar: parsed.name_ar ?? "" };
  });