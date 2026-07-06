import { supabase } from "@/integrations/supabase/client";

/**
 * Upload a file to a Supabase Storage bucket via a signed upload URL,
 * reporting real byte-level progress through onProgress (0..1).
 */
export async function uploadWithProgress(
  bucket: string,
  key: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(key);
  if (error || !data?.signedUrl) {
    throw error ?? new Error("createSignedUploadUrl failed");
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", data.signedUrl);
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded / e.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("network error"));
    xhr.onabort = () => reject(new Error("aborted"));
    xhr.send(file);
  });
}