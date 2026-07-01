import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, LogOut, MapPin, Heart, Package, Bell, Info, Shield, MessageCircle, ShieldCheck } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { profileQuery } from "@/lib/queries";
import { useIsAdmin } from "@/lib/admin";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/account")({
  component: AccountPage,
});

function AccountPage() {
  const { user, userId } = useAuth();
  const { data: profile } = useQuery(profileQuery(userId));
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("تم تسجيل الخروج");
    navigate({ to: "/auth", replace: true });
  };

  const links = [
    ...(isAdmin ? [{ to: "/admin" as const, label: "لوحة الإدارة", icon: ShieldCheck }] : []),
    { to: "/orders", label: "طلباتي السابقة", icon: Package },
    { to: "/favorites", label: "المفضلة", icon: Heart },
    { to: "/addresses", label: "العناوين", icon: MapPin },
    { to: "/notifications", label: "الإشعارات", icon: Bell },
    { to: "/contact", label: "اتصل بنا", icon: MessageCircle },
    { to: "/about", label: "من نحن", icon: Info },
    { to: "/privacy", label: "سياسة الخصوصية", icon: Shield },
  ] as const;

  return (
    <PageShell title="حسابي">
      <div className="px-4 pt-4">
        <div className="bg-gradient-navy text-primary-foreground rounded-3xl p-5 shadow-luxe">
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-full bg-gradient-gold text-navy font-black text-2xl grid place-items-center shadow-gold">
              {(profile?.full_name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-lg truncate">{profile?.full_name ?? "عميل Ali Parts"}</div>
              <div className="text-xs text-gold truncate">{user?.email}</div>
              {profile?.phone && <div className="text-xs text-primary-foreground/70">{profile.phone}</div>}
            </div>
          </div>
        </div>

        <div className="mt-4 bg-card rounded-2xl border border-border shadow-card overflow-hidden">
          {links.map((l, i) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`flex items-center gap-3 px-4 py-3.5 hover:bg-muted transition ${i < links.length - 1 ? "border-b border-border" : ""}`}
              >
                <div className="size-9 rounded-xl bg-gold/10 text-gold grid place-items-center">
                  <Icon className="size-4" />
                </div>
                <span className="text-sm font-semibold flex-1">{l.label}</span>
                <ChevronLeft className="size-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>

        <button
          onClick={signOut}
          className="w-full mt-4 h-12 rounded-2xl border border-destructive/40 text-destructive font-bold flex items-center justify-center gap-2 hover:bg-destructive/5 transition"
        >
          <LogOut className="size-4" /> تسجيل الخروج
        </button>
      </div>
    </PageShell>
  );
}