import type { ReactNode } from "react";
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
  return (
    <div className="min-h-[100dvh] bg-muted/30 flex justify-center overflow-x-hidden">
      <div
        className="relative w-full max-w-md min-h-[100dvh] bg-background flex flex-col md:shadow-2xl md:border-x md:border-border/40"
        style={{ paddingTop: showHeader ? undefined : "env(safe-area-inset-top)" }}
      >
        {showHeader && <AppHeader title={title} />}
        <main
          className={`flex-1 w-full ${showNav ? "pb-[calc(6rem+env(safe-area-inset-bottom))]" : "pb-[env(safe-area-inset-bottom)]"}`}
        >
          {children}
        </main>
        {showNav && <BottomNav />}
      </div>
    </div>
  );
}