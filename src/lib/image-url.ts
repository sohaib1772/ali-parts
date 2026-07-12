/**
 * Rewrite a Supabase Storage signed URL to the image-transform endpoint
 * so we get a smaller, faster thumbnail instead of the full original.
 *
 * Signed object URL:  /storage/v1/object/sign/<bucket>/<path>?token=...
 * Signed render URL:  /storage/v1/render/image/sign/<bucket>/<path>?token=...&width=...
 *
 * Works only on Supabase Storage URLs; anything else is returned untouched.
 */
export function thumbUrl(
  url: string | null | undefined,
  opts: { width?: number; quality?: number; resize?: "cover" | "contain" | "fill" } = {},
): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (!u.pathname.includes("/storage/v1/object/sign/") && !u.pathname.includes("/storage/v1/render/image/sign/")) {
      return url;
    }
    // Skip non-image assets (mp4/webm/etc.) — the render endpoint only accepts images.
    if (/\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(u.pathname)) return url;

    u.pathname = u.pathname.replace(
      "/storage/v1/object/sign/",
      "/storage/v1/render/image/sign/",
    );
    const { width = 600, quality = 70, resize = "cover" } = opts;
    u.searchParams.set("width", String(width));
    u.searchParams.set("quality", String(quality));
    u.searchParams.set("resize", resize);
    return u.toString();
  } catch {
    return url;
  }
}