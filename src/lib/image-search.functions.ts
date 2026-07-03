import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({ imageDataUrl: z.string().min(20) });

export const analyzeProductImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

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
              "أنت خبير قطع غيار سيارات. حلل صورة القطعة وأعد كلمات بحث قصيرة (اسم القطعة بالعربي، ورقم OEM إن ظهر بوضوح). أعد JSON فقط بالشكل: {\"query\":\"...\",\"name_ar\":\"...\",\"oem\":\"...\"}. اجعل query أفضل مصطلح للبحث في متجر قطع غيار.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "ما هذه القطعة؟ أعد JSON فقط." },
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
    let parsed: { query?: string; name_ar?: string; oem?: string } = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    const query = (parsed.oem?.trim() || parsed.query?.trim() || parsed.name_ar?.trim() || "").slice(0, 120);
    return { query, name_ar: parsed.name_ar ?? "", oem: parsed.oem ?? "" };
  });