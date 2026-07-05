import { supabase } from "@/integrations/supabase/client";

// Signed URL TTL — 5 years (bucket is private, so we sign long-lived URLs).
const SIGNED_TTL_SECONDS = 60 * 60 * 24 * 365 * 5;

/**
 * Upload a user avatar to the private `avatars` bucket and return a signed URL
 * suitable for direct use in <img src>. Stored path is `<uid>/avatar-<ts>.<ext>`.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!userId) throw new Error("Not signed in");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type || undefined });
  if (upErr) throw upErr;

  const { data: signed, error: signErr } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) throw signErr ?? new Error("تعذر توليد رابط الصورة");

  return signed.signedUrl;
}