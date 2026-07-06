import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Package, ChevronLeft, X, Trash2, CheckSquare, Square, AlertTriangle } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { ordersQuery } from "@/lib/queries";
import { useAuth } from "@/lib/use-auth";
import { formatIQD, formatArabicDate } from "@/lib/format";
import { statusLabel, statusColor } from "@/lib/order-status";
import { isOrderUnseen, useOrderSeenMap } from "@/lib/order-updates";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  const { userId } = useAuth();
  const { data: orders = [] } = useQuery(ordersQuery(userId));
  const seen = useOrderSeenMap();
  const qc = useQueryClient();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"selected" | "all">("selected");

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(orders.map((o: any) => o.id)));
  const clearSel = () => setSelected(new Set());

  const openDeleteSelected = () => {
    if (!userId || selected.size === 0) return;
    setConfirmMode("selected");
    setConfirmOpen(true);
  };

  const openDeleteAll = () => {
    if (!userId || orders.length === 0) return;
    setConfirmMode("all");
    setConfirmOpen(true);
  };

  const executeDelete = async () => {
    if (!userId) return;
    setDeleting(true);
    setConfirmOpen(false);
    if (confirmMode === "selected") {
      const ids = Array.from(selected);
      const { error } = await supabase.from("orders").delete().in("id", ids).eq("user_id", userId);
      setDeleting(false);
      if (error) {
        toast.error("تعذّر مسح الطلبات");
      } else {
        toast.success("تم مسح الطلبات");
        setSelected(new Set());
        setSelectMode(false);
        qc.invalidateQueries({ queryKey: ["orders", userId] });
      }
    } else {
      const { error } = await supabase.from("orders").delete().eq("user_id", userId);
      setDeleting(false);
      if (error) {
        toast.error("تعذّر مسح الطلبات");
      } else {
        toast.success("تم مسح جميع الطلبات");
        setSelected(new Set());
        setSelectMode(false);
        qc.invalidateQueries({ queryKey: ["orders", userId] });
      }
    }
  };

  const cancelOrder = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("هل تريد إلغاء هذا الطلب؟")) return;
    setCancellingId(id);
    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", id);
    setCancellingId(null);
    if (error) {
      toast.error("تعذّر إلغاء الطلب");
    } else {
      toast.success("تم إلغاء الطلب");
      qc.invalidateQueries({ queryKey: ["orders", userId] });
    }
  };

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`orders-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["orders", userId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc]);

  return (
    <PageShell title="طلباتي">
      <div className="px-4 pt-4 space-y-3">
        {orders.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {!selectMode ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectMode(true)}
                  className="h-9 px-3 rounded-xl border border-border text-xs font-bold flex items-center gap-1.5 hover:bg-muted"
                >
                  <CheckSquare className="size-3.5" /> تحديد
                </button>
                <button
                  type="button"
                  onClick={openDeleteAll}
                  disabled={deleting}
                  className="h-9 px-3 rounded-xl border border-destructive/40 text-destructive text-xs font-bold flex items-center gap-1.5 hover:bg-destructive/10 disabled:opacity-50 ms-auto"
                >
                  <Trash2 className="size-3.5" /> مسح الكل
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={selected.size === orders.length ? clearSel : selectAll}
                  className="h-9 px-3 rounded-xl border border-border text-xs font-bold flex items-center gap-1.5 hover:bg-muted"
                >
                  {selected.size === orders.length ? <Square className="size-3.5" /> : <CheckSquare className="size-3.5" />}
                  {selected.size === orders.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
                </button>
                <span className="text-xs text-muted-foreground">{selected.size} محدد</span>
                <button
                  type="button"
                  onClick={() => { setSelectMode(false); clearSel(); }}
                  className="h-9 px-3 rounded-xl border border-border text-xs font-bold ms-auto hover:bg-muted"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={openDeleteSelected}
                  disabled={deleting || selected.size === 0}
                  className="h-9 px-3 rounded-xl bg-destructive text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" /> مسح المحدد
                </button>
              </>
            )}
          </div>
        )}
        {orders.length === 0 ? (
          <div className="py-20 text-center">
            <div className="size-20 rounded-full bg-muted grid place-items-center mx-auto mb-4">
              <Package className="size-10 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-bold mb-2">لا توجد طلبات بعد</h2>
            <p className="text-sm text-muted-foreground mb-6">ستظهر طلباتك هنا بعد إتمام أول عملية شراء</p>
            <Link to="/" className="inline-flex px-6 py-3 rounded-2xl bg-gradient-gold text-navy font-bold shadow-gold">ابدأ التسوق</Link>
          </div>
        ) : (
          orders.map((o: any) => {
            const updated = isOrderUnseen(seen, o.id, o.updated_at, o.created_at);
            const isSelected = selected.has(o.id);
            return (
            <Link
              key={o.id}
              to="/orders/$id"
              params={{ id: o.id }}
              onClick={(e) => {
                if (selectMode) {
                  e.preventDefault();
                  toggleSelect(o.id);
                }
              }}
              className={`block bg-card rounded-2xl border p-4 shadow-card hover:shadow-luxe transition ${updated ? "border-gold ring-1 ring-gold/40" : "border-border"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                {selectMode && (
                  <span className={`size-5 rounded-md border-2 grid place-items-center shrink-0 ${isSelected ? "bg-gold border-gold text-navy" : "border-border"}`}>
                    {isSelected && <CheckSquare className="size-3" />}
                  </span>
                )}
                <span className="text-xs font-mono text-muted-foreground">{o.order_number}</span>
                {updated && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">تحديث جديد</span>
                )}
                <span className={`ms-auto text-[10px] font-bold px-2 py-1 rounded-full ${statusColor(o.status)}`}>{statusLabel(o.status)}</span>
              </div>
              <div className="text-xs text-muted-foreground mb-2">{formatArabicDate(o.created_at)}</div>
              <div className="flex justify-between items-baseline">
                <span className="text-lg font-black text-navy">{formatIQD(o.total_iqd)}</span>
                <ChevronLeft className="size-4 text-muted-foreground" />
              </div>
              {(o.status === "received" || o.status === "preparing") && (
                <button
                  onClick={(e) => cancelOrder(e, o.id)}
                  disabled={cancellingId === o.id}
                  className="mt-3 w-full h-9 rounded-xl border border-destructive/40 text-destructive text-xs font-bold flex items-center justify-center gap-1 hover:bg-destructive/10 disabled:opacity-50"
                >
                  <X className="size-3.5" />
                  {cancellingId === o.id ? "جاري الإلغاء..." : "إلغاء الطلب"}
                </button>
              )}
            </Link>
            );
          })
        )}
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl" className="max-w-sm">
          <AlertDialogHeader className="items-center sm:items-center">
            <div className="size-12 rounded-full bg-destructive/10 grid place-items-center mb-2">
              <AlertTriangle className="size-6 text-destructive" />
            </div>
            <AlertDialogTitle className="text-base sm:text-lg">
              {confirmMode === "all" ? "مسح جميع الطلبات" : `مسح ${selected.size} طلب`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              {confirmMode === "all"
                ? "سيتم حذف جميع طلباتك بشكل نهائي. لا يمكن التراجع عن هذا الإجراء."
                : "سيتم حذف الطلبات المحددة بشكل نهائي. لا يمكن التراجع عن هذا الإجراء."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-col-reverse gap-2">
            <AlertDialogCancel className="w-full mt-0">
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={executeDelete}
              disabled={deleting}
            >
              {deleting ? "جاري الحذف..." : "حذف نهائي"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}