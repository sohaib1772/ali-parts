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
    <div className="min-h-screen bg-background flex flex-col">
      {showHeader && <AppHeader title={title} />}
      <main className={`flex-1 mx-auto w-full max-w-md ${showNav ? "pb-24" : ""}`}>{children}</main>
      {showNav && <BottomNav />}
    </div>
  );
}