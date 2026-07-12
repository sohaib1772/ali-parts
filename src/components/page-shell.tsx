import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { BottomNav } from "./bottom-nav";
import { AppHeader } from "./app-header";

/**
 * Unified app shell used by every user-facing route.
 *
 * - On mobile it fills the whole viewport (edge-to-edge).
 * - On tablet/desktop it renders as a centered phone-like frame so the app
 *   never looks like a narrow web page floating over an empty desktop.
 * - Header sits sticky at the top; BottomNav sits sticky at the bottom of
 *   the frame, so both stay pinned without covering content permanently.
 */
export function PageShell({
  children,
  title,
  showHeader = true,
  showNav = true,
}: {
  children: ReactNode;
  title?: string;
  showHeader?: boolean;
  showNav?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="fixed inset-0 bg-muted/30 flex justify-center overflow-hidden">
      <div
        className="relative w-full max-w-md h-full bg-background flex flex-col md:shadow-2xl md:border-x md:border-border/40"
        style={{ paddingTop: showHeader ? undefined : "env(safe-area-inset-top)" }}
      >
        {showHeader && (
          <div className="shrink-0">
            <AppHeader title={title} />
          </div>
        )}
        <main
          key={pathname}
          className="flex-1 w-full overflow-y-auto overflow-x-hidden overscroll-contain animate-fade-in"
          style={{
            WebkitOverflowScrolling: "touch",
            paddingBottom: showNav ? undefined : "env(safe-area-inset-bottom)",
          } as React.CSSProperties}
        >
          {children}
        </main>
        {showNav && (
          <div className="shrink-0">
            <BottomNav />
          </div>
        )}
      </div>
    </div>
  );
}