import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, PackageCheck, Package as PackageIcon, PackageOpen, Truck, MapPin, Home, XCircle, StickyNote, Printer, FileDown } from "lucide-react";
import { orderByIdQuery } from "@/lib/queries";
import { formatIQD, formatArabicDate } from "@/lib/format";
import { statusLabel } from "@/lib/order-status";
import { markOrderSeen } from "@/lib/order-updates";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/orders/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(orderByIdQuery(params.id)),
  component: OrderDetail,
});

const TIMELINE = [
  { key: "received", label: "تم استلام الطلب", icon: PackageIcon },
  { key: "preparing", label: "جاري التجهيز", icon: PackageOpen },
  { key: "packed", label: "تم التغليف", icon: PackageCheck },
  { key: "shipped", label: "تسليم للتوصيل", icon: Truck },
  { key: "out_for_delivery", label: "خرج للتوصيل", icon: MapPin },
  { key: "delivered", label: "تم التسليم", icon: Home },
] as const;

function AddressRow({ label, value, mono, muted }: { label: string; value?: string; mono?: boolean; muted?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-end ${mono ? "font-mono" : ""} ${muted ? "text-muted-foreground text-xs" : "font-semibold"}`}>
        {value}
      </span>
    </div>
  );
}

function OrderDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(orderByIdQuery(id));
  const { order, items } = data;
  const router = useRouter();
  const qc = useQueryClient();
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    const el = document.getElementById("invoice-print-target");
    if (!el) return;
    setDownloading(true);
    try {
      const mod = await import("html2pdf.js");
      const html2pdf = (mod as any).default ?? (mod as any);
      // Temporarily reveal the printable node for capture
      el.classList.add("pdf-capture");
      await html2pdf()
        .set({
          margin: [10, 8, 10, 8],
          filename: `invoice-${order.order_number}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(el)
        .save();
    } catch {
      toast.error("تعذّر توليد ملف PDF");
    } finally {
      el.classList.remove("pdf-capture");
      setDownloading(false);
    }
  };

  useEffect(() => {
    const ch = supabase
      .channel(`order-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["order", id] });
          qc.invalidateQueries({ queryKey: ["orders"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, qc]);

  useEffect(() => {
    markOrderSeen(order.id, (order as any).updated_at ?? order.created_at);
  }, [order.id, (order as any).updated_at, order.created_at]);

  const activeIdx = TIMELINE.findIndex((t) => t.key === order.status);
  const cancelled = order.status === "cancelled";
  const canCancel = order.status === "received" || order.status === "preparing";
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    if (!confirm("هل تريد إلغاء هذا الطلب؟")) return;
    setCancelling(true);
    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    setCancelling(false);
    if (error) {
      toast.error("تعذّر إلغاء الطلب");
    } else {
      toast.success("تم إلغاء الطلب");
      qc.invalidateQueries({ queryKey: ["order", order.id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="sticky top-0 z-20 bg-gradient-navy text-primary-foreground shadow-luxe no-print">
        <div className="mx-auto max-w-md px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.history.back()} className="size-9 rounded-full bg-white/10 grid place-items-center"><ArrowRight className="size-5" /></button>
          <div className="flex-1">
            <div className="text-sm font-bold">تفاصيل الطلب</div>
            <div className="text-[10px] text-gold font-mono">{order.order_number}</div>
          </div>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-gradient-gold text-navy font-bold text-xs shadow-gold hover:brightness-105 transition"
            aria-label="طباعة الفاتورة"
          >
            <Printer className="size-4" /> طباعة
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-white/10 text-white font-bold text-xs border border-white/20 hover:bg-white/15 transition disabled:opacity-50"
            aria-label="تنزيل PDF"
          >
            <FileDown className="size-4" /> {downloading ? "جاري..." : "PDF"}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 pt-4 space-y-4 no-print">
        {cancelled ? (
          <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 flex items-center gap-3">
            <XCircle className="size-6 text-destructive" />
            <div>
              <div className="font-bold text-destructive">تم إلغاء الطلب</div>
              <div className="text-xs text-muted-foreground">إذا كان لديك استفسار تواصل معنا</div>
            </div>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
            <div className="text-xs font-bold text-gold mb-4">حالة الطلب</div>
            <div className="space-y-3">
              {TIMELINE.map((t, i) => {
                const done = i <= activeIdx;
                const active = i === activeIdx;
                const Icon = t.icon;
                return (
                  <div key={t.key} className="flex items-center gap-3">
                    <div className={`size-10 rounded-full grid place-items-center transition ${done ? "bg-gradient-gold text-navy shadow-gold" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="size-5" />
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm font-bold ${done ? "text-navy" : "text-muted-foreground"}`}>{t.label}</div>
                      {active && <div className="text-[10px] text-gold">الحالة الحالية</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
          <div className="text-xs font-bold text-gold mb-3">المنتجات</div>
          <div className="space-y-3">
            {items.map((it) => (
              <div key={it.id} className="flex gap-3">
                <div className="size-14 rounded-xl bg-muted overflow-hidden flex-shrink-0">
                  {it.image_url && <img src={it.image_url} alt="" className="size-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold line-clamp-1">{it.name_ar}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>× {it.quantity}</span>
                    {(it as any).side && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-navy text-primary-foreground text-[10px] font-black">
                        {(it as any).side === "LH" ? "LH · يسار" : "RH · يمين"}
                      </span>
                    )}
                  </div>
                  {(it as any).note && (
                    <div className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground bg-muted/50 rounded-md p-1.5">
                      <StickyNote className="size-3 text-gold shrink-0 mt-0.5" />
                      <span className="whitespace-pre-wrap">{(it as any).note}</span>
                    </div>
                  )}
                </div>
                <div className="text-sm font-bold self-center">{formatIQD(Number(it.unit_price_iqd) * it.quantity)}</div>
              </div>
            ))}
          </div>
        </div>

        {(order as any).notes && (
          <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
            <div className="flex items-center gap-2 mb-2">
              <StickyNote className="size-4 text-gold" />
              <span className="text-xs font-bold text-gold">ملاحظة الزبون على الطلب</span>
            </div>
            <div className="text-sm whitespace-pre-wrap">{(order as any).notes}</div>
          </div>
        )}

        <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
          <div className="text-xs font-bold text-gold mb-3">عنوان التوصيل</div>
          <div className="space-y-2 text-sm">
            <AddressRow label="التسمية" value={(order.address as any)?.label} />
            <AddressRow label="الاسم الكامل" value={(order.address as any)?.full_name} />
            <AddressRow label="رقم الهاتف" value={(order.address as any)?.phone} mono />
            <AddressRow label="المحافظة" value={(order.address as any)?.city} />
            <AddressRow label="المنطقة / القضاء" value={(order.address as any)?.area} />
            <AddressRow label="الشارع / تفاصيل" value={(order.address as any)?.street} />
            <AddressRow label="ملاحظات إضافية" value={(order.address as any)?.notes} muted />
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
          <div className="flex justify-between text-sm py-1"><span className="text-muted-foreground">المجموع الفرعي</span><span>{formatIQD(order.subtotal_iqd)}</span></div>
          <div className="flex justify-between text-sm py-1"><span className="text-muted-foreground">التوصيل</span><span>{formatIQD(order.shipping_iqd)}</span></div>
          {Number((order as any).points_used ?? 0) > 0 && (
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted-foreground">خصم نقاط ({(order as any).points_used})</span>
              <span className="text-success">- {formatIQD(Number((order as any).points_used) * 10)}</span>
            </div>
          )}
          <div className="border-t border-border mt-2 pt-3 flex justify-between items-baseline">
            <span className="font-bold">الإجمالي</span>
            <span className="text-xl font-black text-navy">{formatIQD(order.total_iqd)}</span>
          </div>
          {Number((order as any).points_earned ?? 0) > 0 && (
            <div className="mt-2 text-xs text-gold font-bold">🎉 كسبت {(order as any).points_earned} نقطة من هذا الطلب</div>
          )}
        </div>

        <div className="text-center text-xs text-muted-foreground">
          تم الطلب في {formatArabicDate(order.created_at)}
          <br />
          الحالة: {statusLabel(order.status)}
        </div>

        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="w-full h-12 rounded-2xl border-2 border-destructive text-destructive font-black flex items-center justify-center gap-2 hover:bg-destructive/10 disabled:opacity-50"
          >
            <XCircle className="size-5" />
            {cancelling ? "جاري الإلغاء..." : "إلغاء الطلب"}
          </button>
        )}
      </div>

      <PrintableInvoice order={order} items={items} />
    </div>
  );
}

function PrintableInvoice({ order, items }: { order: any; items: any[] }) {
  const addr = (order.address ?? {}) as Record<string, string | undefined>;
  const pointsDiscount = Number(order.points_used ?? 0) * 10;
  return (
    <div className="print-only invoice-print" dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" }}>
      <div style={{ maxWidth: "780px", margin: "0 auto", padding: "0 4mm", color: "#0a1a3a" }}>
        {/* Masthead */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px double #c9a24a", paddingBottom: "12px", marginBottom: "18px" }}>
          <div>
            <div style={{ fontSize: "28px", fontWeight: 900, letterSpacing: "-0.02em", color: "#0a1a3a" }}>
              الســـائــر
            </div>
            <div style={{ fontSize: "10px", color: "#c9a24a", fontWeight: 700, letterSpacing: "0.2em", marginTop: "2px" }}>
              ALSAAER · AUTO PARTS
            </div>
            <div style={{ fontSize: "10px", color: "#5c6c8a", marginTop: "6px", lineHeight: 1.6 }}>
              قطع غيار السيارات الأصلية · العراق
            </div>
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ display: "inline-block", padding: "6px 14px", background: "#0a1a3a", color: "#f5c96a", fontWeight: 900, fontSize: "12px", letterSpacing: "0.15em", borderRadius: "4px" }}>
              INVOICE · فاتورة
            </div>
            <div style={{ marginTop: "10px", fontSize: "11px", color: "#5c6c8a" }}>
              <div>رقم الفاتورة: <span style={{ fontFamily: "ui-monospace, monospace", color: "#0a1a3a", fontWeight: 700 }}>{order.order_number}</span></div>
              <div>التاريخ: <span style={{ color: "#0a1a3a", fontWeight: 700 }}>{formatArabicDate(order.created_at)}</span></div>
              <div>الحالة: <span style={{ color: "#0a1a3a", fontWeight: 700 }}>{statusLabel(order.status)}</span></div>
            </div>
          </div>
        </div>

        {/* Bill To */}
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

        {/* Items table */}
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

        {/* Notes + Totals */}
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

        {/* Footer */}
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