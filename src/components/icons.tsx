import whatsappIconAsset from "@/assets/whatsapp-icon.png.asset.json";

export function WhatsappIcon({ className = "" }: { className?: string }) {
  return (
    <img
      src={whatsappIconAsset.url}
      alt="WhatsApp"
      className={`object-contain ${className}`}
    />
  );
}