import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { useSetting } from "@/lib/admin";
import { WHATSAPP_NUMBER, formatIraqiWhatsAppNumber, whatsappLink } from "@/lib/format";
import { MessageCircle, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "الشروط والأحكام — Ali Parts" },
      { name: "description", content: "الشروط والأحكام لاستخدام تطبيق Ali Parts لبيع قطع غيار السيارات في العراق." },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: "https://ali-parts-pro.lovable.app/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  const storeName = useSetting("store_name", "Ali Parts");
  const ownerName = useSetting("store_owner", "").trim();
  const address = useSetting("store_address", "").trim();
  const supportEmail = useSetting("store_email", "").trim();
  const rawWa = useSetting("whatsapp_number", "").trim();
  const waNumber = rawWa ? formatIraqiWhatsAppNumber(rawWa) : formatIraqiWhatsAppNumber(WHATSAPP_NUMBER);
  const hasWa = Boolean(rawWa);
  const missing = !ownerName || !address || !supportEmail || !hasWa;
  const today = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });

  return (
    <PageShell title="الشروط والأحكام">
      <div className="px-4 pt-4 pb-8">
        <div className="bg-card rounded-2xl border border-border p-5 shadow-card space-y-5 text-sm leading-relaxed">
          <p className="text-xs text-muted-foreground">آخر تحديث: {today}</p>
          <p>
            مرحباً بك في تطبيق <strong>{storeName}</strong>. باستخدامك للتطبيق فإنك توافق على الشروط والأحكام التالية.
            نرجو قراءتها بعناية؛ إذا كنت لا توافق على أي بند منها، يرجى عدم استخدام التطبيق.
          </p>

          <Section title="١. تعريفات">
            <ul className="list-disc pr-6 space-y-1">
              <li>"التطبيق": تطبيق {storeName} على الجوال والويب.</li>
              <li>"المستخدم": أي شخص ينشئ حساباً أو يستخدم التطبيق.</li>
              <li>"الطلب": أي عملية شراء يتم تقديمها عبر التطبيق.</li>
              <li>
                "المشغّل":{" "}
                {ownerName ? (
                  <>{ownerName}، المالك القانوني والمشغّل للتطبيق.</>
                ) : (
                  <span className="text-muted-foreground">— لم يتم تحديد الجهة المسؤولة بعد —</span>
                )}
              </li>
            </ul>
          </Section>

          <Section title="٢. استخدام التطبيق">
            <ul className="list-disc pr-6 space-y-1">
              <li>يجب أن تكون بعمر (18) عاماً أو أكثر لإنشاء حساب.</li>
              <li>تلتزم بتقديم بيانات صحيحة ودقيقة عن هويتك وعنوانك.</li>
              <li>يُمنع استخدام التطبيق لأي غرض غير قانوني أو مخالف لسياسات Apple App Store أو Google Play.</li>
              <li>يُمنع محاولة اختراق التطبيق، أو إساءة استخدام الخدمة، أو نشر محتوى مسيء.</li>
              <li>يحق للمشغّل تعليق أو حذف أي حساب يخالف هذه الشروط دون إشعار مسبق.</li>
            </ul>
          </Section>

          <Section title="٣. الطلبات والأسعار">
            <ul className="list-disc pr-6 space-y-1">
              <li>جميع الأسعار بالدينار العراقي وتشمل ما هو مذكور في صفحة المنتج.</li>
              <li>الأسعار قابلة للتغيير في أي وقت دون إشعار مسبق، ويُعتمد السعر المعروض وقت تأكيد الطلب.</li>
              <li>توفر المنتجات مرتبط بالمخزون؛ نحتفظ بحق إلغاء الطلب أو تعديله عند نفاد المنتج.</li>
              <li>يعتبر الطلب مؤكداً بعد استلام رسالة تأكيد من المشغّل عبر واتساب أو الاتصال.</li>
            </ul>
          </Section>

          <Section title="٤. الدفع والتوصيل">
            <ul className="list-disc pr-6 space-y-1">
              <li>الدفع يتم عند الاستلام نقداً بالدينار العراقي.</li>
              <li>مدة التوصيل وقيمته تختلف حسب المحافظة كما هو موضّح في صفحة الشحن.</li>
              <li>على المستخدم التأكد من صحة العنوان ورقم الهاتف؛ لا يتحمل المشغّل ثمن التوصيل عن طلب فاشل بسبب بيانات خاطئة.</li>
              <li>يحق للمستخدم فحص القطعة أمام مندوب التوصيل قبل الدفع.</li>
            </ul>
          </Section>

          <Section title="٥. الاستبدال والإرجاع">
            <ul className="list-disc pr-6 space-y-1">
              <li>يمكن استبدال أو إرجاع القطعة خلال (3) أيام من تاريخ الاستلام بشرط أن تكون في حالتها الأصلية، غير مركّبة وغير مستخدمة، وبكامل تغليفها.</li>
              <li>لا يشمل الاستبدال القطع الكهربائية بعد فك التغليف، أو القطع المطلوبة خصيصاً حسب طلب المستخدم.</li>
              <li>القطعة المعيبة من المصنع تُستبدل مجاناً بعد الفحص.</li>
              <li>لطلب الاستبدال استخدم قسم "طلبات الاستبدال" داخل التطبيق أو تواصل عبر واتساب.</li>
            </ul>
          </Section>

          <Section title="٦. الضمان">
            <p>
              يقتصر الضمان على ما هو مذكور صراحة في صفحة المنتج أو في فاتورة الشراء.
              لا يشمل الضمان الأضرار الناتجة عن التركيب الخاطئ، أو الاستخدام غير الصحيح، أو التعديل، أو الحوادث.
            </p>
          </Section>

          <Section title="٧. الملكية الفكرية">
            <ul className="list-disc pr-6 space-y-1">
              <li>جميع محتويات التطبيق (الشعار، النصوص، الصور، التصميم، الكود) ملك للمشغّل ومحمية بموجب قوانين حقوق النشر.</li>
              <li>يُمنع نسخ أو إعادة استخدام أي محتوى من التطبيق دون إذن كتابي مسبق.</li>
              <li>أسماء العلامات التجارية (Chevrolet, GMC, Cadillac وغيرها) هي علامات مسجلة لأصحابها، ونستخدمها لأغراض وصف توافق القطع فقط، دون أي ادعاء بالانتماء أو الرعاية الرسمية من قِبل هذه الشركات.</li>
              <li>لسنا وكيلاً رسمياً معتمداً لأي من هذه الشركات ما لم يُذكر ذلك صراحة.</li>
            </ul>
          </Section>

          <Section title="٨. المحتوى المُقدَّم من المستخدم">
            <p>
              أي تعليق أو صورة أو مراجعة تنشرها داخل التطبيق تمنح المشغّل ترخيصاً غير حصري لعرضها داخل التطبيق.
              أنت مسؤول عن قانونية ما تنشره، ولا يجوز نشر محتوى مسيء أو ينتهك حقوق الآخرين.
            </p>
          </Section>

          <Section title="٩. حدود المسؤولية">
            <ul className="list-disc pr-6 space-y-1">
              <li>يُقدَّم التطبيق "كما هو" دون أي ضمانات ضمنية بخصوص استمرارية الخدمة أو خلوّها من الأخطاء.</li>
              <li>لا يتحمل المشغّل أي مسؤولية عن الأضرار غير المباشرة أو التبعية الناجمة عن استخدام التطبيق.</li>
              <li>الحد الأقصى لمسؤولية المشغّل تجاه أي طلب هو قيمة الطلب المدفوعة.</li>
            </ul>
          </Section>

          <Section title="١٠. الامتثال لسياسات المتاجر">
            <p>
              يلتزم التطبيق بسياسات Apple App Store وGoogle Play، بما في ذلك متطلبات الشفافية،
              وحماية البيانات، وحقوق المستخدم. أي بند في هذه الشروط يتعارض مع سياسات المتاجر يُعدَّل تلقائياً ليتوافق معها.
            </p>
          </Section>

          <Section title="١١. القانون المعمول به وحل النزاعات">
            <p>
              تخضع هذه الشروط لقوانين جمهورية العراق. أي نزاع ينشأ عن استخدام التطبيق تُبذل جهود لحلّه ودياً أولاً،
              وفي حال تعذّر ذلك يُحال إلى المحاكم العراقية المختصة.
            </p>
          </Section>

          <Section title="١٢. تعديل الشروط">
            <p>
              يحق للمشغّل تعديل هذه الشروط في أي وقت. سيُنشر التعديل داخل التطبيق مع تحديث تاريخ "آخر تحديث"،
              واستمرار استخدامك للتطبيق يُعدّ موافقة على النسخة المعدَّلة.
            </p>
          </Section>

          <Section title="١٣. التواصل">
            <p>لأي استفسار أو شكوى قانونية:</p>
            {missing && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 p-3 text-xs">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>لم يتم تعبئة كامل بيانات المالك بعد. يرجى تحديث المعلومات من لوحة الإدارة (الإعدادات: اسم الجهة، العنوان، البريد الإلكتروني، رقم واتساب).</span>
              </div>
            )}
            <ul className="list-disc pr-6 space-y-1 mt-2">
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
                href={whatsappLink("لدي استفسار قانوني", waNumber)}
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