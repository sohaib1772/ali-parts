import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2, Package } from "lucide-react";
import { WhatsappIcon } from "@/components/icons";
import { orderByIdQuery } from "@/lib/queries";
import { buildOrderWhatsAppMessage, formatIQD, formatIraqiWhatsAppNumber, whatsappLink } from "@/lib/format";

const ADMIN_WHATSAPP = formatIraqiWhatsAppNumber("009647855500585");


export const Route = createFileRoute("/order-success/$id")({
  ssr: false,
  loader: ({ context, params }) => context.queryClient.ensureQueryData(orderByIdQuery(params.id)),
  component: OrderSuccess,
});

function OrderSuccess() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(orderByIdQuery(id));
  const { order, items, customer } = data as any;

  const message = buildOrderWhatsAppMessage(order, items ?? [], customer);
  const waHref = whatsappLink(message, ADMIN_WHATSAPP);

  return (
    <div className="min-h-screen bg-gradient-hero text-primary-foreground flex flex-col">
      <div className="mx-auto w-full max-w-md px-6 pt-16 pb-8 flex-1 flex flex-col items-center text-center">
        <div className="size-24 rounded-full bg-gradient-gold text-navy grid place-items-center shadow-gold mb-6 animate-in zoom-in duration-500">
          <CheckCircle2 className="size-14" strokeWidth={2.5} />
        </div>
        <h1 className="text-3xl font-black mb-2">شكراً لثقتك بنا!</h1>
        <p className="text-primary-foreground/80 mb-6">تم استلام طلبك بنجاح، سنبدأ بتجهيزه فوراً.</p>
        <p className="text-primary-foreground/90 text-sm mb-4 font-bold">
          لتأكيد الطلب بشكل أسرع، أرسل تفاصيله لنا على واتساب 👇
        </p>

        <div className="w-full bg-white/10 border border-white/20 rounded-2xl p-4 mb-3">
          <div className="text-xs text-gold mb-1">رقم الطلب</div>
          <div className="font-mono font-bold text-lg">{order.order_number}</div>
        </div>
        <div className="w-full bg-white/10 border border-white/20 rounded-2xl p-4 mb-8">
          <div className="text-xs text-gold mb-1">الإجمالي</div>
          <div className="font-black text-2xl text-gold">{formatIQD(order.total_iqd)}</div>
        </div>

        <a
          href={waHref}
          target="_blank"
          rel="noreferrer"
          className="w-full h-14 rounded-2xl bg-whatsapp text-white font-black flex items-center justify-center gap-2 shadow-gold mb-3 text-base"
        >
          <WhatsappIcon className="size-5" /> أرسل الطلب عبر واتساب
        </a>

        <Link to="/orders/$id" params={{ id: order.id }} className="w-full h-12 rounded-2xl bg-gradient-gold text-navy font-black flex items-center justify-center gap-2 shadow-gold mb-3">
          <Package className="size-4" /> تتبع الطلب
        </Link>
        <Link to="/" className="text-sm text-gold font-bold">العودة للرئيسية</Link>
      </div>
    </div>
  );
}