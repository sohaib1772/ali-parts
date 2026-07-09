import { describe, expect, it } from "vitest";
import {
  buildOrderWhatsAppMessage,
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

describe("buildOrderWhatsAppMessage", () => {
  const order = {
    id: "ord-123",
    order_number: "ORD-9876",
    total_iqd: 125000,
    payment_method: "cod",
    address: {
      full_name: "علي حسين",
      phone: "07855500585",
      city: "بغداد",
      area: "المنصور",
      street: "شارع 14 رمضان",
      notes: "بجانب المسجد",
    },
  };
  const items = [
    { name_ar: "فرامل أمامي", side: "LH", quantity: 2, unit_price_iqd: 25000, oem_number: "OEM-111" },
    { name_ar: " disc خلفي", side: "RH", quantity: 1, unit_price_iqd: 75000, oem_number: "" },
  ];
  const customer = { full_name: "علي", phone: "07800000000" };

  it("includes order number, name, phone, address, items, and total in Arabic", () => {
    const message = buildOrderWhatsAppMessage(order, items, customer);
    expect(message).toContain("رقم الطلب: #ORD-9876");
    expect(message).toContain("الاسم: علي حسين");
    expect(message).toContain("الهاتف: 07855500585");
    expect(message).toContain("العنوان: بغداد · المنصور · شارع 14 رمضان");
    expect(message).toContain("القطع (2)");
    expect(message).toContain("1. فرامل أمامي · يسار ×2");
    expect(message).toContain("2.  disc خلفي · يمين ×1");
    expect(message).toContain("الإجمالي: 125,000 د.ع");
    expect(message).toContain("الدفع: عند الاستلام");
    expect(message).toContain("ملاحظات العنوان: بجانب المسجد");
  });

  it("encodes correctly into a wa.me link with Arabic text preserved", () => {
    const message = buildOrderWhatsAppMessage(order, items, customer);
    const link = whatsappLink(message, "009647855500585");
    const url = new URL(link);
    expect(url.pathname).toBe("/9647855500585");
    const decoded = decodeURIComponent(url.searchParams.get("text")!);
    expect(decoded).toBe(message);
    expect(decoded).toContain("طلب جديد");
    expect(decoded).toContain("رقم الطلب");
    expect(decoded).toContain("الإجمالي");
    expect(link).not.toContain("+");
    expect(link).not.toContain("/00964");
  });

  it("falls back to customer name/phone when address fields are missing", () => {
    const minimalOrder = { id: "ord-456", order_number: "ORD-1111", total_iqd: 50000, payment_method: "bank", address: {} };
    const message = buildOrderWhatsAppMessage(minimalOrder, [], customer);
    expect(message).toContain("الاسم: علي");
    expect(message).toContain("الهاتف: 07800000000");
    expect(message).toContain("الإجمالي: 50,000 د.ع");
    expect(message).toContain("الدفع: حوالة");
  });
});
