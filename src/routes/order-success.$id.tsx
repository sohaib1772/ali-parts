import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Package, Loader2 } from "lucide-react";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orderByIdQuery } from "@/lib/queries";
import { formatIQD } from "@/lib/format";
import { useAuth } from "@/lib/use-auth";
import { findGuestTokenById } from "@/lib/guest-cart";

const guestOrderByIdQuery = (id: string, token: string) =>
  queryOptions({
    queryKey: ["guest-order", id, token],
    queryFn: async () => {
      // We stored order_number when placing the order; but here we only have id.
      // Fetch by looking up via order_number reverse — since we can't SELECT anon,
      // we rely on stored ref that has order_number.
      const ref = JSON.parse(localStorage.getItem("aliparts.guest_orders.v1") || "[]").find(
        (r: any) => r.order_id === id,
      );
      if (!ref) throw new Error("Order ref not found");
      const { data, error } = await supabase.rpc("get_guest_order", {
        p_order_number: ref.order_number,
        p_guest_token: token,
      });
      if (error) throw error;
      return { order: data as any };
    },
    enabled: !!id && !!token,
  });

export const Route = createFileRoute("/order-success/$id")({
  ssr: false,
  component: OrderSuccess,
});

function OrderSuccess() {
  const { id } = Route.useParams();
  const { userId, loading } = useAuth();
  const guestToken = typeof window !== "undefined" ? findGuestTokenById(id) : null;

  const authedQ = useQuery({ ...orderByIdQuery(id), enabled: !!userId });
  const guestQ = useQuery({ ...guestOrderByIdQuery(id, guestToken ?? ""), enabled: !userId && !!guestToken });

  if (loading || authedQ.isLoading || guestQ.isLoading) {
    return (
      <div className="min-h-screen bg-gradient-hero text-primary-foreground grid place-items-center">
        <Loader2 className="size-8 animate-spin text-gold" />
      </div>
    );
  }

  const order = (authedQ.data as any)?.order ?? (guestQ.data as any)?.order;
  if (!order) {
    return (
      <div className="min-h-screen bg-gradient-hero text-primary-foreground grid place-items-center px-6 text-center">
        <div>
          <h1 className="text-xl font-black mb-2">تعذر عرض الطلب</h1>
          <Link to="/" className="text-gold font-bold">العودة للرئيسية</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero text-primary-foreground flex flex-col">
      <div className="mx-auto w-full max-w-md px-6 pt-16 pb-8 flex-1 flex flex-col items-center text-center">
        <div className="size-24 rounded-full bg-gradient-gold text-navy grid place-items-center shadow-gold mb-6 animate-in zoom-in duration-500">
          <CheckCircle2 className="size-14" strokeWidth={2.5} />
        </div>
        <h1 className="text-3xl font-black mb-2">شكراً لثقتك بنا!</h1>
        <p className="text-primary-foreground/80 mb-6">تم استلام طلبك بنجاح، سنبدأ بتجهيزه فوراً.</p>
        <div className="w-full bg-white/10 border border-white/20 rounded-2xl p-4 mb-3">
          <div className="text-xs text-gold mb-1">رقم الطلب</div>
          <div className="font-mono font-bold text-lg">{order.order_number}</div>
        </div>
        <div className="w-full bg-white/10 border border-white/20 rounded-2xl p-4 mb-8">
          <div className="text-xs text-gold mb-1">الإجمالي</div>
          <div className="font-black text-2xl text-gold">{formatIQD(order.total_iqd)}</div>
        </div>

        {userId ? (
          <Link to="/orders/$id" params={{ id: order.id }} className="w-full h-12 rounded-2xl bg-gradient-gold text-navy font-black flex items-center justify-center gap-2 shadow-gold mb-3">
            <Package className="size-4" /> تتبع الطلب
          </Link>
        ) : (
          <Link
            to="/track"
            search={{ o: order.order_number } as any}
            className="w-full h-12 rounded-2xl bg-gradient-gold text-navy font-black flex items-center justify-center gap-2 shadow-gold mb-3"
          >
            <Package className="size-4" /> تتبع الطلب
          </Link>
        )}
        <Link to="/" className="text-sm text-gold font-bold">العودة للرئيسية</Link>
      </div>
    </div>
  );
}