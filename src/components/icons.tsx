import { MessageCircle } from "lucide-react";

// WhatsApp brand icons were removed from lucide-react; MessageCircle is the
// conventional stand-in. Renders in currentColor so existing text-* classes
// (e.g. white-on-green) keep working. Previously this pointed at a Lovable
// /__l5e/ pointer asset that 404s off Lovable, showing a broken image.
export function WhatsappIcon({ className = "" }: { className?: string }) {
  return <MessageCircle className={`object-contain ${className}`} aria-label="WhatsApp" />;
}
