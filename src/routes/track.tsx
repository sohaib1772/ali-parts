import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Package,
  Loader2,
  PackageCheck,
  Package as PackageIcon,
  PackageOpen,
  Truck,
  MapPin,
  Home,
  XCircle,
  StickyNote,
  Bell,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { formatIQD, formatArabicDate } from "@/lib/format";
import { readGuestOrders } from "@/lib/guest-cart";
import { statusLabel } from "@/lib/order-status";
import { toast } from "sonner";

export const Route = createFileRoute("/track")({
  ssr: false,
  component: TrackPage,
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

function TrackPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const savedOrders = readGuestOrders();
  const lastStatusRef = useRef<string | null>(null);

  const lookup = async (num?: string, tokenOverride?: string, silent?: boolean) => {
    const q = (num ?? orderNumber).trim();
    if (!q) return toast.error("أدخل رقم الطلب");
    if (!silent) {
      setLoading(true);
      setResult(null);
    }
    try {
      const token = tokenOverride ?? savedOrders.find((r) => r.order_number === q)?.guest_token;
      if (!token) {
        if (!silent) toast.error("لم يتم العثور على هذا الطلب في هذا الجهاز");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.rpc("get_guest_order", {
        p_order_number: q,
        p_guest_token: token,
      });
      if (error) throw error;
      const order: any = data;
      // Optional phone verification: match against stored address phone.
      if (!silent && phone.trim()) {
        const addrPhone = String(order?.address?.phone || "").replace(/\D/g, "");
        const inputPhone = phone.replace(/\D/g, "");
        if (addrPhone && inputPhone && !addrPhone.endsWith(inputPhone.slice(-8))) {
          toast.error("رقم الهاتف لا يطابق الطلب");
          setLoading(false);
          return;
        }
      }
      // Detect status change for notification.
      const prev = lastStatusRef.current;
      if (prev && prev !== order.status) {
        toast.success(`تحديث حالة الطلب: ${statusLabel(order.status)}`, {
          icon: <Bell className="size-4 text-gold" />,
        });
      }
      lastStatusRef.current = order.status;
      setResult(order);
      setActiveToken(token);
    } catch (e: any) {
      if (!silent) toast.error(e?.message || "تعذّر العثور على الطلب");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Auto-load via ?o=<order_number>
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const n = p.get("o");
    if (n) {
      setOrderNumber(n);
      lookup(n);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for status updates every 20s while a result is open, and refresh
  // when the tab regains focus.
  useEffect(() => {
    if (!result?.order_number || !activeToken) return;
    const num = result.order_number;
    const tok = activeToken;
    const iv = window.setInterval(() => lookup(num, tok, true), 20000);
    const onFocus = () => lookup(num, tok, true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.order_number, activeToken]);

  const activeIdx = result ? TIMELINE.findIndex((t) => t.key === result.status) : -1;
  const cancelled = result?.status === "cancelled";

  return (
    <PageShell title="تتبع الطلب">
      <div className="px-4 pt-4 space-y-4">
        <div className="bg-card rounded-2xl border border-border p-4 shadow-card space-y-2">
          <div className="text-xs text-muted-foreground mb-2">أدخل رقم طلبك لمتابعة حالته</div>
          <input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="مثال: AP240711ABC123"
            className="w-full h-11 rounded-xl border-2 border-border bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gold"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="رقم الهاتف (اختياري للتأكيد)"
            type="tel"
            className="w-full h-11 rounded-xl border-2 border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
          />
          <button
            onClick={() => lookup()}
            disabled={loading}
            className="w-full h-12 rounded-xl bg-gradient-gold text-navy font-black shadow-gold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            بحث عن الطلب
          </button>
        </div>

        {savedOrders.length > 0 && !result && (
          <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
            <div className="text-xs text-muted-foreground mb-2">طلباتك السابقة على هذا الجهاز</div>
            <div className="space-y-2">
              {savedOrders.map((r) => (
                <button
                  key={r.order_number}
                  onClick={() => lookup(r.order_number, r.guest_token)}
                  className="w-full text-start rounded-xl border-2 border-border p-3 hover:border-gold transition flex items-center gap-3"
                >
                  <Package className="size-4 text-gold" />
                  <div className="flex-1">
                    <div className="font-mono text-sm font-bold">{r.order_number}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("ar-IQ")}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {result && (
          <>
            <div className="bg-card rounded-2xl border border-border p-4 shadow-card flex items-center justify-between gap-2">
              <div>
                <div className="text-xs text-muted-foreground">رقم الطلب</div>
                <div className="font-mono font-bold text-base">{result.order_number}</div>
              </div>
              <div className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                تحديث تلقائي
              </div>
            </div>

            {cancelled ? (
              <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 flex items-center gap-3">
                <XCircle className="size-6 text-destructive" />
                <div>
                  <div className="font-bold text-destructive">تم إلغاء الطلب</div>
                  <div className="text-xs text-muted-foreground">للاستفسار تواصل معنا</div>
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
                {(result.items || []).map((it: any) => (
                  <div key={it.id} className="flex gap-3">
                    <div className="size-14 rounded-xl bg-muted overflow-hidden flex-shrink-0">
                      {it.image_url && <img src={it.image_url} alt="" className="size-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold line-clamp-1">{it.name_ar}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>× {it.quantity}</span>
                        {it.side && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-navy text-primary-foreground text-[10px] font-black">
                            {it.side === "LH" ? "LH · يسار" : it.side === "RH" ? "RH · يمين" : it.side}
                          </span>
                        )}
                      </div>
                      {it.note && (
                        <div className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground bg-muted/50 rounded-md p-1.5">
                          <StickyNote className="size-3 text-gold shrink-0 mt-0.5" />
                          <span className="whitespace-pre-wrap">{it.note}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-sm font-bold self-center">{formatIQD(Number(it.unit_price_iqd) * it.quantity)}</div>
                  </div>
                ))}
              </div>
            </div>

            {result.notes && (
              <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
                <div className="flex items-center gap-2 mb-2">
                  <StickyNote className="size-4 text-gold" />
                  <span className="text-xs font-bold text-gold">ملاحظتك على الطلب</span>
                </div>
                <div className="text-sm whitespace-pre-wrap">{result.notes}</div>
              </div>
            )}

            {result.address && (
              <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
                <div className="text-xs font-bold text-gold mb-3">عنوان التوصيل</div>
                <div className="space-y-2 text-sm">
                  <AddressRow label="الاسم الكامل" value={result.address.full_name} />
                  <AddressRow label="رقم الهاتف" value={result.address.phone} mono />
                  <AddressRow label="المحافظة" value={result.address.city} />
                  <AddressRow label="المنطقة / القضاء" value={result.address.area} />
                  <AddressRow label="الشارع / تفاصيل" value={result.address.street} />
                  <AddressRow label="ملاحظات إضافية" value={result.address.notes} muted />
                </div>
              </div>
            )}

            <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
              <div className="flex justify-between text-sm py-1"><span className="text-muted-foreground">المجموع الفرعي</span><span>{formatIQD(result.subtotal_iqd)}</span></div>
              <div className="flex justify-between text-sm py-1"><span className="text-muted-foreground">التوصيل</span><span>{formatIQD(result.shipping_iqd)}</span></div>
              <div className="border-t border-border mt-2 pt-3 flex justify-between items-baseline">
                <span className="font-bold">الإجمالي</span>
                <span className="text-xl font-black text-navy">{formatIQD(result.total_iqd)}</span>
              </div>
            </div>

            <div className="text-center text-xs text-muted-foreground">
              تم الطلب في {formatArabicDate(result.created_at)}
              <br />
              الحالة: {statusLabel(result.status)}
            </div>
          </>
        )}

        <Link to="/" className="block text-center text-sm text-gold font-bold pt-2">العودة للرئيسية</Link>
      </div>
    </PageShell>
  );
}