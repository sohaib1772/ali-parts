import { useSetting } from "@/lib/admin";
import { formatIraqiWhatsAppNumber } from "@/lib/format";
import { AlertTriangle } from "lucide-react";

/**
 * Shared contact block for the legal pages (/privacy and /terms).
 *
 * Contact details come from admin settings (Settings: owner name, address,
 * email, WhatsApp number). Each falls back to a known-good value so a customer
 * never sees a blank contact detail; the amber banner is driven by the RAW
 * settings, so the operator is still told which ones are unset.
 */
const FALLBACK_OWNER = "Maktab Ali Chevrolet";
const FALLBACK_ADDRESS = "Erbil, Kurdistan Region, Iraq";
const FALLBACK_EMAIL = "aliskida816@gmail.com";
const FALLBACK_WA = "9647737959595";

export function useLegalContact() {
  const rawOwner = useSetting("store_owner", "").trim();
  const rawAddress = useSetting("store_address", "").trim();
  const rawEmail = useSetting("store_email", "").trim();
  const rawWa = useSetting("whatsapp_number", "").trim();
  const rawStoreName = useSetting("store_name", "").trim();

  return {
    storeName: rawStoreName || FALLBACK_OWNER,
    ownerName: rawOwner || FALLBACK_OWNER,
    address: rawAddress || FALLBACK_ADDRESS,
    supportEmail: rawEmail || FALLBACK_EMAIL,
    waNumber: formatIraqiWhatsAppNumber(rawWa || FALLBACK_WA),
    missing: !rawOwner || !rawAddress || !rawEmail || !rawWa,
  };
}

export function MissingSettingsNotice() {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 p-3 text-xs">
      <AlertTriangle className="size-4 shrink-0 mt-0.5" />
      <span>
        Store owner details are not fully filled in yet. Please update them in the admin panel (Settings: owner name,
        address, email, WhatsApp number). Fallback values are shown below in the meantime.
      </span>
    </div>
  );
}

export function ContactList({
  ownerName,
  address,
  supportEmail,
  waNumber,
}: {
  ownerName: string;
  address: string;
  supportEmail: string;
  waNumber: string;
}) {
  return (
    <ul className="list-none ps-0 space-y-1 mt-2">
      <li>
        <strong>{ownerName}</strong>
      </li>
      <li>{address}</li>
      <li>
        Email:{" "}
        <a className="text-gold underline" href={`mailto:${supportEmail}`}>
          {supportEmail}
        </a>
      </li>
      <li>
        Phone:{" "}
        <a className="text-gold underline" href={`tel:+${waNumber}`} dir="ltr">
          +{waNumber}
        </a>
      </li>
      <li>
        WhatsApp:{" "}
        <a
          className="text-gold underline"
          href={`https://wa.me/${waNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          dir="ltr"
        >
          +{waNumber}
        </a>
      </li>
    </ul>
  );
}
