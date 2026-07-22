import { WhatsappIcon } from "./icons";
import { whatsappLink } from "@/lib/format";
import { useSetting } from "@/lib/admin";

/**
 * The button is viewport-anchored, so it has to clear BottomNav twice over:
 * the 5rem offset clears the nav's own height, and the safe-area inset clears
 * the Android system nav bar that the nav reserves through its own
 * `pb-[env(safe-area-inset-bottom)]`. With a bare `bottom-20` the button lands
 * inside that reserved strip and disappears behind the nav on a device with
 * 3-button navigation. z-50 keeps it above BottomNav (z-40), which previously
 * won purely on DOM order.
 */
export function FloatingWhatsapp() {
  const number = useSetting("whatsapp_number");
  return (
    <a
      href={whatsappLink("السلام عليكم، أرغب بالاستفسار عن قطعة", number)}
      target="_blank"
      rel="noreferrer"
      aria-label="تواصل واتساب"
      className="fixed z-50 bottom-[calc(5rem+env(safe-area-inset-bottom))] start-4 size-14 rounded-full bg-whatsapp text-white grid place-items-center shadow-luxe animate-pulse hover:animate-none hover:scale-105 transition"
    >
      <WhatsappIcon className="size-7" />
    </a>
  );
}