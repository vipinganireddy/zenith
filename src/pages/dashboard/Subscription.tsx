import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check, Crown, Sparkles, PenLine, FileOutput, FileInput, LayoutGrid, ScanLine, Briefcase,
  Cloud, Infinity as InfinityIcon, ShieldCheck, AlertCircle,
} from 'lucide-react';
import { useSubscription, type PlanId, FREE_USES_LIMIT } from '../../context/SubscriptionContext';
import { useToast } from '../../hooks/useToast';
import { toolCountByCategory, TOTAL_TOOLS } from '../../data/toolsData';

/* Plans, as an app screen: the plan card, a free-tries meter, the two PRO
   options as selectable rows, what PRO unlocks as a grouped list, and one
   primary action. Dialogs are bottom sheets.

   Payment flow is unchanged: the Razorpay link opens, then the payment ID is
   entered to activate. (To be replaced when real payments are wired.) */

const RAZORPAY_LINKS: Record<string, string> = {
  pro_monthly: 'https://rzp.io/rzp/pro-monthly',
  pro_yearly: 'https://rzp.io/rzp/pro-yearly',
};

const UNLOCKS = [
  { Icon: Sparkles, label: 'AI tools', hint: `${toolCountByCategory['ai']} tools`, color: '#A855F7' },
  { Icon: PenLine, label: 'PDF editing', hint: `${toolCountByCategory['edit']} tools`, color: 'var(--cat-water)' },
  { Icon: FileOutput, label: 'Convert from PDF', hint: `${toolCountByCategory['convert-from']} tools`, color: 'var(--cat-activity)' },
  { Icon: FileInput, label: 'Convert to PDF', hint: `${toolCountByCategory['convert-to']} tools`, color: 'var(--cat-vitals)' },
  { Icon: LayoutGrid, label: 'Organize PDF', hint: `${toolCountByCategory['organize']} tools`, color: 'var(--cat-energy)' },
  { Icon: ScanLine, label: 'Scan & media', hint: `${toolCountByCategory['scan-media']} tools`, color: 'var(--cat-sleep)' },
  { Icon: Briefcase, label: 'Productivity', hint: `${toolCountByCategory['productivity']} tools`, color: 'var(--cat-body)' },
  { Icon: Cloud, label: 'Google Drive backup', hint: undefined, color: '#1A73E8' },
  { Icon: InfinityIcon, label: 'Unlimited use', hint: undefined, color: 'var(--accent)' },
];

const OPTIONS: { id: PlanId; title: string; price: string; per: string; note: string; badge?: string }[] = [
  { id: 'pro_yearly', title: 'Yearly', price: '₹339', per: '/year', note: '₹28.25 a month', badge: 'Save 25%' },
  { id: 'pro_monthly', title: 'Monthly', price: '₹29', per: '/month', note: 'Cancel any time' },
];

/** Bottom sheet on phones, centred dialog on wider screens. */
const Sheet = ({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) => createPortal(
  <AnimatePresence>
    {open && (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 'var(--kb, 0px)' }}>
        <motion.div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 340, mass: 0.8 }}
          style={{ width: '100%', maxWidth: '520px', background: 'var(--surface)', borderRadius: '28px 28px 0 0', boxShadow: 'var(--shadow-floating)',
            padding: '10px 20px calc(20px + var(--sheet-bottom))', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box' }}>
          <span aria-hidden style={{ alignSelf: 'center', width: '36px', height: '5px', borderRadius: '9999px', background: 'color-mix(in srgb, var(--ink) 18%, transparent)' }} />
          {children}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>,
  document.body,
);

const Subscription = () => {
  const { subscription, isFree, isPro, isYearly, daysLeft, freeUsesLeft, freeUsesUsed, subscribe, cancelSubscription } = useSubscription();
  const { showToast } = useToast();

  const [choice, setChoice] = useState<PlanId>('pro_yearly');
  const [showCancel, setShowCancel] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);
  const [paymentId, setPaymentId] = useState('');

  const handleUpgrade = () => {
    setPendingPlan(choice);
    window.open(RAZORPAY_LINKS[choice], '_blank', 'noopener,noreferrer');
  };
  const handleVerifyPayment = () => {
    if (!pendingPlan) return;
    subscribe(pendingPlan);
    setPendingPlan(null);
    setPaymentId('');
    showToast('Welcome to PRO. Every tool is unlocked.');
  };
  const handleCancel = () => {
    cancelSubscription();
    setShowCancel(false);
    showToast('Your plan was cancelled. You’re on the free plan now.', 'info');
  };

  const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const renews = fmt(subscription.expiresAt);
  const selected = OPTIONS.find(o => o.id === choice)!;
  const caps: React.CSSProperties = { margin: '0 0 8px 16px', fontSize: '12px', lineHeight: '16px', fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink-faint)' };
  const onAccentSoft = 'color-mix(in srgb, var(--on-accent) 72%, transparent)';

  return (
    <div style={{ maxWidth: '520px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '24px' }}>

      {/* Plan card */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '24px', padding: '24px', background: 'var(--accent)', color: 'var(--on-accent)', boxShadow: 'var(--shadow-raised)' }}>
        <svg aria-hidden viewBox="0 0 200 200" style={{ position: 'absolute', right: '-50px', top: '-50px', width: '200px', height: '200px' }}>
          <circle cx="100" cy="110" r="60" fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="20" />
          <circle cx="100" cy="26" r="12" fill="currentColor" fillOpacity="0.1" />
        </svg>
        <span style={{ position: 'relative', width: '44px', height: '44px', borderRadius: '9999px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--on-accent) 16%, transparent)', marginBottom: '16px' }}>
          <Crown size={22} />
        </span>
        <div style={{ position: 'relative', fontFamily: 'var(--font-display)', fontSize: '24px', lineHeight: '30px', fontWeight: 800 }}>
          {isPro ? `PRO · ${isYearly ? 'Yearly' : 'Monthly'}` : 'O-Zenith PRO'}
        </div>
        <p style={{ position: 'relative', margin: '4px 0 0', fontSize: '15px', lineHeight: '22px', color: onAccentSoft }}>
          {isPro
            ? <>Every tool is unlocked.{renews && <> Renews {renews}</>}{daysLeft !== null && <> · {daysLeft} days left</>}</>
            : <>All {TOTAL_TOOLS} tools, unlimited, with AI and Drive backup.</>}
        </p>
      </div>

      {/* Free tries meter */}
      {isFree && (
        <div style={{ background: 'var(--surface)', borderRadius: '20px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
            <span style={{ fontSize: '16px', lineHeight: '24px', fontWeight: 600, color: 'var(--ink)' }}>
              {freeUsesLeft === 0 ? 'No free tries left' : `${freeUsesLeft} of ${FREE_USES_LIMIT} free tries left`}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--ink-faint)' }}>Free plan</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }} aria-hidden>
            {Array.from({ length: FREE_USES_LIMIT }).map((_, i) => (
              <span key={i} style={{ flex: 1, height: '6px', borderRadius: '9999px', background: i < freeUsesUsed ? 'var(--accent)' : 'var(--surface-high)' }} />
            ))}
          </div>
        </div>
      )}

      {/* PRO options */}
      {!isPro && (
        <section>
          <h2 style={caps}>Choose a plan</h2>
          <div role="radiogroup" aria-label="PRO plan" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {OPTIONS.map(o => {
              const on = choice === o.id;
              return (
                <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => setChoice(o.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '14px', minHeight: '72px', padding: '0 16px', border: 'none', borderRadius: '20px', cursor: 'pointer', textAlign: 'left',
                    background: 'var(--surface)', boxShadow: on ? 'inset 0 0 0 2px var(--accent)' : 'none', color: 'var(--ink)', transition: 'box-shadow 0.15s ease' }}>
                  <span aria-hidden style={{ flexShrink: 0, width: '22px', height: '22px', borderRadius: '9999px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: on ? 'var(--accent)' : 'transparent', boxShadow: on ? 'none' : 'inset 0 0 0 1.5px var(--outline)', color: 'var(--on-accent)' }}>
                    {on && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', lineHeight: '22px', fontWeight: 700 }}>
                      {o.title}
                      {o.badge && <span style={{ height: '22px', padding: '0 8px', borderRadius: '9999px', display: 'inline-flex', alignItems: 'center', fontSize: '11px', fontWeight: 700, letterSpacing: '0.4px', background: 'var(--good-bg)', color: 'var(--success)' }}>{o.badge}</span>}
                    </span>
                    <span style={{ display: 'block', fontSize: '13px', lineHeight: '18px', color: 'var(--ink-muted)' }}>{o.note}</span>
                  </span>
                  <span style={{ flexShrink: 0, textAlign: 'right' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800 }}>{o.price}</span>
                    <span style={{ fontSize: '13px', color: 'var(--ink-faint)' }}>{o.per}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* What PRO unlocks */}
      <section>
        <h2 style={caps}>{isPro ? 'Included in your plan' : 'What PRO unlocks'}</h2>
        <div style={{ background: 'var(--surface)', borderRadius: '24px', overflow: 'hidden' }}>
          {UNLOCKS.map(({ Icon, label, hint, color }, i) => (
            <div key={label} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '14px', minHeight: '56px', padding: '0 16px' }}>
              {i > 0 && <span aria-hidden style={{ position: 'absolute', top: 0, left: '66px', right: '16px', height: '1px', background: 'var(--hairline)' }} />}
              <span aria-hidden style={{ width: '36px', height: '36px', borderRadius: '9999px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
                <Icon size={18} />
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: '16px', lineHeight: '24px', fontWeight: 500, color: 'var(--ink)' }}>{label}</span>
              {hint && <span style={{ fontSize: '14px', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{hint}</span>}
              <Check size={18} style={{ flexShrink: 0, color: 'var(--success)' }} />
            </div>
          ))}
        </div>
        <p style={{ margin: '10px 16px 0', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', lineHeight: '16px', color: 'var(--ink-faint)' }}>
          <ShieldCheck size={14} style={{ flexShrink: 0 }} /> On every plan your files stay on your device.
        </p>
      </section>

      {/* Action */}
      {isPro ? (
        <div style={{ background: 'var(--surface)', borderRadius: '24px', overflow: 'hidden' }}>
          <button type="button" onClick={() => setShowCancel(true)}
            style={{ width: '100%', minHeight: '56px', padding: '0 16px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--danger)', fontSize: '16px', fontWeight: 600, textAlign: 'left' }}>
            Cancel plan
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button type="button" className="btn-primary" onClick={handleUpgrade} style={{ width: '100%' }}>
            Get PRO · {selected.price}{selected.per}
          </button>
          <p style={{ margin: 0, textAlign: 'center', fontSize: '12px', lineHeight: '18px', color: 'var(--ink-faint)' }}>
            Payment opens Razorpay. Renews automatically until you cancel.
          </p>
        </div>
      )}

      {/* Activate after paying */}
      <Sheet open={!!pendingPlan} onClose={() => { setPendingPlan(null); setPaymentId(''); }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '20px', lineHeight: '28px', fontWeight: 700, color: 'var(--ink)' }}>Activate PRO</h3>
          <p style={{ margin: '4px 0 0', fontSize: '14px', lineHeight: '20px', color: 'var(--ink-muted)' }}>Finish paying on Razorpay, then enter the payment ID it shows you.</p>
        </div>
        <input type="text" value={paymentId} onChange={e => setPaymentId(e.target.value)} placeholder="Payment ID, e.g. pay_AbCd1234" aria-label="Razorpay payment ID"
          style={{ width: '100%', height: '52px', padding: '0 16px', borderRadius: '14px', border: 'none', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: '16px', boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" className="btn-secondary" onClick={() => { setPendingPlan(null); setPaymentId(''); }} style={{ flex: 1 }}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handleVerifyPayment} disabled={!paymentId.trim()} style={{ flex: 1 }}>Activate</button>
        </div>
      </Sheet>

      {/* Cancel plan */}
      <Sheet open={showCancel} onClose={() => setShowCancel(false)}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <span aria-hidden style={{ width: '40px', height: '40px', borderRadius: '9999px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--danger-bg)', color: 'var(--danger)' }}><AlertCircle size={20} /></span>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '20px', lineHeight: '28px', fontWeight: 700, color: 'var(--ink)' }}>Cancel PRO?</h3>
            <p style={{ margin: '4px 0 0', fontSize: '14px', lineHeight: '20px', color: 'var(--ink-muted)' }}>PRO tools lock straight away and you go back to the free plan.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" className="btn-secondary" onClick={() => setShowCancel(false)} style={{ flex: 1 }}>Keep PRO</button>
          <button type="button" onClick={handleCancel} className="btn-secondary" style={{ flex: 1, background: 'var(--danger-bg)', color: 'var(--danger)' }}>Cancel plan</button>
        </div>
      </Sheet>
    </div>
  );
};

export default Subscription;
