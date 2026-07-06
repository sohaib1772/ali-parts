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
      sb.from("products").select("id, name_ar, name_en, oem_number, category_id").limit(1000),
      sb.from("categories").select("id, name_ar"),
    ]);
    const catMap = new Map((cats ?? []).map((c) => [c.id, c.name_ar]));
    const catList = (cats ?? []).map((c) => ({ id: c.id, name: c.name_ar }));
    const catalog = (products ?? []).map((p, i) => {
      const parts = [p.name_ar];
      if (p.name_en) parts.push(`/ ${p.name_en}`);
      const catName = p.category_id ? catMap.get(p.category_id) : null;
      if (catName) parts.push(`[${catName}]`);
      if (p.oem_number) parts.push(`OEM:${p.oem_number}`);
      return { idx: i, id: p.id, label: parts.join(" ") };
    });
    const catalogText = catalog.map((c) => `${c.idx}. ${c.label}`).join("\n");
    const catText = catList.map((c) => `- ${c.name}`).join("\n");

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
              "أنت خبير قطع غيار سيارات دقيق جداً. مهمتك تحديد القطعة في الصورة بدقة عالية وإرجاع منتجات مطابقة فقط من قائمة المتجر.\n\nقواعد صارمة:\n1. حدد أولاً اسم القطعة بالعربي (name_ar) واسم الفئة الرئيسية (category_ar) من القائمة المعطاة فقط. إذا لم تكن الصورة قطعة غيار واضحة، اترك الحقول فارغة وأرجع قوائم فارغة.\n2. exact: فقط المنتجات التي هي نفس نوع/وظيفة القطعة في الصورة تماماً (مثال: صورة فلتر زيت → فقط فلاتر زيت، ليس فلاتر هواء ولا فلاتر بنزين). يجب أن تكون من نفس الفئة (category_ar).\n3. similar: منتجات من نفس الفئة العامة فقط أو مكمّلة مباشرة للقطعة (مثال: مع فلتر زيت → زيت محرك). لا تضع قطعاً من فئات غير ذات صلة.\n4. الدقة أهم من العدد. أرجع فقط ما أنت واثق منه بنسبة عالية. إذا لم تجد مطابقات دقيقة، أرجع قوائم فارغة بدل إضافة نتائج ضعيفة.\n5. الحد الأقصى: 6 في exact و6 في similar. لا تكرر idx.\n6. لا تخترع idx خارج القائمة. لا تعتمد على تشابه الاسم فقط — يجب أن تطابق الوظيفة.\n\nأعد JSON فقط: {\"name_ar\":\"...\",\"category_ar\":\"...\",\"exact\":[<idx>,...],\"similar\":[<idx>,...]}",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `الفئات المتاحة في المتجر:\n${catText}\n\nقائمة المنتجات (idx. الاسم [الفئة] OEM):\n${catalogText}\n\nحلل الصورة بدقة. اذكر الفئة أولاً ثم اختر منتجات من نفس الفئة فقط. JSON فقط.` },
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
    let parsed: { matches?: number[]; exact?: number[]; similar?: number[]; name_ar?: string; category_ar?: string } = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    // Resolve detected category id (if any) to enforce server-side filtering.
    const detectedCatName = (parsed.category_ar ?? "").trim();
    const detectedCat = detectedCatName
      ? catList.find((c) => c.name && (c.name === detectedCatName || c.name.includes(detectedCatName) || detectedCatName.includes(c.name)))
      : null;
    const productById = new Map((products ?? []).map((p) => [p.id, p]));

    const toIds = (arr?: number[]) =>
      (arr ?? [])
        .map((i) => catalog[i]?.id)
        .filter((v): v is string => !!v);

    let exactIds = toIds(parsed.exact ?? parsed.matches);
    let similarIds = toIds(parsed.similar).filter((id) => !exactIds.includes(id));

    // Category filter: only apply to `exact` (must match detected category),
    // and only when we resolved a real category. `similar` stays broader so
    // matching parts aren't hidden when the model picks an adjacent label.
    if (detectedCat) {
      const inCat = (id: string) => productById.get(id)?.category_id === detectedCat.id;
      const filteredExact = exactIds.filter(inCat);
      // If filtering wiped exact entirely, keep the model's picks — better to
      // show something relevant than nothing.
      if (filteredExact.length > 0) exactIds = filteredExact;
    }

    // Cap results to keep them focused.
    exactIds = exactIds.slice(0, 8);
    similarIds = similarIds.slice(0, 8);

    const productIds = [...exactIds, ...similarIds];
    return { productIds, exactIds, similarIds, name_ar: parsed.name_ar ?? "", category_ar: detectedCat?.name ?? parsed.category_ar ?? "" };
  });