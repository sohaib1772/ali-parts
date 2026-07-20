import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { useSetting } from "@/lib/admin";
import { WHATSAPP_NUMBER, formatIraqiWhatsAppNumber, whatsappLink } from "@/lib/format";
import { MessageCircle, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "سياسة الخصوصية — Ali Parts" },
      { name: "description", content: "سياسة الخصوصية لتطبيق Ali Parts لقطع غيار السيارات في العراق: البيانات التي نجمعها وكيفية استخدامها وحمايتها." },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: "https://maktabali.com/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const storeName = useSetting("store_name", "Ali Parts");
  const ownerName = useSetting("store_owner", "").trim();
  const supportEmail = useSetting("store_email", "").trim();
  const address = useSetting("store_address", "").trim();
  const rawWa = useSetting("whatsapp_number", "").trim();
  const waNumber = rawWa ? formatIraqiWhatsAppNumber(rawWa) : formatIraqiWhatsAppNumber(WHATSAPP_NUMBER);
  const hasWa = Boolean(rawWa);
  const missing = !ownerName || !address || !supportEmail || !hasWa;
  const today = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });

  return (
    <PageShell wide title="سياسة الخصوصية">
      <div className="px-4 pt-4 pb-8 md:max-w-2xl md:mx-auto">
        <div className="bg-card rounded-2xl border border-border p-5 shadow-card space-y-5 text-sm leading-relaxed">
          <p className="text-xs text-muted-foreground">آخر تحديث: {today}</p>
          <p>
            نحن في <strong>{storeName}</strong> نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية وفقاً للقوانين المعمول بها
            وسياسات متاجر التطبيقات (Apple App Store و Google Play). توضح هذه السياسة أنواع البيانات التي نجمعها،
            وكيف نستخدمها ونحميها، وحقوقك عليها.
          </p>

          <Section title="١. البيانات التي نجمعها">
            <ul className="list-disc ps-6 space-y-1">
              <li>بيانات الحساب: الاسم الكامل، البريد الإلكتروني، رقم الهاتف، الصورة الشخصية (اختيارية).</li>
              <li>بيانات الطلب والتوصيل: العنوان، المحافظة، ملاحظات التوصيل، تاريخ الطلبات.</li>
              <li>بيانات السيارة (اختيارية): الشركة المصنّعة، الموديل، وسنة الصنع لعرض القطع المتوافقة.</li>
              <li>بيانات تقنية: نوع الجهاز، نظام التشغيل، معرّف الجلسة، سجلات الأخطاء لتحسين الأداء.</li>
              <li>الإشعارات (اختيارية): توكن الإشعارات فقط عند موافقتك على تفعيلها.</li>
            </ul>
            <p className="mt-2 text-muted-foreground">لا نجمع بيانات مالية؛ الدفع يتم عند الاستلام فقط.</p>
          </Section>

          <Section title="٢. كيفية استخدام البيانات">
            <ul className="list-disc ps-6 space-y-1">
              <li>معالجة الطلبات، تجهيزها، وتوصيلها.</li>
              <li>التواصل معك بخصوص الطلب عبر الهاتف أو واتساب.</li>
              <li>عرض تاريخ طلباتك ومنتجاتك المفضلة داخل حسابك.</li>
              <li>إرسال إشعارات الطلب والعروض (بعد موافقتك).</li>
              <li>تحسين أداء التطبيق ورصد الأخطاء.</li>
              <li>الامتثال للالتزامات القانونية.</li>
            </ul>
          </Section>

          <Section title="٣. مشاركة البيانات">
            <p>لا نبيع بياناتك ولا نؤجّرها لأي طرف. نشاركها فقط في الحدود اللازمة مع:</p>
            <ul className="list-disc ps-6 space-y-1 mt-2">
              <li>مندوبي التوصيل داخل العراق لإتمام إيصال الطلب.</li>
              <li>مزودي البنية التحتية السحابية (استضافة قاعدة البيانات والإشعارات) الملتزمين بمعايير حماية بيانات دولية.</li>
              <li>الجهات الحكومية أو القضائية عند وجود طلب قانوني رسمي.</li>
            </ul>
          </Section>

          <Section title="٤. حماية البيانات">
            <p>
              نستخدم اتصالات مشفرة (HTTPS)، وسياسات صلاحيات صارمة على قاعدة البيانات (Row Level Security)،
              ومصادقة آمنة لكل حساب. رغم كل الاحتياطات، لا يمكن ضمان أمان مطلق لأي نظام إلكتروني،
              ونلتزم بإبلاغك عند أي خرق يؤثر على بياناتك.
            </p>
          </Section>

          <Section title="٥. مدة الاحتفاظ بالبيانات">
            <p>
              نحتفظ ببيانات حسابك وطلباتك طالما حسابك نشط ولحد أقصى (5) سنوات من آخر نشاط لأغراض المحاسبة والدعم،
              ثم تُحذف أو تُجهَّل. يمكنك طلب الحذف الفوري في أي وقت.
            </p>
          </Section>

          <Section title="٦. حقوقك">
            <ul className="list-disc ps-6 space-y-1">
              <li>الوصول إلى بياناتك وتعديلها من صفحة الحساب.</li>
              <li>طلب حذف حسابك وكامل بياناتك.</li>
              <li>سحب موافقتك على الإشعارات في أي وقت.</li>
              <li>تقديم شكوى إذا رأيت أن حقوقك قد انتُهكت.</li>
            </ul>
          </Section>

          <Section title="٧. خصوصية الأطفال">
            <p>
              التطبيق غير موجّه لمن هم دون سن (13) عاماً. لا نجمع بيانات عن الأطفال عن قصد،
              وسنحذف أي بيانات نكتشف أنها تعود لطفل فور علمنا بها.
            </p>
          </Section>

          <Section title="٨. الأذونات على الجهاز">
            <ul className="list-disc ps-6 space-y-1">
              <li>الكاميرا والصور: لرفع صورة شخصية أو صور طلبات الاستبدال (اختياري).</li>
              <li>الإشعارات: لإعلامك بحالة الطلب والعروض (اختياري).</li>
              <li>الإنترنت: مطلوب لعمل التطبيق.</li>
            </ul>
            <p className="mt-2 text-muted-foreground">لا نصل لأي إذن دون طلبه صراحة منك، ويمكنك إلغاء أي إذن من إعدادات جهازك.</p>
          </Section>

          <Section title="٩. الامتثال لمتاجر التطبيقات">
            <p>
              يلتزم التطبيق بسياسات Apple App Store وGoogle Play بشأن جمع البيانات وشفافيتها،
              وبقوانين حماية المستهلك في جمهورية العراق.
            </p>
          </Section>

          <Section title="١٠. تعديلات على السياسة">
            <p>
              قد نقوم بتحديث هذه السياسة من وقت لآخر. سيتم نشر التعديلات هنا مع تحديث تاريخ "آخر تحديث"،
              واستمرارك في استخدام التطبيق بعد التعديل يُعدّ موافقة على النسخة الجديدة.
            </p>
          </Section>

          <Section title="١١. التواصل معنا">
            <p>لأي استفسار حول الخصوصية أو لطلب حذف بياناتك:</p>
            {missing && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 p-3 text-xs">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>لم يتم تعبئة كامل بيانات المالك بعد. يرجى تحديث المعلومات من لوحة الإدارة (الإعدادات: اسم الجهة، العنوان، البريد الإلكتروني، رقم واتساب).</span>
              </div>
            )}
            <ul className="list-disc ps-6 space-y-1 mt-2">
              <li>الجهة المسؤولة: {ownerName || <span className="text-muted-foreground">— لم يتم تحديدها بعد —</span>}</li>
              <li>العنوان: {address || <span className="text-muted-foreground">— لم يتم تحديده بعد —</span>}</li>
              <li>
                البريد الإلكتروني:{" "}
                {supportEmail ? (
                  <a className="text-gold underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>
                ) : (
                  <span className="text-muted-foreground">— لم يتم تحديده بعد —</span>
                )}
              </li>
              <li>
                واتساب:{" "}
                {hasWa ? (
                  <span dir="ltr">+{waNumber}</span>
                ) : (
                  <span className="text-muted-foreground">— لم يتم تحديده بعد —</span>
                )}
              </li>
            </ul>
            {hasWa && (
              <a
              href={whatsappLink("لدي استفسار بخصوص الخصوصية", waNumber)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 bg-navy text-primary-foreground text-xs font-bold px-4 py-2 rounded-xl"
              >
                <MessageCircle className="size-3.5" /> تواصل عبر واتساب
              </a>
            )}
          </Section>
        </div>
      </div>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-bold text-gold mb-2">{title}</h2>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}