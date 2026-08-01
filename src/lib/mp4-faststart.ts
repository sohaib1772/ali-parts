/**
 * Detect whether an MP4 is "faststart" — its `moov` atom (the index) sits before
 * the `mdat` atom (the media data). Faststart lets the browser begin playback
 * while the file is still downloading (progressive streaming). If `moov` is at
 * the END (the default for many editors/phone exports), the browser must
 * download the WHOLE file before it can play — no streaming, no seeking until
 * fully loaded.
 *
 * Reads only box HEADERS via File.slice (8–16 bytes each) and returns as soon as
 * it sees `moov` or `mdat`, so it is effectively O(1) in file size — a 50MB file
 * costs a couple of tiny reads.
 *
 * WebM has no `moov`/faststart concept (it is inherently streamable), so callers
 * should only run this for MP4 and allow WebM through.
 */
export async function isFaststartMp4(file: Blob): Promise<boolean> {
  const fileSize = file.size;
  let offset = 0;

  for (let guard = 0; guard < 64 && offset + 8 <= fileSize; guard++) {
    const head = await file.slice(offset, offset + 16).arrayBuffer();
    const dv = new DataView(head);
    if (dv.byteLength < 8) break;

    let size = dv.getUint32(0);
    const type = String.fromCharCode(dv.getUint8(4), dv.getUint8(5), dv.getUint8(6), dv.getUint8(7));
    let headerSize = 8;

    if (size === 1) {
      // 64-bit "largesize" in the next 8 bytes.
      if (dv.byteLength < 16) break;
      const hi = dv.getUint32(8);
      const lo = dv.getUint32(12);
      size = hi * 2 ** 32 + lo;
      headerSize = 16;
    } else if (size === 0) {
      // Extends to end of file.
      size = fileSize - offset;
    }

    // Not a sane 4-char ASCII box type → give up parsing.
    if (!/^[\x20-\x7e]{4}$/.test(type)) break;

    if (type === "moov") return true; // moov reached before any mdat → faststart
    if (type === "mdat") return false; // media data first → moov is later → NOT faststart

    if (size < headerSize) break;
    offset += size;
  }

  // Couldn't locate moov/mdat at the top level (unusual container). Be permissive
  // — page load is already protected by preload="none"; the only cost of a rare
  // false-allow is that a user who taps waits a bit longer. The common offender
  // (moov-at-end) is caught decisively above.
  return true;
}
