import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "سياسة الخصوصية | مكتب علي شوفرليت" },
      { name: "description", content: "سياسة الخصوصية لتطبيق مكتب علي شوفرليت لقطع غيار السيارات في العراق." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main dir="rtl" className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <h1 className="mb-6 text-3xl font-bold">سياسة الخصوصية</h1>
      <p className="mb-4 text-sm text-muted-foreground">آخر تحديث: 9 يوليو 2026</p>

      <section className="space-y-6 leading-8">
        <p>
          نحن في <strong>مكتب علي شوفرليت</strong> نحترم خصوصيتك ونلتزم بحماية بياناتك.
          توضح هذه السياسة نوع المعلومات التي نجمعها وكيفية استخدامها.
        </p>

        <div>
          <h2 className="mb-2 text-xl font-semibold">١. المعلومات التي نجمعها</h2>
          <ul className="list-disc space-y-2 pr-6">
            <li>معلومات الطلب: الاسم، رقم الهاتف، العنوان لأغراض التوصيل.</li>
            <li>موديل سيارتك (اختياري) لعرض القطع المتوافقة.</li>
            <li>بيانات تقنية أساسية لتحسين أداء التطبيق.</li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">٢. كيفية استخدام المعلومات</h2>
          <ul className="list-disc space-y-2 pr-6">
            <li>معالجة الطلبات وتوصيلها.</li>
            <li>التواصل معك بخصوص طلبك عبر الهاتف أو واتساب.</li>
            <li>تحسين تجربتك داخل التطبيق.</li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">٣. مشاركة البيانات</h2>
          <p>لا نبيع أو نشارك بياناتك مع أي جهة خارجية، عدا شركات التوصيل بالحد اللازم لإتمام الطلب.</p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">٤. الأمان</h2>
          <p>نستخدم إجراءات أمنية قياسية لحماية بياناتك من الوصول غير المصرح به.</p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">٥. حقوقك</h2>
          <p>يمكنك طلب حذف بياناتك في أي وقت عبر التواصل معنا.</p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">٦. التواصل</h2>
          <p>لأي استفسار بخصوص الخصوصية، تواصل معنا عبر واتساب من داخل التطبيق.</p>
        </div>
      </section>
    </main>
  );
}