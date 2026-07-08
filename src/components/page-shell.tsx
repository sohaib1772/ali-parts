import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";
import { AppHeader } from "./app-header";

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
    <div className="min-h-[100dvh] bg-background flex flex-col" style={{ paddingTop: showHeader ? undefined : "env(safe-area-inset-top)" }}>
      {showHeader && <AppHeader title={title} />}
      <main
        className={`flex-1 mx-auto w-full max-w-md ${showNav ? "pb-[calc(6rem+env(safe-area-inset-bottom))]" : "pb-[env(safe-area-inset-bottom)]"}`}
      >
        {children}
      </main>
      {showNav && <BottomNav />}
    </div>
  );
}