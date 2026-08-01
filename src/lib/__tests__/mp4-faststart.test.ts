import { describe, it, expect } from "vitest";
import { isFaststartMp4 } from "@/lib/mp4-faststart";

// Build a minimal MP4-ish blob from a list of [type, contentBytes] boxes.
function box(type: string, contentLen: number): Uint8Array {
  const size = 8 + contentLen;
  const b = new Uint8Array(size);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, size);
  for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
  return b;
}
function mp4(...boxes: Uint8Array[]): Blob {
  return new Blob(boxes as BlobPart[], { type: "video/mp4" });
}

describe("isFaststartMp4", () => {
  it("true when moov is before mdat (faststart)", async () => {
    const file = mp4(box("ftyp", 16), box("moov", 200), box("mdat", 5000));
    expect(await isFaststartMp4(file)).toBe(true);
  });

  it("false when mdat is before moov (moov at end — not faststart)", async () => {
    const file = mp4(box("ftyp", 16), box("mdat", 5000), box("moov", 200));
    expect(await isFaststartMp4(file)).toBe(false);
  });

  it("handles a leading custom atom before moov", async () => {
    const file = mp4(box("ftyp", 16), box("beam", 24), box("moov", 100), box("mdat", 4000));
    expect(await isFaststartMp4(file)).toBe(true);
  });

  it("only reads box headers — huge mdat before moov is still detected fast", async () => {
    // 20MB mdat placed first; parser must return false without reading it all.
    const file = mp4(box("ftyp", 16), box("mdat", 20 * 1024 * 1024), box("moov", 100));
    expect(await isFaststartMp4(file)).toBe(false);
  });

  it("permissive fallback when neither atom is found", async () => {
    const file = mp4(box("ftyp", 16), box("free", 32));
    expect(await isFaststartMp4(file)).toBe(true);
  });
});
