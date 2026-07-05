import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, X } from "lucide-react";

type Notif = {
  id: string;
  title: string | null;
  body: string | null;
  type: string | null;
  created_at: string;
};

export function NotificationPopup() {
  const [notif, setNotif] = useState<Notif | null>(null);

  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let currentUid: string | null = null;
    // Track last seen created_at to avoid re-showing after remount
    const LAST_KEY = "notif_popup_last_seen";

    const setup = async (uid: string | null) => {
      if (channel) { supabase.removeChannel(channel); channel = null; }
      currentUid = uid;
      if (!uid) return;
      channel = supabase
        .channel(`notif-popup-${uid}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
          (payload) => {
            const row = payload.new as Notif & { read_at: string | null };
            if (!mounted) return;
            if (row.read_at) return;
            try {
              const last = window.localStorage.getItem(LAST_KEY);
              if (last && last >= row.created_at) return;
              window.localStorage.setItem(LAST_KEY, row.created_at);
            } catch { /* noop */ }
            setNotif({
              id: row.id,
              title: row.title,
              body: row.body,
              type: row.type,
              created_at: row.created_at,
            });
          },
        )
        .subscribe();
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      setup(data.session?.user.id ?? null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user.id ?? null;
      if (uid !== currentUid) setup(uid);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const dismiss = async () => {
    if (!notif) return;
    const id = notif.id;
    setNotif(null);
    try {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
    } catch { /* noop */ }
  };

  if (!notif) return null;

  const isBlock =
    notif.type === "account_status" ||
    (notif.title ?? "").includes("حظر") ||
    (notif.body ?? "").includes("حظر");

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={dismiss}
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm grid place-items-center px-6 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-card rounded-3xl border border-border shadow-2xl p-6 text-center relative animate-in zoom-in-95 duration-200"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="إغلاق"
          className="absolute top-3 end-3 size-8 rounded-full grid place-items-center text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>
        <div
          className={`mx-auto size-14 rounded-full grid place-items-center mb-3 ${
            isBlock ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
          }`}
        >
          <Bell className="size-6" />
        </div>
        {notif.title && (
          <div className="font-extrabold text-lg text-foreground mb-2">{notif.title}</div>
        )}
        {notif.body && (
          <p className="text-sm text-muted-foreground leading-relaxed">{notif.body}</p>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="mt-5 w-full rounded-full bg-primary text-primary-foreground py-2.5 font-bold text-sm"
        >
          تم
        </button>
      </div>
    </div>
  );
}