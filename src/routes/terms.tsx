import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { whatsappLink } from "@/lib/format";
import { ContactList, MissingSettingsNotice, useLegalContact } from "@/components/legal-contact";
import { MessageCircle } from "lucide-react";

const LAST_UPDATED = "21 July 2026";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "الشروط والأحكام — Ali Parts" },
      { name: "description", content: "الشروط والأحكام لاستخدام تطبيق Ali Parts لبيع قطع غيار السيارات في العراق." },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: "https://maktabali.com/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  const { storeName, ownerName, address, supportEmail, waNumber, missing } = useLegalContact();

  return (
    <PageShell wide title="الشروط والأحكام">
      <div className="px-4 pt-4 pb-8 md:max-w-2xl md:mx-auto">
        {/* The terms body is English, so it is explicitly LTR/left-aligned.
            The page chrome (header + bottom nav) stays RTL. */}
        <div
          dir="ltr"
          className="bg-card rounded-2xl border border-border p-5 shadow-card space-y-5 text-sm leading-relaxed text-left"
        >
          <div>
            <h1 className="text-lg font-black text-navy mb-1">Terms and Conditions</h1>
            <p className="text-xs text-muted-foreground">
              <strong>Last updated:</strong> {LAST_UPDATED}
            </p>
          </div>

          <p>
            Welcome to the <strong>{storeName}</strong> app. By using the app you agree to the following terms and
            conditions. Please read them carefully; if you do not agree to any provision, please do not use the app.
          </p>

          <Section title="1. Definitions">
            <ul className="list-disc ps-6 space-y-1">
              <li>&quot;The App&quot;: the {storeName} application on mobile and web.</li>
              <li>&quot;The User&quot;: any person who creates an account or uses the App.</li>
              <li>&quot;The Order&quot;: any purchase submitted through the App.</li>
              <li>&quot;The Operator&quot;: {ownerName}, the legal owner and operator of the App.</li>
            </ul>
          </Section>

          <Section title="2. Use of the App">
            <ul className="list-disc ps-6 space-y-1">
              <li>You must be 18 years of age or older to create an account.</li>
              <li>You undertake to provide true and accurate information about your identity and address.</li>
              <li>
                Using the App for any unlawful purpose, or for any purpose contrary to Apple App Store or Google Play
                policies, is prohibited.
              </li>
              <li>Attempting to hack the App, misusing the Service, or posting offensive content is prohibited.</li>
              <li>
                The Operator may suspend or delete any account that violates these Terms without prior notice.
              </li>
            </ul>
          </Section>

          <Section title="3. Orders and Prices">
            <ul className="list-disc ps-6 space-y-1">
              <li>All prices are in Iraqi Dinars and cover what is stated on the product page.</li>
              <li>
                Prices are subject to change at any time without prior notice; the price displayed at the time the
                order is confirmed is the price that applies.
              </li>
              <li>
                Product availability depends on stock; we reserve the right to cancel or amend an order if a product is
                out of stock.
              </li>
              <li>
                An order is considered confirmed once you receive a confirmation message from the Operator by WhatsApp
                or by telephone.
              </li>
            </ul>
          </Section>

          <Section title="4. Payment and Delivery">
            <ul className="list-disc ps-6 space-y-1">
              <li>Payment is made on delivery, in cash, in Iraqi Dinars.</li>
              <li>Delivery time and cost vary by governorate, as shown on the shipping page.</li>
              <li>
                The User must ensure that the delivery address and phone number are correct and that they are
                available to receive the order. If an order cannot be delivered because the User provided an incorrect
                address or an incorrect phone number, or because the User was unreachable or unavailable to receive
                it, the User is responsible for the delivery cost of that failed attempt.
              </li>
              <li>
                An unpaid delivery cost of this kind is added to the User&apos;s next order, and the Operator may
                decline to accept further orders from the User until it has been settled.
              </li>
              <li>The User has the right to inspect the part in front of the delivery agent before paying.</li>
            </ul>
          </Section>

          <Section title="5. Replacement and Returns">
            <ul className="list-disc ps-6 space-y-1">
              <li>
                A part bought from stock may be replaced or returned within three (3) days of the date of receipt,
                provided it is in its original condition, not installed and not used, and in its complete packaging.
              </li>
              <li>
                Replacement does not cover electrical parts once the packaging has been opened.
              </li>
              <li>
                <strong>Special orders are not returnable.</strong> A special order is either of the following, and in
                each case the three (3) day right of return above does not apply:
                <ul className="list-[circle] ps-6 space-y-1 mt-1">
                  <li>
                    A part arranged directly with us by telephone or WhatsApp, rather than ordered through the normal
                    ordering flow in the App.
                  </li>
                  <li>
                    A part that was not in stock at the time of ordering and was brought in from a supplier
                    specifically to fulfil the User&apos;s order — including where that order was placed through the
                    App.
                  </li>
                </ul>
              </li>
              <li>
                A part that was in stock at the time of ordering and bought through the App in the normal way is not a
                special order, and keeps the three (3) day right of return set out above.
              </li>
              <li>A part with a manufacturing defect is replaced free of charge after inspection.</li>
              <li>
                To request a replacement, use the &quot;Replacement Requests&quot; section inside the App or contact us
                by WhatsApp.
              </li>
            </ul>
          </Section>

          <Section title="6. Warranty">
            <p>
              The warranty is limited to what is expressly stated on the product page or on the purchase invoice. The
              warranty does not cover damage resulting from incorrect installation, improper use, modification, or
              accidents.
            </p>
          </Section>

          <Section title="7. Intellectual Property">
            <ul className="list-disc ps-6 space-y-1">
              <li>
                All contents of the App (logo, text, images, design, code) are the property of the Operator and are
                protected under copyright law.
              </li>
              <li>Copying or reusing any content from the App without prior written permission is prohibited.</li>
              <li>
                Trade names (Chevrolet, GMC, Cadillac and others) are registered trademarks of their respective owners.
                We use them solely to describe part compatibility, without any claim of affiliation with, or official
                sponsorship by, those companies.
              </li>
              <li>
                We are not an authorised official agent of any of these companies unless expressly stated otherwise.
              </li>
            </ul>
          </Section>

          <Section title="8. User-Submitted Content">
            <p>
              Any comment, image or review you post within the App grants the Operator a non-exclusive licence to
              display it within the App. You are responsible for the legality of what you post, and you may not post
              offensive content or content that infringes the rights of others.
            </p>
          </Section>

          <Section title="9. Limitation of Liability">
            <ul className="list-disc ps-6 space-y-1">
              <li>
                The App is provided &quot;as is&quot;, without any implied warranties as to the continuity of the
                Service or that it will be free of errors.
              </li>
              <li>
                The Operator bears no liability for indirect or consequential damages arising from use of the App.
              </li>
              <li>
                The Operator&apos;s maximum liability in respect of any order is the amount paid for that order.
              </li>
            </ul>
          </Section>

          <Section title="10. Compliance with App Store Policies">
            <p>
              The App complies with Apple App Store and Google Play policies, including their requirements for
              transparency, data protection, and user rights. Any provision of these Terms that conflicts with the
              stores&apos; policies is automatically amended so as to conform with them.
            </p>
          </Section>

          <Section title="11. Governing Law and Dispute Resolution">
            <p>
              These Terms are governed by the laws of the Republic of Iraq. Any dispute arising from use of the App
              shall first be the subject of efforts to resolve it amicably; failing that, it shall be referred to the
              competent Iraqi courts.
            </p>
          </Section>

          <Section title="12. Changes to These Terms">
            <p>
              The Operator may amend these Terms at any time. Any amendment will be published within the App together
              with an updated &quot;Last updated&quot; date, and your continued use of the App constitutes acceptance
              of the amended version.
            </p>
          </Section>

          <Section title="13. Contact">
            <p>For any enquiry or legal complaint:</p>
            {missing && <MissingSettingsNotice />}
            <ContactList ownerName={ownerName} address={address} supportEmail={supportEmail} waNumber={waNumber} />
            <a
              href={whatsappLink("I have a legal enquiry", waNumber)}
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
