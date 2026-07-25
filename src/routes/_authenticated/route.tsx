import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { sessionRestorePromise } from "@/lib/session-bootstrap";
import { ProfilePhonePrompt } from "@/components/profile-completion";
import { registerNativePush } from "@/lib/native-push";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // On native, wait for the secure-store session restore to complete so
    // a valid refresh token isn't missed on cold launch.
    await sessionRestorePromise;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();

  // FCM registration for the native shell. This layout only renders once
  // beforeLoad has confirmed a signed-in user, so mounting here guarantees a
  // session regardless of HOW the user arrived (Custom Tab OAuth, restored
  // session, cold launch). registerNativePush is a no-op on web and guards
  // itself so it runs once per session, not on every authenticated navigation.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !user?.id) return;
    const navigate = (path: string) => {
      void router.navigate({ to: path });
    };
    void registerNativePush(user.id, navigate);
  }, [user?.id, router]);

  return (
    <>
      <Outlet />
      <ProfilePhonePrompt />
    </>
  );
}
