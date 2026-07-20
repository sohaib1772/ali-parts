import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, PackageCheck, Package as PackageIcon, PackageOpen, Truck, MapPin, Home, XCircle, StickyNote, Receipt, RefreshCw, Headphones } from "lucide-react";
import { orderByIdQuery } from "@/lib/queries";
import { formatIQD, formatArabicDate } from "@/lib/format";
import { statusLabel } from "@/lib/order-status";
import { markOrderSeen } from "@/lib/order-updates";
import { toast } from "sonner";
import { PrintableInvoice, InvoicePreviewDialog } from "@/components/printable-invoice";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/orders_/$id")({
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
  const { data, isLoading, error } = useQuery(orderByIdQuery(id));
  const order = (data as any)?.order;
  const items: any[] = (data as any)?.items ?? [];
  const customer = (data as any)?.customer ?? null;
  const router = useRouter();
  const qc = useQueryClient();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceItem, setReplaceItem] = useState<any>(null);
  const [replaceReason, setReplaceReason] = useState("");
  const [replaceSubmitting, setReplaceSubmitting] = useState(false);
  const [replaceDone, setReplaceDone] = useState(false);
  const { userId } = useAuth();

  const openReplace = (it: any) => {
    setReplaceItem(it);
    setReplaceReason("");
    setReplaceDone(false);
    setReplaceOpen(true);
  };

  const submitReplace = async () => {
    if (!userId || !replaceItem) return;
    const reason = replaceReason.trim();
    if (reason.length < 5) {
      toast.error("يرجى كتابة سبب الاستبدال (5 أحرف على الأقل)");
      return;
    }
    setReplaceSubmitting(true);
    const { error } = await supabase.from("replacement_requests").insert({
      user_id: userId,
      order_id: order.id,
      order_item_id: replaceItem.id,
      product_id: replaceItem.product_id,
      product_name_ar: replaceItem.name_ar,
      reason,
    });
    setReplaceSubmitting(false);
    if (error) {
      toast.error("تعذّر إرسال طلب الاستبدال");
      return;
    }
    setReplaceDone(true);
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
    if (!order) return;
    markOrderSeen(order.id, (order as any).updated_at ?? order.created_at);
  }, [order]);

  const activeIdx = TIMELINE.findIndex((t) => t.key === order?.status);
  const cancelled = order?.status === "cancelled";
  const canCancel = order?.status === "received" || order?.status === "preparing";
  const canReplace = order?.status === "delivered";
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    if (!confirm("هل تريد إلغاء هذا الطلب؟")) return;
    setCancelling(true);
    const { error } = await supabase.rpc("cancel_my_order", { p_order_id: order.id });
    setCancelling(false);
    if (error) {
      toast.error(error.message || "تعذّر إلغاء الطلب");
    } else {
      toast.success("تم إلغاء الطلب");
      qc.invalidateQueries({ queryKey: ["order", order.id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    }
  };

  // All hooks above this line so the order stays stable across renders.
  if (isLoading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">جاري التحميل...</div>;
  }

  if (error || !order) {
    return (
      <div className="min-h-screen grid place-items-center px-4 text-center">
        <div>
          <PackageIcon className="size-12 text-muted-foreground mx-auto mb-3" />
          <div className="text-lg font-bold mb-1">لم يتم العثور على الطلب</div>
          <Link to="/orders" className="text-gold text-sm font-bold">عودة لطلباتي</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="sticky top-0 z-20 bg-gradient-navy text-primary-foreground shadow-luxe no-print">
        <div className="mx-auto max-w-md md:max-w-3xl lg:max-w-5xl px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.history.back()} className="size-9 rounded-full bg-white/10 grid place-items-center"><ArrowRight className="size-5" /></button>
          <div className="flex-1">
            <div className="text-sm font-bold">تفاصيل الطلب</div>
            <div className="text-[10px] text-gold font-mono">{order.order_number}</div>
          </div>
          <button
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-gradient-gold text-navy font-bold text-xs shadow-gold hover:brightness-105 transition"
            aria-label="معاينة الفاتورة"
          >
            <Receipt className="size-4" /> الفاتورة
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-md md:max-w-3xl lg:max-w-5xl px-4 pt-4 space-y-4 no-print">
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
              <div key={it.id} className="space-y-2">
              <div className="flex gap-3">
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
                {canReplace && (
                  <button
                    type="button"
                    onClick={() => openReplace(it)}
                    className="mt-2 w-full h-9 rounded-xl border border-gold/50 text-navy text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-gold/10"
                  >
                    <RefreshCw className="size-3.5 text-gold" />
                    استبدال
                  </button>
                )}
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

      <PrintableInvoice order={order} items={items} customer={customer} domId="invoice-print-target" />
      <InvoicePreviewDialog
        order={order}
        items={items}
        customer={customer}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        domId="invoice-preview-target"
      />
      <AlertDialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <AlertDialogContent dir="rtl" className="max-w-sm">
          <AlertDialogHeader className="items-center sm:items-center">
            <div className="size-12 rounded-full bg-gold/15 grid place-items-center mb-2">
              <Headphones className="size-6 text-gold" />
            </div>
            <AlertDialogTitle className="text-base sm:text-lg">
              {replaceDone ? "تم استلام طلب الاستبدال" : "طلب استبدال"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center leading-relaxed">
              {replaceDone
                ? "سوف يتواصل معك قسم متابعة الاستبدال لمعرفة أسباب الخلل خلال 72 ساعة. نأسف على تأخر الرد بسبب الضغط."
                : "اكتب سبب طلب الاستبدال أو الخلل في المنتج، وسيتواصل معك قسم المتابعة خلال 72 ساعة."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!replaceDone && replaceItem && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground text-center">
                المنتج: <span className="font-bold text-navy">{replaceItem.name_ar}</span>
              </div>
              <textarea
                value={replaceReason}
                onChange={(e) => setReplaceReason(e.target.value)}
                placeholder="اذكر سبب الاستبدال بالتفصيل..."
                rows={4}
                maxLength={500}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 resize-none"
                dir="rtl"
              />
            </div>
          )}
          <AlertDialogFooter>
            {replaceDone ? (
              <div className="flex flex-col-reverse gap-2 w-full">
                <AlertDialogAction className="w-full">حسناً</AlertDialogAction>
                <Link
                  to="/replacements"
                  className="w-full h-10 rounded-xl bg-gradient-gold text-navy font-bold shadow-gold hover:brightness-105 flex items-center justify-center"
                >
                  عرض طلبات الاستبدال
                </Link>
              </div>
            ) : (
              <div className="flex flex-col-reverse gap-2 w-full">
                <AlertDialogCancel className="w-full mt-0">إلغاء</AlertDialogCancel>
                <button
                  type="button"
                  onClick={submitReplace}
                  disabled={replaceSubmitting}
                  className="w-full h-10 rounded-xl bg-gradient-gold text-navy font-bold shadow-gold hover:brightness-105 disabled:opacity-50"
                >
                  {replaceSubmitting ? "جاري الإرسال..." : "إرسال طلب الاستبدال"}
                </button>
              </div>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}