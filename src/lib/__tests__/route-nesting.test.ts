import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Regression test for the blank order-detail page (fixed 2026-07-20).
 *
 * TanStack Router's flat file routing treats `orders.$id.tsx` as a CHILD of
 * `orders.tsx`. A child only renders if its parent renders an <Outlet />.
 * `orders.tsx` is the orders *list* page and has no <Outlet />, so
 * /orders/<id> could never render its own component — customers clicking
 * "عرض التفاصيل والتتبع" got a blank page (or the list again).
 *
 * The fix is the trailing-underscore un-nesting convention: `orders_.$id.tsx`,
 * which keeps the URL `/orders/$id` but re-parents the route so it no longer
 * depends on the list page rendering an Outlet.
 *
 * This test fails if anyone adds a nested child route under a parent that
 * doesn't render an <Outlet />.
 */

const ROUTES_DIR = join(process.cwd(), "src", "routes");

function collectRouteFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectRouteFiles(full, acc);
    else if (entry.endsWith(".tsx") && !entry.startsWith("routeTree")) acc.push(full);
  }
  return acc;
}

describe("route nesting", () => {
  const files = collectRouteFiles(ROUTES_DIR);

  it("finds route files", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("every parent of a nested route renders an <Outlet />", () => {
    const violations: string[] = [];

    for (const file of files) {
      const name = file.split(/[\\/]/).pop()!;
      const base = name.replace(/\.tsx$/, "");
      // A flat-routing child looks like "<parent>.<something>" — e.g. orders.$id
      const dot = base.indexOf(".");
      if (dot <= 0) continue;
      const parentBase = base.slice(0, dot);
      // Trailing underscore opts out of nesting: orders_.$id is NOT a child.
      if (parentBase.endsWith("_")) continue;

      const parentFile = file.replace(name, `${parentBase}.tsx`);
      let parentSrc: string;
      try {
        parentSrc = readFileSync(parentFile, "utf8");
      } catch {
        continue; // no parent file -> not a nested route
      }
      // `route.tsx` layout files and any parent that renders an Outlet are fine.
      if (parentSrc.includes("<Outlet")) continue;

      violations.push(
        `${relative(process.cwd(), file)} is nested under ` +
          `${relative(process.cwd(), parentFile)}, which renders no <Outlet /> — ` +
          `it can never render. Rename to "${parentBase}_.${base.slice(dot + 1)}.tsx".`,
      );
    }

    expect(violations).toEqual([]);
  });
});
