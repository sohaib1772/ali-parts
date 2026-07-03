import type React from "react";
import { formatIQD, formatArabicDate } from "@/lib/format";
import { statusLabel } from "@/lib/order-status";

export function PrintableInvoice({ order, items, domId }: { order: any; items: any[]; domId?: string }) {
  const addr = (order.address ?? {}) as Record<string, string | undefined>;
  const pointsDiscount = Number(order.points_used ?? 0) * 10;
  return (
    <div id={domId} className="print-only invoice-print" dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" }}>
      <div style={{ maxWidth: "780px", margin: "0 auto", padding: "0 4mm", color: "#0a1a3a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px double #c9a24a", paddingBottom: "12px", marginBottom: "18px" }}>
          <div>
            <div style={{ fontSize: "28px", fontWeight: 900, letterSpacing: "-0.02em", color: "#0a1a3a" }}>الســـائــر</div>
            <div style={{ fontSize: "10px", color: "#c9a24a", fontWeight: 700, letterSpacing: "0.2em", marginTop: "2px" }}>ALSAAER · AUTO PARTS</div>
            <div style={{ fontSize: "10px", color: "#5c6c8a", marginTop: "6px", lineHeight: 1.6 }}>قطع غيار السيارات الأصلية · العراق</div>
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ display: "inline-block", padding: "6px 14px", background: "#0a1a3a", color: "#f5c96a", fontWeight: 900, fontSize: "12px", letterSpacing: "0.15em", borderRadius: "4px" }}>INVOICE · فاتورة</div>
            <div style={{ marginTop: "10px", fontSize: "11px", color: "#5c6c8a" }}>
              <div>رقم الفاتورة: <span style={{ fontFamily: "ui-monospace, monospace", color: "#0a1a3a", fontWeight: 700 }}>{order.order_number}</span></div>
              <div>التاريخ: <span style={{ color: "#0a1a3a", fontWeight: 700 }}>{formatArabicDate(order.created_at)}</span></div>
              <div>الحالة: <span style={{ color: "#0a1a3a", fontWeight: 700 }}>{statusLabel(order.status)}</span></div>
            </div>
          </div>
        </div>

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
            شكراً لتسوقكم من الســـائــر — قطع أصلية ١٠٠٪
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
  const captureNode = source.cloneNode(true) as HTMLElement;
  captureNode.removeAttribute("id");
  captureNode.className = "";
  captureNode.style.cssText = [
    "display:block!important",
    "position:absolute!important",
    "left:0!important",
    "top:0!important",
    "width:794px!important",
    "min-height:1123px!important",
    "background:#ffffff!important",
    "color:#0a1a3a!important",
    "z-index:2147483647!important",
    "opacity:1!important",
    "pointer-events:none!important",
    "transform:none!important",
  ].join(";");
  document.body.appendChild(captureNode);
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    await document.fonts?.ready;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const canvas = await html2canvas(captureNode, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      width: captureNode.scrollWidth,
      height: captureNode.scrollHeight,
      windowWidth: 900,
      windowHeight: Math.max(1300, captureNode.scrollHeight + 80),
      scrollX: 0,
      scrollY: 0,
      logging: false,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const imgW = pageW - margin * 2;
    const imgH = (canvas.height * imgW) / canvas.width;
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
    pdf.save(filename);
  } finally {
    captureNode.remove();
  }
}
