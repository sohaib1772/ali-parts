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
  const { data, isLoading, isFetching } = useQuery(isAdminQuery(userId));
  return { isAdmin: !!data, isLoading: !!userId && (isLoading || isFetching && data === undefined) } as const;
}

export type StaffPermissions = {
  can_orders: boolean;
  can_products: boolean;
  can_replacements: boolean;
  can_block: boolean;
};

export const staffPermissionsQuery = (userId: string | null) =>
  queryOptions({
    queryKey: ["staff_permissions", userId],
    queryFn: async (): Promise<StaffPermissions | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("staff_permissions")
        .select("can_orders, can_products, can_replacements, can_block")
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !data) return null;
      return data as StaffPermissions;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

export function useStaffPermissions() {
  const { userId } = useAuth();
  const { data, isLoading, isFetching } = useQuery(staffPermissionsQuery(userId));
  return { staff: data ?? null, isLoading: !!userId && (isLoading || isFetching && data === undefined) } as const;
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
  // Compress images always; try to re-encode videos to a smaller bitrate
  // in the browser so uploads finish much faster on mobile.
  let toUpload = file;
  if (file.type.startsWith("image/")) {
    toUpload = await compressImageFile(file);
  } else if (file.type.startsWith("video/")) {
    toUpload = await compressVideoFile(file, onProgress);
  }
  const isCompressedVideo = toUpload !== file && file.type.startsWith("video/");
  const ext = (toUpload.name.split(".").pop() || "bin").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  // If we already used the first 50% of progress for the compression pass,
  // map the upload's 0..1 into 0.5..1 so the bar keeps moving forward.
  const uploadProgress = isCompressedVideo && onProgress
    ? (p: number) => onProgress(0.5 + p * 0.5)
    : onProgress;
  await uploadWithProgress("product-images", path, toUpload, uploadProgress);
  onProgress?.(1);
  const { data } = await supabase.storage
    .from("product-images")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  return data?.signedUrl ?? "";
}

/**
 * Re-encode a video in the browser using MediaRecorder + captureStream at a
 * bounded bitrate and width. This can cut phone-recorded clips (often
 * 20–50 Mbps) down to a few megabytes so the upload is dramatically faster.
 *
 * `onProgress` (0..0.5) reflects the compression pass; the upload progress
 * (0.5..1) is reported by the actual upload step afterwards.
 * If anything fails or the browser lacks support, we return the original file.
 */
export async function compressVideoFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<File> {
  // Skip tiny clips — probably not worth the re-encode.
  if (file.size < 3 * 1024 * 1024) return file;
  if (typeof MediaRecorder === "undefined") return file;

  // Pick a widely supported output container.
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  const mimeType = candidates.find((t) => {
    try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
  });
  if (!mimeType) return file;

  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = false;
    video.playsInline = true;
    video.preload = "auto";
    // Some Safari builds require the element in the DOM to play.
    video.style.position = "fixed";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    document.body.appendChild(video);

    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error("metadata"));
    });

    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    if (!srcW || !srcH) {
      document.body.removeChild(video);
      return file;
    }

    // Bound width to 1280 while keeping aspect ratio.
    const maxW = 1280;
    const scale = Math.min(1, maxW / srcW);
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);

    // @ts-expect-error - captureStream typing varies across browsers
    const stream: MediaStream = (video.captureStream?.() ?? video.mozCaptureStream?.());
    if (!stream) {
      document.body.removeChild(video);
      return file;
    }

    const videoBitsPerSecond = 2_200_000; // ~2.2 Mbps target
    const audioBitsPerSecond = 96_000;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond, audioBitsPerSecond });
    } catch {
      document.body.removeChild(video);
      return file;
    }

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    let tick: number | null = null;
    if (duration > 0 && onProgress) {
      tick = window.setInterval(() => {
        // Cap the compression pass at 50% so the upload phase can fill the rest.
        onProgress(Math.min(0.5, (video.currentTime / duration) * 0.5));
      }, 200);
    }

    // Start recording, then play from the beginning.
    recorder.start(500);
    try { video.currentTime = 0; } catch {}
    await video.play().catch(() => {});

    await new Promise<void>((res) => {
      const done = () => { recorder.stop(); };
      video.onended = done;
      // Safety timeout in case `ended` never fires.
      const safety = window.setTimeout(done, Math.max(30_000, (duration + 5) * 1000));
      recorder.onstop = () => {
        window.clearTimeout(safety);
        res();
      };
    });

    if (tick != null) window.clearInterval(tick);
    try { video.pause(); } catch {}
    document.body.removeChild(video);

    const outType = mimeType.split(";")[0];
    const outBlob = new Blob(chunks, { type: outType });

    // Only keep the re-encode if it actually got smaller.
    if (outBlob.size === 0 || outBlob.size >= file.size * 0.95) return file;

    const ext = outType === "video/mp4" ? "mp4" : "webm";
    const name = file.name.replace(/\.[^.]+$/, "") + "." + ext;
    return new File([outBlob], name, { type: outType });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}