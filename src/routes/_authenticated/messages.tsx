import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { WhatsappIcon } from "@/components/icons";
import { whatsappLink } from "@/lib/format";
import { useSetting } from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/messages")({
  component: MessagesPage,
});

function MessagesPage() {
  const waNumber = useSetting("whatsapp_number");
  return (
    <PageShell wide title="الرسائل">
      <div className="px-6 pt-8 text-center md:max-w-2xl md:mx-auto">
        <div className="size-20 rounded-full bg-whatsapp/10 grid place-items-center mx-auto mb-4">
          <WhatsappIcon className="size-10 text-whatsapp" />
        </div>
        <h2 className="text-lg font-bold mb-2">تواصل معنا مباشرة</h2>
        <p className="text-sm text-muted-foreground mb-6">فريق خدمة العملاء متاح للرد على استفساراتك عبر واتساب</p>
        <a href={whatsappLink("مرحباً، أحتاج للمساعدة", waNumber)} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-whatsapp text-white font-bold shadow-luxe">
          <WhatsappIcon className="size-5" /> افتح المحادثة
        </a>
      </div>
    </PageShell>
  );
}