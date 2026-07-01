import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Heart, Package, MessageCircle, User } from "lucide-react";

const items = [
  { to: "/", label: "الرئيسية", icon: Home },
  { to: "/favorites", label: "المفضلة", icon: Heart },
  { to: "/orders", label: "طلباتي", icon: Package },
  { to: "/messages", label: "الرسائل", icon: MessageCircle },
  { to: "/account", label: "الحساب", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-card/95 backdrop-blur-lg pb-[env(safe-area-inset-bottom)] shadow-luxe">
      <div className="mx-auto max-w-md grid grid-cols-5">
        {items.map((it) => {
          const active = pathname === it.to || (it.to !== "/" && pathname.startsWith(it.to));
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className="relative flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors"
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gold" />
              )}
              <Icon className={`size-5 transition-colors ${active ? "text-gold" : "text-muted-foreground"}`} strokeWidth={active ? 2.4 : 1.8} />
              <span className={active ? "text-navy" : "text-muted-foreground"}>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}