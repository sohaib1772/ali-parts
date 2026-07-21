import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { whatsappLink } from "@/lib/format";
import { ContactList, MissingSettingsNotice, useLegalContact } from "@/components/legal-contact";
import { MessageCircle, Trash2 } from "lucide-react";

const LAST_UPDATED = "21 July 2026";

/**
 * Public account-deletion page.
 *
 * Google Play requires a publicly reachable URL — no login — that explains how
 * to request account deletion, what is deleted and what is retained. This URL
 * goes in the Play Console data-safety form. It is deliberately OUTSIDE the
 * _authenticated route group so a signed-out visitor (or a Play reviewer) can
 * open it.
 */
export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title: "حذف الحساب — Ali Parts" },
      { name: "description", content: "كيفية حذف حسابك في تطبيق Ali Parts والبيانات التي يتم حذفها والاحتفاظ بها." },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: "https://maktabali.com/delete-account" }],
  }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  const { storeName, ownerName, address, supportEmail, waNumber, missing } = useLegalContact();

  return (
    <PageShell wide title="حذف الحساب">
      <div className="px-4 pt-4 pb-8 md:max-w-2xl md:mx-auto">
        <div
          dir="ltr"
          className="bg-card rounded-2xl border border-border p-5 shadow-card space-y-5 text-sm leading-relaxed text-left"
        >
          <div>
            <div className="size-12 rounded-full bg-destructive/15 grid place-items-center mb-3">
              <Trash2 className="size-6 text-destructive" />
            </div>
            <h1 className="text-lg font-black text-navy mb-1">Delete Your Account</h1>
            <p className="text-xs text-muted-foreground">
              <strong>Last updated:</strong> {LAST_UPDATED}
            </p>
          </div>

          <p>
            This page explains how to delete your {storeName} account and what happens to your data. It applies to
            the {storeName} mobile app and to maktabali.com.
          </p>

          <Section title="Delete your account from inside the app">
            <p>The fastest way is to delete the account yourself. It takes effect immediately.</p>
            <ol className="list-decimal ps-6 space-y-1 mt-2">
              <li>Open the app and sign in.</li>
              <li>
                Go to <strong>الحساب</strong> (Account).
              </li>
              <li>
                Scroll to the bottom and tap <strong>حذف الحساب</strong> (Delete account).
              </li>
              <li>
                Read the summary, type <strong>حذف</strong> to confirm, and tap{" "}
                <strong>حذف حسابي نهائياً</strong>.
              </li>
            </ol>
            <p className="mt-2">
              Your account and personal data are deleted straight away and you are signed out. This cannot be undone.
            </p>
            <Link to="/account" className="mt-3 inline-flex items-center gap-2 bg-navy text-primary-foreground text-xs font-bold px-4 py-2 rounded-xl">
              Go to my account
            </Link>
          </Section>

          <Section title="Request deletion by contacting us">
            <p>
              If you cannot sign in — for example you have lost access to your Google or Apple account — contact us
              using the details at the bottom of this page and ask us to delete your account. Tell us the email
              address or phone number you used, so we can find the right account. We will verify your identity before
              deleting anything, and complete the request within 30 days.
            </p>
          </Section>

          <Section title="What is deleted">
            <ul className="list-disc ps-6 space-y-1">
              <li>Your profile: name, phone number and profile picture</li>
              <li>Your saved delivery addresses</li>
              <li>Your shopping cart and favourites</li>
              <li>Your notifications and any device notification tokens</li>
              <li>Your loyalty points balance</li>
              <li>Your sign-in account itself (Google or Apple), so you can no longer sign in</li>
            </ul>
          </Section>

          <Section title="What is kept, and why">
            <p>
              Records of orders you have already placed are kept for accounting, tax and legal purposes, as described
              in our{" "}
              <Link to="/privacy" className="text-gold underline">
                Privacy Policy
              </Link>
              . Before your account is removed, those order records are <strong>disconnected from it</strong> — they no
              longer identify you as a user of the app, and cannot be linked back to a deleted account.
            </p>
            <p className="mt-2">
              This is the only data we retain. It is not used to contact you or to build any profile of you.
            </p>
          </Section>

          <Section title="Contact us">
            <p>To request deletion, or to ask what data we hold about you:</p>
            {missing && <MissingSettingsNotice />}
            <ContactList ownerName={ownerName} address={address} supportEmail={supportEmail} waNumber={waNumber} />
            <a
              href={whatsappLink("I would like to delete my account", waNumber)}
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
