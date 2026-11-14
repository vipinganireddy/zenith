const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: '36px' }}>
    <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '14px', letterSpacing: '-0.3px' }}>{title}</h2>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {children}
    </div>
  </div>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0 }}>{children}</p>
);

const UL = ({ items }: { items: string[] }) => (
  <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
    {items.map((item, i) => (
      <li key={i} style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{item}</li>
    ))}
  </ul>
);

/* `embedded`: shown inside the app (Account → Policies), under the app bar
   rather than the marketing header, so it needs less top padding. */
const PrivacyPolicy = ({ embedded = false }: { embedded?: boolean }) => {
  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: embedded ? '8px 4px 48px' : '64px 24px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: embedded ? '24px' : '48px', paddingBottom: embedded ? '20px' : '28px', borderBottom: '1px solid var(--border-color)' }}>
        {!embedded && (<div style={{ display: 'inline-block', fontSize: '12px', fontWeight: 700, padding: '4px 12px', borderRadius: '9999px', background: 'var(--primary-subtle)', color: 'var(--primary)', border: '1px solid var(--primary-border)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
          Legal
        </div>)}
        {!embedded && (<h1 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, letterSpacing: '-1.5px', color: 'var(--text-main)', marginBottom: '12px', lineHeight: 1.05 }}>
          Privacy Policy
        </h1>)}
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
          Effective Date: 1 January 2026 &nbsp;·&nbsp; Last Updated: 25 May 2026
        </p>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '14px', lineHeight: 1.7 }}>
          This Privacy Policy describes how <strong style={{ color: 'var(--text-main)' }}>Orithe Business Solutions PVT LTD</strong> ("Orithe", "we", "us", or "our") collects, uses, and protects information when you use <strong style={{ color: 'var(--text-main)' }}>O-Zenith</strong> ("the Service", "the Platform"). Please read this policy carefully. By using O-Zenith, you agree to the practices described herein.
        </p>
      </div>

      {/* 1 */}
      <Section title="1. Our Core Privacy Commitment">
        <P>O-Zenith is built on a simple, unbreakable promise: <strong style={{ color: 'var(--text-main)' }}>your files are yours alone</strong>. All document processing in O-Zenith happens locally inside your browser using WebAssembly technology. Your files are never uploaded to our servers, never transmitted to third parties, and never stored remotely. This is not a policy choice — it is our technical architecture.</P>
        <P>We collect only the minimum information required to operate the Service, process payments, and provide support. We do not sell, rent, or trade your personal information to any third party, ever.</P>
      </Section>

      {/* 2 */}
      <Section title="2. Information We Collect">
        <P><strong style={{ color: 'var(--text-main)' }}>2.1 Account Information</strong></P>
        <P>When you create an account, we collect your name, email address, and a hashed version of your password. Passwords are hashed using SHA-256 via the browser's native Web Crypto API before being stored. We never see or store your plaintext password.</P>

        <P><strong style={{ color: 'var(--text-main)' }}>2.2 Subscription and Billing Information</strong></P>
        <P>If you purchase a PRO plan, payments are processed entirely by Razorpay, our payment processor. We do not receive or store your credit card number, UPI credentials, or bank account details. Razorpay shares only your payment status, a transaction reference ID, and your billing plan type with us.</P>

        <P><strong style={{ color: 'var(--text-main)' }}>2.3 Usage Data</strong></P>
        <P>We collect limited, anonymised usage data to improve the Service, including:</P>
        <UL items={[
          'Pages and features visited within the app',
          'Browser type, operating system, and screen resolution (used for compatibility and debugging)',
          'Approximate geographic region (country level only, derived from IP address)',
          'Error logs and crash reports (without file content)',
          'Subscription tier and feature access events',
        ]} />

        <P><strong style={{ color: 'var(--text-main)' }}>2.4 Local Storage</strong></P>
        <P>O-Zenith stores certain data locally in your browser's localStorage. This includes your dark/light mode preference, subscription plan status, free-use count, your AI API keys (if provided), and your tool favorites. This data never leaves your device through our systems.</P>

        <P><strong style={{ color: 'var(--text-main)' }}>2.5 Communications</strong></P>
        <P>If you contact us via email or the contact form, we retain the content of your message and your email address in order to respond and improve our support quality. We do not use support communications for marketing without your explicit consent.</P>
      </Section>

      {/* 3 */}
      <Section title="3. Your Files and Documents">
        <P>This is the most important section of this Privacy Policy.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>Files you process using O-Zenith are processed entirely within your browser.</strong> They are not transmitted to, stored on, or accessible by our servers at any point during or after processing.</P>
        <UL items={[
          'O-Zenith uses WebAssembly (Wasm) to run document-processing code natively in your browser, with no server round-trip.',
          'No file content, metadata, or derived data from your documents is collected, logged, or stored by Orithe.',
          'AI features use API keys that you provide. Requests are sent directly from your browser to the respective AI provider (OpenAI, Anthropic, Google, etc.). We do not see or intercept these requests.',
          'AI API keys you enter are stored only in your browser\'s localStorage and are never transmitted to our servers.',
          'Temporary files created during processing exist only in browser memory and are immediately discarded once your task completes.',
        ]} />
      </Section>

      {/* 4 */}
      <Section title="4. How We Use Your Information">
        <P>We use the information we collect to:</P>
        <UL items={[
          'Create and manage your O-Zenith account',
          'Process your subscription payments and manage plan entitlements',
          'Provide customer support and respond to your inquiries',
          'Send transactional emails (account verification, payment receipts, subscription renewal reminders)',
          'Detect and prevent fraudulent activity or abuse of the Service',
          'Analyse anonymised usage trends to improve the product',
          'Comply with our legal obligations under applicable law',
        ]} />
        <P>We do not use your personal information to build advertising profiles, sell data, or engage in behavioural tracking.</P>
      </Section>

      {/* 5 */}
      <Section title="5. Cookies and Tracking Technologies">
        <P>O-Zenith uses a minimal set of cookies and browser storage technologies:</P>
        <UL items={[
          'Session cookies: Used to keep you logged in during a browser session. These expire when you close the browser.',
          'Preference storage (localStorage): Stores your theme choice and tool preferences. No tracking information.',
          'Analytics: We use privacy-respecting, cookieless analytics to count page visits and measure feature usage at an aggregate level. No individual user tracking, no cross-site tracking, no advertising cookies.',
        ]} />
        <P>We do not use Google Ads, Facebook Pixel, or any third-party advertising trackers on our platform.</P>
      </Section>

      {/* 6 */}
      <Section title="6. Data Sharing and Third Parties">
        <P>We do not sell, trade, rent, or share your personal information with third parties for their own commercial purposes. We share data only in the following limited circumstances:</P>
        <UL items={[
          'Payment processing: Razorpay receives billing information necessary to process your subscription payment. Razorpay\'s privacy policy governs their handling of this data.',
          'Email delivery: Transactional emails (receipts, account notices) are sent via an email delivery service. Only your email address and the message content are shared.',
          'Legal compliance: We may disclose information when required by law, court order, or to protect the rights and safety of our users or the public. We will notify you where legally permitted to do so.',
          'Business transfers: In the event of a merger, acquisition, or sale of Orithe Business Solutions, your information may be transferred as part of that transaction. You will be notified in advance.',
        ]} />
      </Section>

      {/* 7 */}
      <Section title="7. Data Retention">
        <P>We retain your account information for as long as your account is active. If you delete your account, we will permanently erase your personal data within 30 days, except where we are required by law to retain it (for example, payment records for tax compliance, which are retained for 7 years as required under Indian law).</P>
        <P>Since your files are processed locally, there is no file data retained on our end — ever.</P>
      </Section>

      {/* 8 */}
      <Section title="8. Your Privacy Rights">
        <P>Depending on your location, you may have the following rights regarding your personal data:</P>
        <UL items={[
          'Right to Access: Request a copy of the personal data we hold about you.',
          'Right to Rectification: Request correction of inaccurate personal data.',
          'Right to Erasure: Request deletion of your account and associated personal data.',
          'Right to Portability: Request your data in a structured, machine-readable format.',
          'Right to Object: Object to certain types of processing, including direct marketing.',
          'Right to Restrict Processing: Request that we limit how we process your data in certain circumstances.',
          'Right to Withdraw Consent: Where processing is based on consent, you may withdraw it at any time.',
        ]} />
        <P>To exercise any of these rights, email us at <strong style={{ color: 'var(--text-main)' }}>shadowxbooster@gmail.com</strong>. We will respond within 30 days. Users in the European Economic Area have the right to lodge a complaint with their local data protection authority.</P>
      </Section>

      {/* 9 */}
      <Section title="9. Security">
        <P>We take security seriously and implement the following safeguards:</P>
        <UL items={[
          'All data transmitted between your browser and our servers is encrypted using TLS 1.3.',
          'Passwords are hashed using SHA-256 via the Web Crypto API and are never stored in plaintext.',
          'Access to production systems is restricted to authorised personnel and protected by multi-factor authentication.',
          'We conduct periodic security reviews and vulnerability assessments.',
          'AI API keys are stored exclusively in your browser\'s localStorage and never transmitted to our servers.',
        ]} />
        <P>While we implement industry-standard protections, no system is completely secure. If you believe your account has been compromised, contact us immediately at <strong style={{ color: 'var(--text-main)' }}>shadowxbooster@gmail.com</strong>.</P>
      </Section>

      {/* 10 */}
      <Section title="10. Children's Privacy">
        <P>O-Zenith is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. If we discover that a child under 13 has provided us with personal information, we will delete it promptly. If you are a parent or guardian and believe your child has submitted personal information to us, please contact us at <strong style={{ color: 'var(--text-main)' }}>shadowxbooster@gmail.com</strong>.</P>
      </Section>

      {/* 11 */}
      <Section title="11. International Data Transfers">
        <P>Orithe Business Solutions PVT LTD is incorporated in India. If you are accessing O-Zenith from outside India, your information may be transferred to and processed in India, where data protection laws may differ from those in your country. By using O-Zenith, you consent to this transfer. We ensure appropriate safeguards are in place in accordance with applicable data protection regulations.</P>
      </Section>

      {/* 12 */}
      <Section title="12. Changes to This Policy">
        <P>We may update this Privacy Policy from time to time to reflect changes in our practices or applicable law. When we make material changes, we will notify you by email (if you have an account) and update the "Last Updated" date at the top of this page. Your continued use of the Service after the effective date of any changes constitutes your acceptance of the revised policy.</P>
      </Section>

      {/* 13 */}
      <Section title="13. Contact Us">
        <P>If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:</P>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px 24px', marginTop: '4px' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-main)', fontWeight: 700, margin: '0 0 8px' }}>Orithe Business Solutions PVT LTD</p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>Privacy Officer — <strong style={{ color: 'var(--text-main)' }}>shadowxbooster@gmail.com</strong></p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>General Support — <strong style={{ color: 'var(--text-main)' }}>shadowxbooster@gmail.com</strong></p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>India</p>
        </div>
      </Section>

    </div>
  );
};

export default PrivacyPolicy;
