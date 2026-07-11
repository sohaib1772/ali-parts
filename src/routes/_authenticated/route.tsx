import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogIn, Package } from "lucide-react";
import { readGuestOrders } from "@/lib/guest-cart";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedGate,
});

function AuthedGate() {
  const [state, setState] = useState<"loading" | "in" | "out">("loading");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isOrders = pathname.startsWith("/orders");
  const guestOrdersCount = isOrders && state === "out" ? readGuestOrders().length : 0;
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!alive) return;
      setState(error || !data.user ? "out" : "in");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!alive) return;
      setState(session?.user ? "in" : "out");
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="size-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
      </div>
    );
  }
  if (state === "out") {
    return (
      <div className="min-h-screen grid place-items-center px-6 bg-gradient-to-b from-[#0f172a] to-[#1e293b] text-white">
        <div className="max-w-sm w-full text-center space-y-5 rounded-3xl border border-white/10 bg-white/5 backdrop-blur p-8 shadow-2xl">
          <div className="mx-auto size-14 rounded-2xl bg-gold/15 grid place-items-center text-gold">
            <LogIn className="size-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold">هذه الصفحة تتطلب تسجيل الدخول</h2>
            <p className="text-sm text-white/60">سجّل الدخول للوصول إلى طلباتك ومفضلتك وحسابك.</p>
          </div>
          <Link
            to="/auth"
            className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-gold text-navy font-bold hover:brightness-110 transition"
          >
            تسجيل الدخول
          </Link>
          {isOrders && (
            <Link
              to="/track"
              className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-xl border border-gold/40 text-gold font-bold hover:bg-gold/10 transition"
            >
              <Package className="size-4" />
              {guestOrdersCount > 0
                ? `تتبّع طلباتك كضيف (${guestOrdersCount})`
                : "تتبّع طلبك برقم الطلب"}
            </Link>
          )}
          <Link to="/" className="block text-xs text-white/50 hover:text-gold transition">
            العودة للرئيسية
          </Link>
        </div>
      </div>
    );
  }
  return <Outlet />;
}