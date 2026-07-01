import { createFileRoute } from "@tanstack/react-router";
import { Phone, MapPin } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { WhatsappIcon } from "@/components/icons";
import { whatsappLink, WHATSAPP_NUMBER } from "@/lib/format";
import { useSetting } from "@/lib/admin";

export const Route = createFileRoute("/contact")({
  head: () => ({ meta: [{ title: "اتصل بنا — Ali Parts" }] }),
  component: ContactPage,
});

function ContactPage() {
  const address = useSetting("store_address", "بغداد، العراق");
  const waNumber = useSetting("whatsapp_number", WHATSAPP_NUMBER);
  const phoneNumber = useSetting("phone_number", "") || waNumber;
  return (
    <PageShell title="اتصل بنا">
      <div className="px-4 pt-4 space-y-3">
        <a href={whatsappLink("مرحباً", waNumber)} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-card rounded-2xl border border-border p-4 shadow-card hover:shadow-luxe transition">
          <div className="size-12 rounded-xl bg-whatsapp/10 text-whatsapp grid place-items-center"><WhatsappIcon className="size-6" /></div>
          <div>
            <div className="font-bold">واتساب</div>
            <div className="text-xs text-muted-foreground" dir="ltr">+{waNumber}</div>
          </div>
        </a>
        <a href={`tel:+${phoneNumber}`} className="flex items-center gap-3 bg-card rounded-2xl border border-border p-4 shadow-card">
          <div className="size-12 rounded-xl bg-gold/10 text-gold grid place-items-center"><Phone className="size-6" /></div>
          <div>
            <div className="font-bold">اتصال هاتفي</div>
            <div className="text-xs text-muted-foreground" dir="ltr">+{phoneNumber}</div>
          </div>
        </a>
        <div className="flex items-center gap-3 bg-card rounded-2xl border border-border p-4 shadow-card">
          <div className="size-12 rounded-xl bg-navy/10 text-navy grid place-items-center"><MapPin className="size-6" /></div>
          <div>
            <div className="font-bold">الموقع</div>
            <div className="text-xs text-muted-foreground">{address}</div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}