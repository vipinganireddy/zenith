import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, PenLine, RefreshCw, ShieldCheck, FileText, Check, ScanLine, Layers, Sparkles } from 'lucide-react';
import { TOTAL_TOOLS } from '../../data/toolsData';

/* First screen of the installed app when nobody is signed in.

   A fanned stack of three tool cards in the app's chocolate brown (the
   icon's ring as the hero motif), then the promise, six chips and the two ways in. The cards are
   drawn with CSS, not images, so they theme and weigh nothing.
   Card art uses fixed shades around the accent brown #2B1A0E (document art,
   the exception DESIGN.md makes for brand marks); all text uses tokens. */

// Labels and chip icons use the app's one accent (chocolate brown; gold on Obsidian)
const ACCENT = 'var(--accent)';

/** Where a card sits in the fan (the motion wrapper) … */
const card: React.CSSProperties = {
  position: 'relative', height: '100%', aspectRatio: '3 / 4', borderRadius: '26px',
  boxShadow: '0 18px 40px rgba(43, 26, 14, 0.28)',
};
/** A full-size layer that centres one card in the fan. */
const slot = (top: string, z: number): React.CSSProperties => ({
  position: 'absolute', left: 0, right: 0, top, bottom: top === '0%' ? 0 : '4%', zIndex: z, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
});
/** … and the card's face, filling it. */
const face: React.CSSProperties = { position: 'absolute', inset: 0, borderRadius: '26px', overflow: 'hidden' };
const pill = (dark = true): React.CSSProperties => ({
  position: 'absolute', top: '14px', left: '14px', height: '30px', padding: '0 12px', borderRadius: '9999px',
  display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, letterSpacing: '0.1px',
  background: dark ? 'rgba(0,0,0,0.38)' : 'rgba(255,255,255,0.7)', color: dark ? '#FFFFFF' : '#2A1810',
  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
});

/** Left card: a document page being merged. */
const DocCard = () => (
  <div style={{ ...face, background: 'linear-gradient(160deg, #2B2724 0%, #151312 100%)' }}>
    <div style={{ position: 'absolute', left: '22%', right: '14%', top: '24%', bottom: '-8%', borderRadius: '10px', background: '#F4F1EC', transform: 'rotate(-4deg)', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
      <span style={{ height: '9px', width: '60%', borderRadius: '9999px', background: '#2A1810' }} />
      {[92, 80, 88, 70, 84, 60, 78].map((w, i) => <span key={i} style={{ height: '5px', width: `${w}%`, borderRadius: '9999px', background: 'rgba(42,24,16,0.22)' }} />)}
    </div>
    <span style={pill()}><FileText size={13} /> Merge</span>
  </div>
);

/** Right card: a signed page in warm light. */
const SignCard = () => (
  <div style={{ ...face, background: 'radial-gradient(120% 90% at 20% 15%, #E9CBB0 0%, #A97C5E 45%, #2B1A0E 100%)' }}>
    <svg viewBox="0 0 120 40" style={{ position: 'absolute', left: '18%', bottom: '22%', width: '64%' }} aria-hidden>
      <path d="M4 30 C 18 4, 26 36, 38 18 S 58 6, 62 24 S 84 34, 96 12 L 116 10" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
    </svg>
    <span style={{ position: 'absolute', left: '18%', right: '18%', bottom: '18%', height: '2px', background: 'rgba(255,255,255,0.6)' }} />
    <span style={{ ...pill(false), left: 'auto', right: '14px' }}><PenLine size={13} /> Sign</span>
  </div>
);

/** Centre card: the hero — the app icon's ring, glowing. */
const HeroCard = () => (
  <div style={{ ...face, background: 'radial-gradient(90% 70% at 30% 28%, #7A5440 0%, #2B1A0E 42%, #24150D 100%)' }}>
    <svg viewBox="0 0 200 260" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
      {[34, 54, 74, 94, 114].map((r, i) => <circle key={r} cx="70" cy="80" r={r} fill="none" stroke="#FFFFFF" strokeOpacity={0.09 - i * 0.012} strokeWidth="1.5" />)}
      <circle cx="70" cy="86" r="26" fill="none" stroke="#E9CBB0" strokeOpacity="0.9" strokeWidth="7" />
      <circle cx="70" cy="48" r="5.5" fill="#FFF4EC" />
    </svg>
    <span style={pill()}><ShieldCheck size={13} /> On this phone</span>
    <div style={{ position: 'absolute', left: '18px', right: '18px', bottom: '18px', color: '#FFFFFF' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', lineHeight: '21px', fontWeight: 800, letterSpacing: '-0.2px', whiteSpace: 'nowrap' }}>Compress<br />PDF</div>
      <div style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px', height: '26px', padding: '0 10px', borderRadius: '9999px', background: 'rgba(255,255,255,0.16)', fontSize: '12px', fontWeight: 600 }}>
        <Check size={13} strokeWidth={3} /> 4.2 MB → 680 KB
      </div>
    </div>
  </div>
);

const chips = [
  { Icon: PenLine, label: 'Edit & sign' },
  { Icon: RefreshCw, label: 'Convert' },
  { Icon: ShieldCheck, label: 'Private' },
  { Icon: ScanLine, label: 'Scan' },
  { Icon: Layers, label: 'Merge & split' },
  { Icon: Sparkles, label: 'AI tools' },
];

const Welcome = () => {
  const navigate = useNavigate();
  const { state } = useLocation(); // where the user was headed, kept for after sign-in
  const still = useReducedMotion();
  const spring = { type: 'spring' as const, damping: 18, stiffness: 140, mass: 0.9 };
  const fan = (x: string, rotate: number, delay: number) => still
    ? { initial: false as const, animate: { x, rotate, y: 0 } }
    : { initial: { x: '0%', rotate: 0, y: 24, opacity: 0 }, animate: { x, rotate, y: 0, opacity: 1 }, transition: { ...spring, delay } };
  const rise = (delay: number) => still ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] as const, delay } };

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--canvas)', display: 'flex', justifyContent: 'center', overflowX: 'hidden' }}>
      <div style={{ width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column',
        padding: 'calc(env(safe-area-inset-top) + 8px) 24px calc(env(safe-area-inset-bottom) + 12px)', boxSizing: 'border-box' }}>

        <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: '28px', lineHeight: '34px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.4px' }}>O-Zenith</div>

        {/* The fan */}
        <div aria-hidden style={{ position: 'relative', height: 'clamp(200px, 30dvh, 280px)', margin: '16px 0 20px' }}>
          <div style={slot('8%', 1)}><motion.div style={card} {...fan('-46%', -10, 0.12)}><DocCard /></motion.div></div>
          <div style={slot('8%', 1)}><motion.div style={card} {...fan('46%', 10, 0.12)}><SignCard /></motion.div></div>
          <div style={slot('0%', 2)}><motion.div style={{ ...card, boxShadow: '0 24px 48px rgba(43, 26, 14, 0.35)' }} {...fan('0%', 0, 0)}><HeroCard /></motion.div></div>
        </div>

        <motion.div {...rise(0.25)} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span style={{ fontSize: '12px', lineHeight: '16px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: ACCENT }}>Private by design</span>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 7.2vw, 32px)', lineHeight: 1.12, fontWeight: 800, letterSpacing: '-0.6px', color: 'var(--ink)' }}>
            Every PDF tool.<br />Zero uploads.
          </h1>
          <p style={{ margin: 0, fontSize: '15px', lineHeight: '22px', color: 'var(--ink-muted)' }}>
            Edit, convert, sign and scan with {TOTAL_TOOLS} tools that run right on your phone.
          </p>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
            {chips.map(({ Icon, label }) => (
              <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 12px', borderRadius: '9999px', background: 'var(--surface-high)', color: 'var(--ink)', fontSize: '13px', fontWeight: 600 }}>
                <Icon size={15} style={{ color: ACCENT }} /> {label}
              </span>
            ))}
          </div>
        </motion.div>

        <div style={{ flex: 1, minHeight: '20px' }} />

        <motion.div {...rise(0.4)} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button type="button" className="btn-primary" onClick={() => navigate('/login', { state })} style={{ width: '100%' }}>
            Sign in <ArrowRight size={18} />
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/register', { state })} style={{ width: '100%' }}>
            Create an account
          </button>
          <p style={{ margin: '4px 0 0', textAlign: 'center', fontSize: '12px', lineHeight: '18px', color: 'var(--ink-muted)' }}>
            By continuing you agree to our<br /><Link to="/legal/terms" style={{ color: 'var(--ink)', fontWeight: 600 }}>Terms of Service</Link> and <Link to="/legal/privacy" style={{ color: 'var(--ink)', fontWeight: 600 }}>Privacy Policy</Link>.
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Welcome;
