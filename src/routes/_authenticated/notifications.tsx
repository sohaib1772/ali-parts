import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <PageShell title="الإشعارات">
      <div className="px-4 pt-4 py-20 text-center">
        <div className="size-20 rounded-full bg-muted grid place-items-center mx-auto mb-4">
          <Bell className="size-10 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-bold mb-2">لا توجد إشعارات جديدة</h2>
        <p className="text-sm text-muted-foreground">ستصلك إشعارات عند تحديث حالة طلباتك</p>
      </div>
    </PageShell>
  );
}