import { supabase } from "@/integrations/supabase/client";

/**
 * Upload a file to a Supabase Storage bucket, reporting real byte-level
 * progress through onProgress (0..1).
 *
 * Primary path: request a signed upload URL and PUT the file with XHR so we
 * can observe upload progress. If that path fails (CORS preflight hang, the
 * server never responding, network hiccup, etc.), we fall back to the
 * standard `supabase.storage.upload()` call so the upload still completes —
 * we just lose the fine-grained progress ticks.
 */
export async function uploadWithProgress(
  bucket: string,
  key: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  try {
    await uploadViaSignedUrl(bucket, key, file, onProgress);
    return;
  } catch (err) {
    // Log and fall through to the SDK upload so the user still gets their
    // file saved even when signed-URL PUT misbehaves.
    console.warn("[upload] signed-url PUT failed, falling back to SDK upload", err);
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(key, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
  if (error) throw error;
  onProgress?.(1);
}

function uploadViaSignedUrl(
  bucket: string,
  key: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Non-async executor: the async work runs in an IIFE whose try/catch guarantees the
    // promise ALWAYS settles. Previously the executor was `async`, so a throw from
    // createSignedUploadUrl (or xhr setup) was swallowed and the promise hung forever.
    void (async () => {
      try {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUploadUrl(key);
        if (error || !data?.signedUrl) {
          reject(error ?? new Error("createSignedUploadUrl failed"));
          return;
        }

        const xhr = new XMLHttpRequest();
        // Watchdog: if nothing progresses for 30s, abort so we can fall back.
        let lastTick = Date.now();
        const watchdog = window.setInterval(() => {
          if (Date.now() - lastTick > 30_000) {
            try { xhr.abort(); } catch {}
          }
        }, 5_000);
        const cleanup = () => window.clearInterval(watchdog);

        xhr.open("PUT", data.signedUrl);
        if (file.type) xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (e) => {
          lastTick = Date.now();
          if (e.lengthComputable && onProgress) {
            onProgress(e.loaded / e.total);
          }
        };
        xhr.onload = () => {
          cleanup();
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.(1);
            resolve();
          } else {
            reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`));
          }
        };
        xhr.onerror = () => { cleanup(); reject(new Error("network error")); };
        xhr.onabort = () => { cleanup(); reject(new Error("aborted")); };
        xhr.ontimeout = () => { cleanup(); reject(new Error("timeout")); };
        xhr.send(file);
      } catch (err) {
        reject(err);
      }
    })();
  });
}