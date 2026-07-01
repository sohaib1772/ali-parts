import { WhatsappIcon } from "./icons";
import { whatsappLink } from "@/lib/format";
import { useSetting } from "@/lib/admin";

export function FloatingWhatsapp() {
  const number = useSetting("whatsapp_number");
  return (
    <a
      href={whatsappLink("السلام عليكم، أرغب بالاستفسار عن قطعة", number)}
      target="_blank"
      rel="noreferrer"
      aria-label="تواصل واتساب"
      className="fixed z-40 bottom-20 start-4 size-14 rounded-full bg-whatsapp text-white grid place-items-center shadow-luxe animate-pulse hover:animate-none hover:scale-105 transition"
    >
      <WhatsappIcon className="size-7" />
    </a>
  );
}