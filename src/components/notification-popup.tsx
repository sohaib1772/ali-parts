import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, X, ShieldAlert } from "lucide-react";

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
          className={`relative mx-auto mb-4 size-20 rounded-full grid place-items-center ${
            isBlock
              ? "bg-gradient-to-br from-red-500 via-rose-600 to-red-700 shadow-[0_10px_30px_-8px_rgba(239,68,68,0.6)]"
              : "bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 shadow-[0_10px_30px_-8px_rgba(245,158,11,0.6)]"
          }`}
        >
          <div
            className={`absolute -inset-2 rounded-full blur-xl opacity-60 ${
              isBlock ? "bg-red-500/50" : "bg-amber-400/50"
            }`}
          />
          <div className="relative size-16 rounded-full bg-white/10 backdrop-blur-sm grid place-items-center border border-white/30 ring-4 ring-white/20">
            {isBlock ? (
              <ShieldAlert className="size-9 text-white drop-shadow-lg" strokeWidth={2.5} />
            ) : (
              <Bell className="size-9 text-white drop-shadow-lg" strokeWidth={2.5} />
            )}
          </div>
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