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
const Terms = ({ embedded = false }: { embedded?: boolean }) => {
  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: embedded ? '8px 4px 48px' : '64px 24px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: embedded ? '24px' : '48px', paddingBottom: embedded ? '20px' : '28px', borderBottom: '1px solid var(--border-color)' }}>
        {!embedded && (<div style={{ display: 'inline-block', fontSize: '12px', fontWeight: 700, padding: '4px 12px', borderRadius: '9999px', background: 'var(--primary-subtle)', color: 'var(--primary)', border: '1px solid var(--primary-border)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
          Legal
        </div>)}
        {!embedded && (<h1 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, letterSpacing: '-1.5px', color: 'var(--text-main)', marginBottom: '12px', lineHeight: 1.05 }}>
          Terms of Service
        </h1>)}
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
          Effective Date: 1 January 2026 &nbsp;·&nbsp; Last Updated: 25 May 2026
        </p>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '14px', lineHeight: 1.7 }}>
          These Terms of Service ("Terms") constitute a legally binding agreement between you ("User", "you") and <strong style={{ color: 'var(--text-main)' }}>Orithe Business Solutions PVT LTD</strong> ("Orithe", "we", "us", or "our"), governing your access to and use of <strong style={{ color: 'var(--text-main)' }}>O-Zenith</strong> ("the Service", "the Platform", "the Product"). By creating an account or using the Service, you agree to these Terms in full. If you do not agree, do not use the Service.
        </p>
      </div>

      {/* 1 */}
      <Section title="1. About O-Zenith">
        <P>O-Zenith is a browser-based, AI-powered document and PDF workspace developed and operated by Orithe Business Solutions PVT LTD, a company incorporated in India. The Service enables users to edit, convert, compress, organise, sign, and process PDF documents, as well as access AI-powered document tools, productivity features, developer integrations, and business document workflows.</P>
        <P>O-Zenith is provided as a software-as-a-service (SaaS) product accessible via web browser. No installation is required.</P>
      </Section>

      {/* 2 */}
      <Section title="2. Eligibility">
        <P>To use O-Zenith, you must:</P>
        <UL items={[
          'Be at least 13 years of age. If you are between 13 and 18, you represent that a parent or legal guardian has reviewed and consented to these Terms on your behalf.',
          'Have the legal capacity to enter into a binding contract in your jurisdiction.',
          'Not be prohibited from receiving services under applicable law (including sanctions or export control regulations).',
          'Provide accurate and truthful information when creating your account.',
        ]} />
      </Section>

      {/* 3 */}
      <Section title="3. Accounts and Registration">
        <P><strong style={{ color: 'var(--text-main)' }}>3.1 Account Creation.</strong> You may use limited features of O-Zenith without an account (3 free tool uses). To access the full platform, you must register an account with a valid email address and a password. You are responsible for maintaining the confidentiality of your login credentials.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>3.2 Account Security.</strong> You are solely responsible for all activity that occurs under your account. If you suspect unauthorised access, notify us immediately at <strong style={{ color: 'var(--text-main)' }}>shadowxbooster@gmail.com</strong>. We are not liable for any loss arising from unauthorised use of your account.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>3.3 One Account Per User.</strong> You may not create multiple accounts to circumvent free-use limits or any other restrictions. Accounts are non-transferable.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>3.4 Account Termination.</strong> We reserve the right to suspend or terminate accounts that violate these Terms, engage in fraudulent activity, or cause harm to the Service or other users.</P>
      </Section>

      {/* 4 */}
      <Section title="4. Subscription Plans and Payments">
        <P><strong style={{ color: 'var(--text-main)' }}>4.1 Plan Tiers.</strong> O-Zenith offers two access tiers:</P>
        <UL items={[
          'Free: Up to 3 total tool uses across any tool category. No credit card required.',
          'PRO: Monthly (₹29/month) or Yearly (₹339/year) subscription. Complete access to every tool and all future tools.',
        ]} />
        <P><strong style={{ color: 'var(--text-main)' }}>4.2 Billing.</strong> Subscription fees are billed in Indian Rupees (INR) at the beginning of each billing period (monthly or annual). Payments are processed by Razorpay. By subscribing, you authorise Razorpay to charge your selected payment method on a recurring basis until you cancel.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>4.3 Auto-Renewal.</strong> Subscriptions automatically renew at the end of each billing period unless you cancel before the renewal date. You may cancel at any time from your Profile → Subscription settings.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>4.4 Price Changes.</strong> We may change subscription prices with 30 days' advance notice via email or in-app notification. Continued use of the Service after the effective date of a price change constitutes acceptance of the new price.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>4.5 Refunds.</strong> We offer a 7-day money-back guarantee for first-time subscribers. If you are not satisfied within the first 7 days of your initial subscription, contact us at <strong style={{ color: 'var(--text-main)' }}>shadowxbooster@gmail.com</strong> for a full refund. Refunds are not available for renewals, partial billing periods, or where a plan was used extensively during the refund window. We reserve the right to deny refunds in cases of abuse.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>4.6 Taxes.</strong> Prices may be subject to applicable taxes (including GST) based on your location. Tax amounts will be displayed at checkout.</P>
      </Section>

      {/* 5 */}
      <Section title="5. Acceptable Use">
        <P>You agree to use O-Zenith only for lawful purposes and in a manner consistent with these Terms. You must not:</P>
        <UL items={[
          'Upload, process, or distribute documents that are illegal, infringing, defamatory, obscene, or harmful',
          'Attempt to reverse-engineer, decompile, or extract the source code of the Service',
          'Use automated scripts, bots, or scrapers to access the Service at scale without written permission',
          'Attempt to gain unauthorised access to other users\' accounts, our servers, or any systems connected to the Service',
          'Resell, sublicense, or otherwise commercialise access to the Service without authorisation',
          'Use the Service to process documents belonging to others without proper authorisation',
          'Interfere with or disrupt the integrity or performance of the Service',
          'Use the Service to facilitate copyright infringement or violate any third party\'s intellectual property rights',
          'Misrepresent your identity or affiliation when using the Service',
          'Use the AI tools in a manner that violates the terms of service of the underlying AI providers (OpenAI, Anthropic, Google, etc.)',
        ]} />
        <P>Violation of this section may result in immediate account suspension without refund and, where appropriate, referral to law enforcement.</P>
      </Section>

      {/* 6 */}
      <Section title="6. User Content and Files">
        <P><strong style={{ color: 'var(--text-main)' }}>6.1 Ownership.</strong> You retain full ownership of all files and documents you process using O-Zenith. We do not claim any rights over your content.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>6.2 Responsibility.</strong> You are solely responsible for ensuring you have the legal right to process any document using our Service. Do not process documents that you do not own or have explicit permission to handle.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>6.3 No Server Access.</strong> As described in our Privacy Policy, file processing occurs locally in your browser. We do not access, view, store, or derive any data from the files you process.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>6.4 AI-Generated Output.</strong> When using AI features, the quality and accuracy of AI-generated summaries, translations, or analyses depend on the AI provider you configure (OpenAI, Anthropic, etc.). Orithe is not responsible for the accuracy or fitness of AI-generated content for any purpose.</P>
      </Section>

      {/* 7 */}
      <Section title="7. Intellectual Property">
        <P><strong style={{ color: 'var(--text-main)' }}>7.1 Our Property.</strong> O-Zenith and all its components — including the interface design, software, branding, logos, tool names, workflows, and content created by us — are owned by or licensed to Orithe Business Solutions PVT LTD and are protected by applicable intellectual property laws.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>7.2 Licence to Use.</strong> Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable licence to access and use the Service for your personal or internal business purposes during your active subscription period.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>7.3 Feedback.</strong> If you submit suggestions, ideas, or feedback about O-Zenith, you grant us a perpetual, irrevocable, royalty-free licence to use that feedback for any purpose, including incorporation into the Service, without compensation to you.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>7.4 Trademarks.</strong> "O-Zenith", "Orithe", and associated logos are trademarks of Orithe Business Solutions PVT LTD. You may not use these marks without our prior written consent.</P>
      </Section>

      {/* 8 */}
      <Section title="8. Third-Party Services and AI Providers">
        <P>O-Zenith integrates with third-party AI providers (such as OpenAI, Anthropic, and Google). When you use AI features with your own API key, your requests are sent directly from your browser to the respective provider. Your use of those services is subject to the provider's terms of service and privacy policy, which you are responsible for reviewing and complying with. Orithe is not responsible for the actions, content, or availability of any third-party service.</P>
        <P>Payment processing is handled by Razorpay. Your financial transactions with Razorpay are governed by Razorpay's terms and privacy policy.</P>
      </Section>

      {/* 9 */}
      <Section title="9. Disclaimers">
        <P>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.</P>
        <P>We do not warrant that:</P>
        <UL items={[
          'The Service will be uninterrupted, timely, secure, or error-free',
          'The results obtained from using the Service will be accurate, complete, or reliable',
          'Any errors or defects in the Service will be corrected',
          'AI-generated output will be accurate, complete, legally valid, or suitable for any specific purpose',
        ]} />
        <P>O-Zenith is not a law firm and does not provide legal advice. Templates and legal documents generated by O-Zenith are provided for informational purposes only and should be reviewed by a qualified legal professional before use.</P>
      </Section>

      {/* 10 */}
      <Section title="10. Limitation of Liability">
        <P>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ORITHE BUSINESS SOLUTIONS PVT LTD, ITS DIRECTORS, EMPLOYEES, CONTRACTORS, AND AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF DATA, PROFITS, GOODWILL, OR BUSINESS OPPORTUNITIES, ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</P>
        <P>OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ANY CLAIM ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM, OR (B) ₹500 (FIVE HUNDRED INDIAN RUPEES).</P>
      </Section>

      {/* 11 */}
      <Section title="11. Indemnification">
        <P>You agree to defend, indemnify, and hold harmless Orithe Business Solutions PVT LTD and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or related to: (a) your use of the Service; (b) your violation of these Terms; (c) your violation of any third party's rights; or (d) any content you process using the Service.</P>
      </Section>

      {/* 12 */}
      <Section title="12. Service Availability and Modifications">
        <P><strong style={{ color: 'var(--text-main)' }}>12.1 Availability.</strong> We strive to maintain high availability but do not guarantee uninterrupted access. Scheduled maintenance, force majeure events, or technical failures may cause temporary downtime. We will endeavour to provide advance notice of planned maintenance.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>12.2 Modifications.</strong> We reserve the right to modify, update, or discontinue any feature or aspect of the Service at any time. We will provide reasonable notice for significant changes that materially affect your use of the Service.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>12.3 Feature Access.</strong> The specific tools and features available under each plan are subject to change. We will provide 14 days' advance notice before removing features from a plan tier that existing subscribers rely on.</P>
      </Section>

      {/* 13 */}
      <Section title="13. Termination">
        <P><strong style={{ color: 'var(--text-main)' }}>13.1 By You.</strong> You may cancel your account at any time through your Profile settings or by contacting support. Cancellation takes effect at the end of your current billing period for paid plans.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>13.2 By Us.</strong> We may suspend or terminate your access to the Service immediately, without notice, if you materially breach these Terms, engage in fraudulent or harmful behaviour, or if required by law. In the event of termination for cause, no refund will be issued.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>13.3 Effect of Termination.</strong> Upon termination, your licence to use the Service ceases immediately. Sections that by their nature should survive termination (including intellectual property, limitation of liability, indemnification, and governing law) shall survive.</P>
      </Section>

      {/* 14 */}
      <Section title="14. Governing Law and Dispute Resolution">
        <P>These Terms shall be governed by and construed in accordance with the laws of India, without regard to conflict of law principles. Any disputes arising from or relating to these Terms or the Service shall be subject to the exclusive jurisdiction of the courts of India.</P>
        <P>Before initiating formal legal proceedings, we encourage you to contact us directly at <strong style={{ color: 'var(--text-main)' }}>shadowxbooster@gmail.com</strong> to resolve disputes informally. We will make good-faith efforts to resolve any issue within 30 days.</P>
      </Section>

      {/* 15 */}
      <Section title="15. Changes to These Terms">
        <P>We may revise these Terms from time to time. When we make material changes, we will notify you via email (if you have an account) or via a prominent notice within the Service, and update the "Last Updated" date at the top. Your continued use of the Service after the effective date constitutes acceptance of the revised Terms. If you do not agree to the revised Terms, you must stop using the Service and may cancel your subscription.</P>
      </Section>

      {/* 16 */}
      <Section title="16. Miscellaneous">
        <P><strong style={{ color: 'var(--text-main)' }}>Entire Agreement.</strong> These Terms, together with our Privacy Policy, constitute the entire agreement between you and Orithe regarding the Service and supersede all prior agreements.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>Severability.</strong> If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>No Waiver.</strong> Failure to enforce any provision of these Terms does not constitute a waiver of our right to enforce it in the future.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>Assignment.</strong> You may not assign or transfer these Terms or any rights granted hereunder without our prior written consent. We may freely assign these Terms in connection with a merger, acquisition, or sale of assets.</P>
        <P><strong style={{ color: 'var(--text-main)' }}>Language.</strong> These Terms are written in English. In the event of any inconsistency between an English version and a translated version, the English version shall prevail.</P>
      </Section>

      {/* 17 */}
      <Section title="17. Contact Us">
        <P>For questions about these Terms, please contact:</P>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px 24px', marginTop: '4px' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-main)', fontWeight: 700, margin: '0 0 8px' }}>Orithe Business Solutions PVT LTD</p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>Legal &amp; Compliance — <strong style={{ color: 'var(--text-main)' }}>shadowxbooster@gmail.com</strong></p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>General Support — <strong style={{ color: 'var(--text-main)' }}>shadowxbooster@gmail.com</strong></p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>India</p>
        </div>
      </Section>

    </div>
  );
};

export default Terms;
