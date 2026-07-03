import type React from "react";
import { formatIQD, formatArabicDate } from "@/lib/format";
import { statusLabel } from "@/lib/order-status";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, FileDown, X } from "lucide-react";
import { toast } from "sonner";
import logoAsset from "@/assets/ali-chevrolet-logo.jpeg.asset.json";

const LOGO_URL = logoAsset.url;

export function PrintableInvoice({ order, items, domId }: { order: any; items: any[]; domId?: string }) {
  const addr = (order.address ?? {}) as Record<string, string | undefined>;
  const pointsDiscount = Number(order.points_used ?? 0) * 10;
  return (
    <div id={domId} className="print-only invoice-print" dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" }}>
      <div style={{ maxWidth: "780px", margin: "0 auto", padding: "0", color: "#0a1a3a", background: "#ffffff", position: "relative", overflow: "hidden" }}>
        {/* Watermark logo */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", opacity: 0.05, zIndex: 0 }}>
          <img src={LOGO_URL} alt="" style={{ width: "520px", height: "520px", objectFit: "contain" }} />
        </div>

        {/* Luxe header */}
        <div style={{ position: "relative", zIndex: 1, background: "linear-gradient(135deg, #0a1a3a 0%, #142451 55%, #0a1a3a 100%)", color: "#f5c96a", padding: "18px 22px", borderBottom: "4px solid #c9a24a", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "82px", height: "82px", borderRadius: "12px", background: "#000", padding: "4px", boxShadow: "0 6px 18px rgba(0,0,0,0.35)", display: "grid", placeItems: "center" }}>
              <img src={LOGO_URL} alt="Ali Chevrolet" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "8px" }} />
            </div>
            <div>
              <div style={{ fontSize: "24px", fontWeight: 900, letterSpacing: "0.02em", color: "#ffffff" }}>ALI CHEVROLET</div>
              <div style={{ fontSize: "11px", color: "#f5c96a", fontWeight: 700, letterSpacing: "0.25em", marginTop: "3px" }}>PREMIUM AUTO PARTS</div>
              <div style={{ fontSize: "10px", color: "#cfd6e6", marginTop: "4px", lineHeight: 1.5 }}>قطع غيار السيارات الأصلية · العراق</div>
            </div>
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ display: "inline-block", padding: "6px 14px", background: "linear-gradient(135deg,#f5c96a,#c9a24a)", color: "#0a1a3a", fontWeight: 900, fontSize: "12px", letterSpacing: "0.18em", borderRadius: "4px", boxShadow: "0 3px 10px rgba(201,162,74,0.4)" }}>INVOICE · فاتورة</div>
            <div style={{ marginTop: "10px", fontSize: "11px", color: "#cfd6e6" }}>
              <div>رقم الفاتورة: <span style={{ fontFamily: "ui-monospace, monospace", color: "#f5c96a", fontWeight: 700 }}>{order.order_number}</span></div>
              <div>التاريخ: <span style={{ color: "#ffffff", fontWeight: 700 }}>{formatArabicDate(order.created_at)}</span></div>
              <div>الحالة: <span style={{ color: "#ffffff", fontWeight: 700 }}>{statusLabel(order.status)}</span></div>
            </div>
          </div>
        </div>
        <div style={{ position: "relative", zIndex: 1, padding: "0 22px 22px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
          <div style={{ border: "1px solid #e6e2d5", borderRadius: "6px", padding: "10px 12px" }}>
            <div style={{ fontSize: "9px", fontWeight: 800, letterSpacing: "0.2em", color: "#c9a24a", marginBottom: "6px" }}>BILL TO · فاتورة إلى</div>
            <div style={{ fontSize: "13px", fontWeight: 800 }}>{addr.full_name ?? "-"}</div>
            <div style={{ fontSize: "11px", color: "#334063", marginTop: "4px", lineHeight: 1.7 }}>
              {addr.phone && <div>📞 <span style={{ fontFamily: "ui-monospace, monospace" }}>{addr.phone}</span></div>}
              {addr.label && <div>التسمية: {addr.label}</div>}
            </div>
          </div>
          <div style={{ border: "1px solid #e6e2d5", borderRadius: "6px", padding: "10px 12px" }}>
            <div style={{ fontSize: "9px", fontWeight: 800, letterSpacing: "0.2em", color: "#c9a24a", marginBottom: "6px" }}>SHIP TO · عنوان التوصيل</div>
            <div style={{ fontSize: "11px", color: "#0a1a3a", lineHeight: 1.7 }}>
              {addr.city && <div><b>المحافظة:</b> {addr.city}</div>}
              {addr.area && <div><b>القضاء:</b> {addr.area}</div>}
              {addr.street && <div><b>الشارع:</b> {addr.street}</div>}
              {addr.notes && <div style={{ color: "#5c6c8a", fontSize: "10px", marginTop: "2px" }}>{addr.notes}</div>}
            </div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px", fontSize: "12px" }}>
          <thead>
            <tr style={{ background: "#0a1a3a", color: "#f5c96a" }}>
              <th style={thStyle}>#</th>
              <th style={{ ...thStyle, textAlign: "right" }}>الوصف</th>
              <th style={thStyle}>الجهة</th>
              <th style={thStyle}>الكمية</th>
              <th style={{ ...thStyle, textAlign: "left" }}>سعر الوحدة</th>
              <th style={{ ...thStyle, textAlign: "left" }}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={it.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={tdStyle}>{idx + 1}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <div style={{ fontWeight: 700 }}>{it.name_ar}</div>
                  {it.oem_number && <div style={{ fontSize: "9px", color: "#5c6c8a", fontFamily: "ui-monospace, monospace" }}>OEM: {it.oem_number}</div>}
                  {it.note && <div style={{ fontSize: "10px", color: "#8a6a1a", marginTop: "2px" }}>ملاحظة: {it.note}</div>}
                </td>
                <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>{it.side ?? "-"}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>× {it.quantity}</td>
                <td style={{ ...tdStyle, textAlign: "left", fontFamily: "ui-monospace, monospace" }}>{formatIQD(Number(it.unit_price_iqd))}</td>
                <td style={{ ...tdStyle, textAlign: "left", fontFamily: "ui-monospace, monospace", fontWeight: 800 }}>{formatIQD(Number(it.unit_price_iqd) * it.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: "14px", alignItems: "start" }}>
          <div>
            {order.notes && (
              <div style={{ border: "1px dashed #c9a24a", borderRadius: "6px", padding: "10px 12px", background: "#fff8e6" }}>
                <div style={{ fontSize: "9px", fontWeight: 800, letterSpacing: "0.2em", color: "#8a6a1a", marginBottom: "4px" }}>NOTE · ملاحظة الزبون</div>
                <div style={{ fontSize: "11px", color: "#0a1a3a", whiteSpace: "pre-wrap" }}>{order.notes}</div>
              </div>
            )}
          </div>
          <div style={{ border: "1px solid #e6e2d5", borderRadius: "6px", padding: "10px 12px", fontSize: "12px" }}>
            <TotalRow label="المجموع الفرعي" value={formatIQD(order.subtotal_iqd)} />
            <TotalRow label="التوصيل" value={formatIQD(order.shipping_iqd)} />
            {pointsDiscount > 0 && <TotalRow label={`خصم نقاط (${order.points_used})`} value={`- ${formatIQD(pointsDiscount)}`} />}
            <div style={{ borderTop: "2px solid #0a1a3a", marginTop: "6px", paddingTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 900 }}>الإجمالي</span>
              <span style={{ fontSize: "18px", fontWeight: 900, color: "#0a1a3a", fontFamily: "ui-monospace, monospace" }}>{formatIQD(order.total_iqd)}</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: "22px", paddingTop: "12px", borderTop: "1px solid #e6e2d5", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: "10px", color: "#5c6c8a", lineHeight: 1.6 }}>
            شكراً لتسوقكم من <b style={{ color: "#0a1a3a" }}>ALI CHEVROLET</b> — قطع أصلية ١٠٠٪
            <br />
            للاستفسار تواصل مع خدمة الزبائن
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ borderTop: "1px solid #0a1a3a", width: "160px", marginBottom: "4px" }} />
            <div style={{ fontSize: "10px", color: "#5c6c8a" }}>التوقيع / الختم</div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "center",
  fontSize: "10px",
  fontWeight: 800,
  letterSpacing: "0.1em",
};
const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  verticalAlign: "top",
};

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "11px", color: "#334063" }}>
      <span>{label}</span>
      <span style={{ fontFamily: "ui-monospace, monospace", color: "#0a1a3a", fontWeight: 700 }}>{value}</span>
    </div>
  );
}

export async function downloadInvoicePdf(elementId: string, filename: string) {
  const source = document.getElementById(elementId);
  if (!source) return;
  const [{ toPng }, { jsPDF }] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
  ]);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    "width:900px",
    "height:1300px",
    "border:0",
    "background:#ffffff",
  ].join(";");
  document.body.appendChild(frame);
  const frameDoc = frame.contentDocument;
  if (!frameDoc) {
    frame.remove();
    throw new Error("PDF frame unavailable");
  }
  frameDoc.open();
  frameDoc.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#fff;color:#0a1a3a;font-family:'IBM Plex Sans Arabic',Arial,sans-serif;}
    *{box-sizing:border-box;box-shadow:none!important;text-shadow:none!important;}
    table{border-collapse:collapse;}
  </style></head><body></body></html>`);
  frameDoc.close();
  const captureNode = source.cloneNode(true) as HTMLElement;
  captureNode.removeAttribute("id");
  captureNode.className = "";
  captureNode.style.cssText = [
    "display:block!important",
    "position:relative!important",
    "width:820px!important",
    "min-height:1123px!important",
    "background:#ffffff!important",
    "color:#0a1a3a!important",
    "opacity:1!important",
    "transform:none!important",
    "font-family:'IBM Plex Sans Arabic', system-ui, sans-serif!important",
  ].join(";");
  captureNode.querySelectorAll<HTMLElement>("*").forEach((node) => {
    node.style.borderColor ||= "#e6e2d5";
    node.style.outlineColor ||= "#e6e2d5";
  });
  frameDoc.body.appendChild(captureNode);
  try {
    await frameDoc.fonts?.ready;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const captureWidth = captureNode.scrollWidth || 820;
    const captureHeight = captureNode.scrollHeight || 1123;
    const imgData = await toPng(captureNode, {
      backgroundColor: "#ffffff",
      cacheBust: true,
      pixelRatio: 2,
      width: captureWidth,
      height: captureHeight,
    });
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const imgW = pageW - margin * 2;
    const imgH = (captureHeight * imgW) / captureWidth;
    let heightLeft = imgH;
    let position = margin;
    pdf.addImage(imgData, "PNG", margin, position, imgW, imgH);
    heightLeft -= pageH - margin * 2;
    while (heightLeft > 0) {
      pdf.addPage();
      position = margin - (imgH - heightLeft);
      pdf.addImage(imgData, "PNG", margin, position, imgW, imgH);
      heightLeft -= pageH - margin * 2;
    }
    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    frame.remove();
  }
}
