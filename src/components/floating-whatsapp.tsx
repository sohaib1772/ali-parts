import { WhatsappIcon } from "./icons";
import { whatsappLink } from "@/lib/format";

export function FloatingWhatsapp() {
  return (
    <a
      href={whatsappLink("السلام عليكم، أرغب بالاستفسار عن قطعة")}
      target="_blank"
      rel="noreferrer"
      aria-label="تواصل واتساب"
      className="fixed z-40 bottom-20 start-4 size-14 rounded-full bg-whatsapp text-white grid place-items-center shadow-luxe animate-pulse hover:animate-none hover:scale-105 transition"
    >
      <WhatsappIcon className="size-7" />
    </a>
  );
}