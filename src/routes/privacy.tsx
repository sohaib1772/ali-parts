import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { whatsappLink } from "@/lib/format";
import { ContactList, MissingSettingsNotice, useLegalContact } from "@/components/legal-contact";
import { MessageCircle } from "lucide-react";

const LAST_UPDATED = "20 July 2026";

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
  const { ownerName, address, supportEmail, waNumber, missing } = useLegalContact();

  return (
    <PageShell wide title="سياسة الخصوصية">
      <div className="px-4 pt-4 pb-8 md:max-w-2xl md:mx-auto">
        {/* The policy body is English, so it is explicitly LTR/left-aligned.
            The page chrome (header + bottom nav) stays RTL. */}
        <div
          dir="ltr"
          className="bg-card rounded-2xl border border-border p-5 shadow-card space-y-5 text-sm leading-relaxed text-left"
        >
          <div>
            <h1 className="text-lg font-black text-navy mb-1">Privacy Policy</h1>
            <p className="text-xs text-muted-foreground">
              <strong>Last updated:</strong> {LAST_UPDATED}
            </p>
          </div>

          <p>
            {ownerName} (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the online store at maktabali.com
            and its mobile applications (the &quot;Service&quot;). This policy explains what personal information we
            collect, why we collect it, and what we do with it.
          </p>

          <p>
            <strong>Data controller:</strong> {ownerName}, {address}.
          </p>

          <Section title="1. Information We Collect">
            <p>
              <strong>Account information.</strong> When you create an account you sign in using Google or Apple.
              From them we receive your email address, your name, and your profile picture if you have one. We never
              receive or store your Google or Apple password.
            </p>
            <p className="mt-2">
              <strong>Contact and delivery information.</strong> After signing in we ask for a phone number so we can
              contact you about your order. When you place an order you provide a delivery address. Please note we do
              not verify phone numbers.
            </p>
            <p className="mt-2">
              <strong>Order information.</strong> The products you order, quantities, prices, order status, delivery
              method, and your order history. Because we sell on a cash-on-delivery basis, we do not collect or store
              bank card or payment card details of any kind.
            </p>
            <p className="mt-2">
              <strong>Shopping activity.</strong> Items in your cart, products you save to favourites, and loyalty
              points earned on orders.
            </p>
            <p className="mt-2">
              <strong>Vehicle information.</strong> The vehicle make, model, year and engine size you select, so we can
              show you parts compatible with your car.
            </p>
            <p className="mt-2">
              <strong>Replacement requests.</strong> If you request a replacement for a part, any photographs and
              description you submit with that request.
            </p>
            <p className="mt-2">
              <strong>Technical information.</strong> Your device sends standard technical data such as IP address and
              browser type when you use the Service. If you enable notifications, we store a device notification token
              so we can send you updates about your orders.
            </p>
          </Section>

          <Section title="2. How We Use Your Information">
            <p>We use your information to:</p>
            <ul className="list-disc ps-6 space-y-1 mt-2">
              <li>Create and maintain your account</li>
              <li>Process, prepare and deliver your orders</li>
              <li>Contact you about an order, by phone or WhatsApp</li>
              <li>Show you parts compatible with your vehicle</li>
              <li>Handle replacement requests</li>
              <li>Send you order notifications, if you have enabled them</li>
              <li>Keep records of our sales</li>
            </ul>
          </Section>

          <Section title="3. What We Do Not Do">
            <ul className="list-disc ps-6 space-y-1">
              <li>We do not sell, rent or trade your personal information to anyone.</li>
              <li>We do not use advertising networks or advertising trackers.</li>
              <li>We do not use analytics services that follow you across other websites.</li>
              <li>We do not collect payment card information. We accept cash on delivery only.</li>
            </ul>
          </Section>

          <Section title="4. Who We Share Information With">
            <p>
              <strong>Sign-in providers.</strong> Google and Apple, solely to sign you in. Their handling of your data
              is governed by their own privacy policies.
            </p>
            <p className="mt-2">
              <strong>Delivery.</strong> We share your name, phone number and delivery address with the delivery
              service or driver bringing your order, only as needed to complete the delivery.
            </p>
            <p className="mt-2">
              <strong>Technical services.</strong> Our website and database run on servers we rent from Contabo. Some
              technical components load from a public content delivery network (jsDelivr), which may receive your IP
              address as part of a normal web request.
            </p>
            <p className="mt-2">
              <strong>Legal.</strong> We may disclose information where required by law or a lawful order.
            </p>
          </Section>

          <Section title="5. Where Your Data Is Stored">
            <p>
              Your information is stored on servers located in Germany. As this is outside Iraq, your data is
              transferred and stored outside your country.
            </p>
          </Section>

          <Section title="6. How Long We Keep Your Information">
            <p>
              We keep your account information for as long as your account is open. We keep order records after that
              where we need them for business and accounting purposes. If you ask us to delete your account, we will
              delete your personal account data, though we may retain order records we are required to keep.
            </p>
          </Section>

          <Section title="7. Security">
            <p>
              We protect your information using encrypted connections (HTTPS), access controls on our database, and
              restricted administrative access. However, no method of transmission or storage is completely secure, and
              we cannot guarantee absolute security.
            </p>
          </Section>

          <Section title="8. Your Choices and Rights">
            <ul className="list-disc ps-6 space-y-1">
              <li>
                <strong>Access and correct.</strong> You can view and update your name, phone number, addresses and
                vehicle details at any time in the Account section of the app.
              </li>
              <li>
                <strong>Delete your account.</strong> You can delete your account yourself, at any time, from the
                Account section of the app (<span dir="rtl">الحساب ← حذف الحساب</span>). Deletion takes effect
                immediately and cannot be undone. It removes your profile (name, phone number and picture), your
                saved delivery addresses, your cart and favourites, your notifications and device notification
                tokens, your loyalty points, and your sign-in account itself.
                <br />
                Records of orders you have already placed are <strong>kept</strong> for the accounting, tax and legal
                purposes described in section 6, but they are disconnected from your account first, so they no longer
                identify you. That retained order data is not used to contact you or to build a profile of you.
                <br />
                If you cannot sign in, contact us using the details below and we will delete your account within 30
                days, after verifying your identity. Full details are on our{" "}
                <a className="text-gold underline" href="/delete-account">
                  account deletion page
                </a>
                .
              </li>
              <li>
                <strong>Notifications.</strong> You can turn notifications off at any time in your device settings.
              </li>
              <li>
                <strong>Sign out.</strong> You can sign out of your account at any time.
              </li>
            </ul>
          </Section>

          <Section title="9. Children">
            <p>
              The Service is not directed at children. We do not knowingly collect personal information from anyone
              under 18. If you believe a child has provided us with personal information, please contact us and we will
              delete it.
            </p>
          </Section>

          <Section title="10. Changes to This Policy">
            <p>
              We may update this policy from time to time. When we do, we will change the &quot;Last updated&quot; date
              at the top of this page. Your continued use of the Service after a change means you accept the updated
              policy.
            </p>
          </Section>

          <Section title="11. Contact Us">
            <p>
              If you have any questions about this policy or about your personal information, contact us:
            </p>
            {missing && <MissingSettingsNotice />}
            <ContactList ownerName={ownerName} address={address} supportEmail={supportEmail} waNumber={waNumber} />
            <a
              href={whatsappLink("I have a question about privacy", waNumber)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 bg-navy text-primary-foreground text-xs font-bold px-4 py-2 rounded-xl"
            >
              <MessageCircle className="size-3.5" /> Contact us on WhatsApp
            </a>
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
