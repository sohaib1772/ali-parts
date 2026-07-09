import { describe, expect, it } from "vitest";
import {
  formatIraqiWhatsAppNumber,
  whatsappLink,
} from "../format";

describe("formatIraqiWhatsAppNumber", () => {
  it("normalizes +964 format", () => {
    expect(formatIraqiWhatsAppNumber("+964 785 550 0585")).toBe("9647855500585");
    expect(formatIraqiWhatsAppNumber("+9647855500585")).toBe("9647855500585");
  });

  it("normalizes 00964 format", () => {
    expect(formatIraqiWhatsAppNumber("00964 785 550 0585")).toBe("9647855500585");
    expect(formatIraqiWhatsAppNumber("009647855500585")).toBe("9647855500585");
  });

  it("normalizes 07... format", () => {
    expect(formatIraqiWhatsAppNumber("07855500585")).toBe("9647855500585");
    expect(formatIraqiWhatsAppNumber("0 785 550 0585")).toBe("9647855500585");
  });

  it("normalizes 7... format", () => {
    expect(formatIraqiWhatsAppNumber("7855500585")).toBe("9647855500585");
  });

  it("keeps already-normalized 964... format", () => {
    expect(formatIraqiWhatsAppNumber("9647855500585")).toBe("9647855500585");
  });

  it("produces wa.me links without + or 00", () => {
    const link = whatsappLink("test", "009647855500585");
    expect(link).toBe("https://wa.me/9647855500585?text=test");
    expect(link).not.toContain("+");
    expect(link).not.toContain("/00964");
  });
});
