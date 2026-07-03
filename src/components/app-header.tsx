import { Link } from "@tanstack/react-router";
import { Bell, Search, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { useSetting } from "@/lib/admin";

export function AppHeader({ title }: { title?: string }) {
  const [count, setCount] = useState(0);
  const [unread, setUnread] = useState(0);
  const storeName = useSetting("store_name", "مكتب علي شوفرليت");
  const storeTagline = useSetting("store_tagline", "قطع أصلية · العراق");
  const storeLogo = useSetting("store_logo", "");
  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let currentUid: string | null = null;

    const refreshCounts = async (uid: string) => {
      const { count } = await supabase
        .from("cart_items")
        .select("*", { count: "exact", head: true })
        .eq("user_id", uid);
      if (mounted) setCount(count ?? 0);
      const { count: nCount } = await (supabase as any)
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", uid)
        .is("read_at", null);
      if (mounted) setUnread(nCount ?? 0);
    };

    const setup = async (uid: string | null) => {
      if (uid === currentUid) {
        if (uid) refreshCounts(uid);
        return;
      }
      currentUid = uid;
      if (channel) { supabase.removeChannel(channel); channel = null; }
      if (!uid) { if (mounted) { setCount(0); setUnread(0); } return; }
      refreshCounts(uid);
      const channelName = `notif-badge-${uid}-${crypto.randomUUID()}`;
      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
          () => refreshCounts(uid),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cart_items", filter: `user_id=eq.${uid}` },
          () => refreshCounts(uid),
        )
        .subscribe();
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      setup(data.session?.user.id ?? null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => setup(session?.user.id ?? null));
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-gradient-navy text-primary-foreground shadow-luxe">
      <div className="mx-auto max-w-md px-4 py-3 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2">
          {storeLogo ? (
            <div className="size-11 rounded-xl overflow-hidden shadow-gold bg-white">
              <img src={storeLogo} alt={storeName} className="size-full object-cover" />
            </div>
          ) : (
            <div className="size-11 rounded-xl bg-gradient-gold flex items-center justify-center font-black text-navy text-xl shadow-gold">
              {storeName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="leading-tight">
            <div className="font-extrabold text-base">{title ?? storeName}</div>
            <div className="text-[10px] text-gold tracking-wide">{storeTagline}</div>
          </div>
        </Link>
        <div className="ms-auto flex items-center gap-1.5">
          <Link to="/search" aria-label="بحث" className="size-10 rounded-full grid place-items-center hover:bg-white/10 transition">
            <Search className="size-5" />
          </Link>
          <Link to="/notifications" aria-label="الإشعارات" className="relative size-10 rounded-full grid place-items-center hover:bg-white/10 transition">
            <Bell className="size-5" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -start-0.5 min-w-5 h-5 px-1 rounded-full bg-gold text-navy text-[10px] font-bold grid place-items-center">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <Link to="/cart" aria-label="السلة" className="relative size-10 rounded-full grid place-items-center hover:bg-white/10 transition">
            <ShoppingCart className="size-5" />
            {count > 0 && (
              <span className="absolute -top-0.5 -start-0.5 min-w-5 h-5 px-1 rounded-full bg-gold text-navy text-[10px] font-bold grid place-items-center">
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}