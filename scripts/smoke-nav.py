#!/usr/bin/env python3
"""اختبار تنقل تلقائي للتحقق من مسار السلة وبوابة الأدمن.

يفحص بعد كل تحديث:
 1) تحميل الصفحة الرئيسية دون أخطاء JS
 2) فتح /cart دون انهيار (React #185 / infinite loop)
 3) /admin يحوّل إلى /auth عند عدم تسجيل الدخول

الاستخدام:
  python3 scripts/smoke-nav.py [BASE_URL]
الافتراضي: http://localhost:8080
"""
import os
import re
import sys
import asyncio
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SMOKE_BASE_URL", "http://localhost:8080")

CRASH_RE = re.compile(r"Minified React error #185|Maximum update depth|Rendered more hooks", re.I)
BODY_ERR_RE = re.compile(r"Something went wrong|Application error", re.I)
# Hydration mismatches are recoverable — React re-renders on the client.
# We only flag fatal errors that break the page.
IGNORE_RE = re.compile(r"Hydration failed|did not match|Text content does not match", re.I)


async def run():
    results = []

    def record(name, ok, detail=""):
        results.append((name, ok, detail))
        print(f"{'✓' if ok else '✗'} {name}" + (f" — {detail}" if detail else ""))

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 390, "height": 800})
        page = await ctx.new_page()

        page_errors = []
        page.on("pageerror", lambda e: page_errors.append(str(getattr(e, "message", e))))

        async def visit(path):
            before = len(page_errors)
            await page.goto(BASE + path, wait_until="domcontentloaded", timeout=25000)
            try:
                await page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass
            new_errs = [e for e in page_errors[before:] if not IGNORE_RE.search(e)]
            return new_errs

        # 1) الرئيسية
        try:
            errs = await visit("/")
            record("home loads", len(errs) == 0, " | ".join(errs))
        except Exception as e:
            record("home loads", False, str(e))

        # 2) السلة
        try:
            errs = await visit("/cart")
            body = (await page.text_content("body")) or ""
            crashed = any(CRASH_RE.search(x) for x in errs) or bool(BODY_ERR_RE.search(body))
            record("cart route stable", not crashed and len(errs) == 0, " | ".join(errs))
        except Exception as e:
            record("cart route stable", False, str(e))

        # 3) بوابة الأدمن
        try:
            errs = await visit("/admin")
            url = page.url
            redirected = bool(re.search(r"/auth(\b|/|\?)", url))
            record("admin gate redirects to /auth", redirected, f"final={url}")
            record("admin route no crash", len(errs) == 0, " | ".join(errs))
        except Exception as e:
            record("admin gate redirects to /auth", False, str(e))

        await browser.close()

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n--- Summary --- {passed}/{len(results)} passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))