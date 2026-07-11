import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Package, Loader2 } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { formatIQD } from "@/lib/format";
import { readGuestOrders } from "@/lib/guest-cart";
import { toast } from "sonner";

export const Route = createFileRoute("/track")({
  ssr: false,
  component: TrackPage,
});

const STATUS_LABELS: Record<string, string> = {
  received: "تم استلام طلبك",
  preparing: "جاري التجهيز",
  packed: "تم التغليف",
  shipped: "تم الشحن",
  out_for_delivery: "خرج للتوصيل",
  delivered: "تم التسليم",
  cancelled: "ملغى",
};

function TrackPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const savedOrders = readGuestOrders();

  const lookup = async (num?: string, tokenOverride?: string) => {
    const q = (num ?? orderNumber).trim();
    if (!q) return toast.error("أدخل رقم الطلب");
    setLoading(true);
    setResult(null);
    try {
      const token = tokenOverride ?? savedOrders.find((r) => r.order_number === q)?.guest_token;
      if (!token) {
        toast.error("لم يتم العثور على هذا الطلب في هذا الجهاز");
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
      if (phone.trim()) {
        const addrPhone = String(order?.address?.phone || "").replace(/\D/g, "");
        const inputPhone = phone.replace(/\D/g, "");
        if (addrPhone && inputPhone && !addrPhone.endsWith(inputPhone.slice(-8))) {
          toast.error("رقم الهاتف لا يطابق الطلب");
          setLoading(false);
          return;
        }
      }
      setResult(order);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر العثور على الطلب");
    } finally {
      setLoading(false);
    }
  };

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
          <div className="bg-card rounded-2xl border border-border p-4 shadow-card space-y-3">
            <div>
              <div className="text-xs text-muted-foreground">رقم الطلب</div>
              <div className="font-mono font-bold text-lg">{result.order_number}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">الحالة</div>
              <div className="font-bold text-navy">{STATUS_LABELS[result.status] || result.status}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">الإجمالي</div>
              <div className="font-black text-navy">{formatIQD(result.total_iqd)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">المنتجات</div>
              <div className="space-y-1">
                {(result.items || []).map((it: any) => (
                  <div key={it.id} className="text-sm flex justify-between">
                    <span className="truncate">{it.name_ar} × {it.quantity}</span>
                    <span className="font-bold">{formatIQD(it.unit_price_iqd * it.quantity)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <Link to="/" className="block text-center text-sm text-gold font-bold pt-2">العودة للرئيسية</Link>
      </div>
    </PageShell>
  );
}