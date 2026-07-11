#!/usr/bin/env node
/**
 * اختبار تنقل تلقائي (Smoke Test)
 * يتحقق من:
 *  1) تحميل الصفحة الرئيسية
 *  2) فتح صفحة السلة /cart دون خطأ React (#185, boundary error)
 *  3) وصول /_authenticated/admin وتحويله إلى /auth عند عدم تسجيل الدخول
 *
 * الاستخدام: node scripts/smoke-nav.mjs [BASE_URL]
 *   BASE_URL افتراضي: http://localhost:8080
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || process.env.SMOKE_BASE_URL || "http://localhost:8080";

const results = [];
let failed = 0;

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  const mark = ok ? "✓" : "✗";
  console.log(`${mark} ${name}${detail ? " — " + detail : ""}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));

  // 1) الصفحة الرئيسية
  try {
    const before = pageErrors.length;
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    record("home loads", pageErrors.length === before, pageErrors.slice(before).join(" | "));
  } catch (e) {
    record("home loads", false, e.message);
  }

  // 2) صفحة السلة — يجب ألا تنهار حتى لو كانت فارغة
  try {
    const before = pageErrors.length;
    await page.goto(BASE + "/cart", { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const bodyText = (await page.textContent("body")) || "";
    const crashed =
      pageErrors.slice(before).some((e) => /Minified React error #185|Maximum update depth/i.test(e)) ||
      /Something went wrong|Application error/i.test(bodyText);
    record(
      "cart route stable",
      !crashed && pageErrors.length === before,
      pageErrors.slice(before).join(" | "),
    );
  } catch (e) {
    record("cart route stable", false, e.message);
  }

  // 3) بوابة الأدمن — يجب أن تحوّل إلى /auth بدون جلسة
  try {
    const before = pageErrors.length;
    await page.goto(BASE + "/admin", { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const url = page.url();
    const redirected = /\/auth(\b|\/|\?)/.test(url);
    record("admin gate redirects to /auth", redirected, `final=${url}`);
    record(
      "admin route no crash",
      pageErrors.length === before,
      pageErrors.slice(before).join(" | "),
    );
  } catch (e) {
    record("admin gate redirects to /auth", false, e.message);
  }

  await browser.close();

  console.log("\n--- Summary ---");
  console.log(`Passed: ${results.length - failed}/${results.length}`);
  if (consoleErrors.length) {
    console.log(`Console errors captured: ${consoleErrors.length}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("smoke-nav crashed:", e);
  process.exit(1);
});