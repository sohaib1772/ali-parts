import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Heart, Package, MessageCircle, User } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { ordersQuery } from "@/lib/queries";
import { isOrderUnseen, useOrderSeenMap } from "@/lib/order-updates";

const items = [
  { to: "/", label: "الرئيسية", icon: Home },
  { to: "/favorites", label: "المفضلة", icon: Heart },
  { to: "/orders", label: "طلباتي", icon: Package },
  { to: "/messages", label: "الرسائل", icon: MessageCircle },
  { to: "/account", label: "الحساب", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { userId } = useAuth();
  const { data: orders = [] } = useQuery(ordersQuery(userId));
  const seen = useOrderSeenMap();
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`nav-orders-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["orders", userId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc]);
  const unseenCount = (orders as any[]).filter((o) =>
    isOrderUnseen(seen, o.id, o.updated_at, o.created_at),
  ).length;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-card/95 backdrop-blur-lg pb-[env(safe-area-inset-bottom)] shadow-luxe">
      <div className="mx-auto max-w-md grid grid-cols-5">
        {items.map((it) => {
          const active = pathname === it.to || (it.to !== "/" && pathname.startsWith(it.to));
          const Icon = it.icon;
          const showBadge = it.to === "/orders" && unseenCount > 0;
          return (
            <Link
              key={it.to}
              to={it.to}
              className="relative flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors"
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gold" />
              )}
              <div className="relative">
                <Icon className={`size-5 transition-colors ${active ? "text-gold" : "text-muted-foreground"}`} strokeWidth={active ? 2.4 : 1.8} />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center shadow">
                    {unseenCount > 9 ? "9+" : unseenCount}
                  </span>
                )}
              </div>
              <span className={active ? "text-navy" : "text-muted-foreground"}>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}