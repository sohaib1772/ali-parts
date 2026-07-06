import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { uploadWithProgress } from "@/lib/upload-with-progress";

export const isAdminQuery = (userId: string | null) =>
  queryOptions({
    queryKey: ["is_admin", userId],
    queryFn: async () => {
      if (!userId) return false;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
    enabled: !!userId,
  });

export function useIsAdmin() {
  const { userId } = useAuth();
  const { data } = useQuery(isAdminQuery(userId));
  return !!data;
}

export const settingsQuery = () =>
  queryOptions({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) map[row.key] = row.value ?? "";
      return map;
    },
    staleTime: 60_000,
  });

export function useSetting(key: string, fallback = "") {
  const { data } = useQuery(settingsQuery());
  return data?.[key] ?? fallback;
}

/**
 * Compress an image in the browser before upload.
 * Downscales to fit within `maxDim` and re-encodes as JPEG (or keeps PNG for
 * transparency). Cuts payloads 3–10x, so uploads finish much faster on mobile.
 */
export async function compressImageFile(
  file: File,
  maxDim = 1600,
  quality = 0.82,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // Don't reprocess tiny files or unsupported formats (GIF/SVG).
  if (file.size < 200 * 1024) return file;
  if (/gif|svg/.test(file.type)) return file;
  const keepPng = file.type === "image/png";
  try {
    const bitmap = await createImageBitmap(file).catch(async () => {
      // Fallback for Safari where createImageBitmap can fail on some formats.
      const url = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
      });
      URL.revokeObjectURL(url);
      return img as unknown as ImageBitmap;
    });
    const w = (bitmap as any).width as number;
    const h = (bitmap as any).height as number;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const nw = Math.round(w * scale);
    const nh = Math.round(h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = nw;
    canvas.height = nh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, nw, nh);
    const mime = keepPng ? "image/png" : "image/jpeg";
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, mime, keepPng ? undefined : quality),
    );
    if (!blob || blob.size >= file.size) return file;
    const ext = keepPng ? "png" : "jpg";
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "." + ext, {
      type: mime,
    });
  } catch {
    return file;
  }
}

export async function uploadProductImage(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const compressed = await compressImageFile(file);
  const ext = (compressed.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  await uploadWithProgress("product-images", path, compressed, onProgress);
  const { data } = await supabase.storage
    .from("product-images")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  return data?.signedUrl ?? "";
}

export async function uploadMediaFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  // Compress if it's an image; upload videos as-is (browser can't transcode).
  const toUpload = file.type.startsWith("image/")
    ? await compressImageFile(file)
    : file;
  const ext = (toUpload.name.split(".").pop() || "bin").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  await uploadWithProgress("product-images", path, toUpload, onProgress);
  const { data } = await supabase.storage
    .from("product-images")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  return data?.signedUrl ?? "";
}