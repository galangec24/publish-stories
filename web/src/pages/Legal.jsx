import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

const UPDATED = 'October 22, 2026'
const CONTACT = 'galangec24@gmail.com'

function LegalPage({ icon: Icon, title, children }) {
  return (
    <article className="mx-auto max-w-3xl pt-10">
      <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to stories
      </Link>
      <div className="card p-7 sm:p-10">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/15 text-brand">
          <Icon className="h-6 w-6" />
        </span>
        <h1 className="mt-4 font-display text-4xl">{title}</h1>
        <p className="mt-1 text-sm text-muted">Last updated {UPDATED}</p>
        <div className="legal mt-8 space-y-6 leading-relaxed">{children}</div>
      </div>
    </article>
  )
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="mb-2 font-display text-2xl">{title}</h2>
      <div className="space-y-3 text-muted [&_strong]:text-ink [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </section>
  )
}

export function Privacy() {
  return (
    <LegalPage icon={ShieldCheck} title="Privacy Policy">
      <p className="text-muted">
        Publish Stories (&ldquo;we&rdquo;) lets readers browse and unlock stories by Maria Gemima Valderrama. This policy
        explains what we collect, why, and the choices you have.
      </p>
      <Section title="Information we collect">
        <ul>
          <li><strong>Account details:</strong> your email address, first and last name, and display name.</li>
          <li><strong>Google sign-in:</strong> if you continue with Google, we receive your name, email address and profile picture from Google. We never see your Google password.</li>
          <li><strong>Email sign-in:</strong> your password is stored only as a secure hash. One-time verification codes are stored as a hash and expire after 10 minutes.</li>
          <li><strong>Reading activity:</strong> which stories you open and when, used to show view and reader counts and to remember your preferences (genres, theme, page style).</li>
          <li><strong>Purchases:</strong> which stories you unlocked and the amount. Payments are processed by PayMongo; we never receive your card, GCash, Maya or bank details.</li>
          <li><strong>Support messages:</strong> messages you send through the support chat.</li>
        </ul>
      </Section>
      <Section title="How we use it">
        <ul>
          <li>To create and secure your account and let you sign in.</li>
          <li>To unlock the stories you paid for and show your reading progress.</li>
          <li>To send account emails such as verification and password reset codes.</li>
          <li>To answer your support messages and send in-app notifications.</li>
          <li>To understand which stories are read, using counts rather than selling or profiling.</li>
        </ul>
        <p>We do not sell your personal information and we do not show third-party ads.</p>
      </Section>
      <Section title="Services we use">
        <ul>
          <li><strong>Google</strong> for &ldquo;Continue with Google&rdquo; sign-in.</li>
          <li><strong>Brevo</strong> to deliver account emails.</li>
          <li><strong>PayMongo</strong> to process QR Ph payments.</li>
          <li><strong>Render</strong>, <strong>Supabase</strong> and <strong>Firebase</strong> to host the app and store data.</li>
        </ul>
        <p>Each provider only receives the information needed to perform its service.</p>
      </Section>
      <Section title="Guest readers">
        <p>
          If you read without an account, your browser keeps a random identifier so a visit is counted once per day.
          We store only a scrambled (hashed) version of it, never your name or contact details.
        </p>
      </Section>
      <Section title="Keeping and deleting your data">
        <p>
          We keep your account information while your account is active. You can update your name in your profile at any
          time. To change your email, request it from your profile; an admin reviews the request for your security. To
          delete your account and its data, email us at <a className="text-brand underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          Payment records may be kept as required by law.
        </p>
      </Section>
      <Section title="Security">
        <p>
          Connections are encrypted (HTTPS), passwords and codes are hashed, and access to admin tools is restricted.
          No system is perfectly secure, so please use a strong password and keep it private.
        </p>
      </Section>
      <Section title="Children">
        <p>Publish Stories is not directed to children under 13, and we do not knowingly collect their information.</p>
      </Section>
      <Section title="Contact">
        <p>
          Questions about this policy? Email <a className="text-brand underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
          {' '}or use the support chat. If we change this policy, we will update the date above.
        </p>
      </Section>
    </LegalPage>
  )
}

export function Terms() {
  return (
    <LegalPage icon={FileText} title="Terms of Service">
      <p className="text-muted">
        By using Publish Stories you agree to these terms. If you don&apos;t agree, please don&apos;t use the service.
      </p>
      <Section title="Your account">
        <p>
          Keep your sign-in details secure and give accurate information. You are responsible for activity on your
          account. We may suspend accounts that misuse the service.
        </p>
      </Section>
      <Section title="Stories and copyright">
        <p>
          All stories, columns, images and other content are owned by their author and are protected by copyright. Your
          access is for personal reading only. You may not copy, screenshot, record, redistribute, sell or publish the
          content without written permission.
        </p>
      </Section>
      <Section title="Purchases">
        <ul>
          <li>Some stories are free; others show a preview and can be unlocked with a one-time QR Ph payment through PayMongo.</li>
          <li>An unlocked story stays available on your account.</li>
          <li>Prices are in Philippine pesos and shown before you pay.</li>
          <li>If a payment went through but the story didn&apos;t unlock, contact us through the support chat and we will fix it or refund you.</li>
        </ul>
      </Section>
      <Section title="Acceptable use">
        <p>
          Don&apos;t attempt to bypass the paywall, interfere with the service, access other people&apos;s accounts, or
          send abusive messages through the support chat.
        </p>
      </Section>
      <Section title="Availability">
        <p>
          We work to keep the service running but can&apos;t guarantee it will always be available or error-free. We may
          update or change features over time.
        </p>
      </Section>
      <Section title="Liability">
        <p>
          The service is provided &ldquo;as is&rdquo;. To the extent allowed by law, we are not liable for indirect or
          incidental damages arising from your use of the service.
        </p>
      </Section>
      <Section title="Changes and contact">
        <p>
          We may update these terms and will change the date above when we do. Questions? Email{' '}
          <a className="text-brand underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>. These terms are governed by the
          laws of the Republic of the Philippines.
        </p>
      </Section>
    </LegalPage>
  )
}
