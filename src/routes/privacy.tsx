import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "سياسة الخصوصية — مكتب علي شوفرليت" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PageShell title="سياسة الخصوصية">
      <div className="px-4 pt-4">
        <div className="bg-card rounded-2xl border border-border p-5 shadow-card space-y-4 text-sm leading-relaxed">
          <p>نحن في Ali Parts نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية.</p>
          <div>
            <div className="font-bold text-gold mb-1">جمع البيانات</div>
            <p>نجمع فقط البيانات اللازمة لإتمام طلبك: الاسم، رقم الهاتف، والعنوان.</p>
          </div>
          <div>
            <div className="font-bold text-gold mb-1">استخدام البيانات</div>
            <p>تُستخدم بياناتك لإتمام الطلب والتواصل بشأنه فقط.</p>
          </div>
          <div>
            <div className="font-bold text-gold mb-1">حماية البيانات</div>
            <p>نستخدم أفضل ممارسات الأمان لحماية بياناتك.</p>
          </div>
        </div>
      </div>
    </PageShell>
  );
}