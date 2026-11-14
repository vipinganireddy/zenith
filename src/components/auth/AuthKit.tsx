import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, ArrowLeft, Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import './AuthMonochrome.css';

/**
 * Streamlined Spatial Double-Bezel Glass Card:
 * Outer precision glass shell with 3D perspective tilt physics & cursor-tracked specular glow.
 * Inner core glass card with silky sliding mode switcher, height morphing, and fluid typography cross-fades.
 */
export const AuthScreen = ({
  mode,
  onSwitchMode,
  bar,
  title,
  subtitle,
  onBack,
  footer,
  children,
}: {
  mode?: 'login' | 'register';
  onSwitchMode?: (newMode: 'login' | 'register') => void;
  bar?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  onBack?: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) => {
  const outerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!outerRef.current) return;
    const rect = outerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    outerRef.current.style.setProperty('--card-mouse-x', `${x.toFixed(1)}px`);
    outerRef.current.style.setProperty('--card-mouse-y', `${y.toFixed(1)}px`);
    outerRef.current.style.setProperty('--mouse-x', `${x.toFixed(1)}px`);
    outerRef.current.style.setProperty('--mouse-y', `${y.toFixed(1)}px`);
  };

  const handleMouseLeave = () => {
    if (!outerRef.current) return;
    outerRef.current.style.setProperty('--card-mouse-x', '-999px');
    outerRef.current.style.setProperty('--card-mouse-y', '-999px');
    outerRef.current.style.setProperty('--mouse-x', '-999px');
    outerRef.current.style.setProperty('--mouse-y', '-999px');
  };

  // Dynamic Content Resolution
  const resolvedTitle = title ?? (
    mode === 'register' ? (
      <>Create your <span className="font-semibold text-white tracking-[-0.025em]">account.</span></>
    ) : (
      <>Welcome <span className="font-semibold text-white tracking-[-0.025em]">back.</span></>
    )
  );
  const resolvedSubtitle = subtitle ?? (
    mode === 'register'
      ? 'Access 95+ browser-native tools with zero uploads.'
      : 'Sign in to open your private workspace.'
  );

  return (
    <div
      ref={outerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="glass-auth-outer-bezel"
    >
      {/* Outer specular glow border tracking mouse */}
      <div className="glass-outer-glow-border" aria-hidden="true" />

      {/* Core inner glass card */}
      <div className="glass-auth-card">
        {/* Tactile micro-grain overlay */}
        <div className="glass-grain-overlay" aria-hidden="true" />

        {/* Specular interactive surface and border glow */}
        <div className="glass-card-glow-surface" aria-hidden="true" />
        <div className="glass-card-glow-border" aria-hidden="true" />

        <div className="glass-card-inner">
          {/* Top Segmented Glass Pill Switcher: Silky-smooth sliding active pill */}
          {mode ? (
            <div className="glass-segmented-toggle" role="tablist" aria-label="Account Access Mode">
              <Link
                to="/register"
                replace
                role="tab"
                aria-selected={mode === 'register'}
                onClick={(e) => {
                  if (onSwitchMode) {
                    e.preventDefault();
                    onSwitchMode('register');
                  }
                }}
                className={`glass-segmented-tab ${mode === 'register' ? 'is-active' : ''}`}
              >
                {mode === 'register' && (
                  <motion.div
                    layoutId="segmented-active-pill"
                    className="glass-segmented-active-pill"
                    transition={{ type: 'spring', stiffness: 450, damping: 35, mass: 0.8 }}
                  />
                )}
                <span className="glass-segmented-tab-text">Create Account</span>
              </Link>
              <Link
                to="/login"
                replace
                role="tab"
                aria-selected={mode === 'login'}
                onClick={(e) => {
                  if (onSwitchMode) {
                    e.preventDefault();
                    onSwitchMode('login');
                  }
                }}
                className={`glass-segmented-tab ${mode === 'login' ? 'is-active' : ''}`}
              >
                {mode === 'login' && (
                  <motion.div
                    layoutId="segmented-active-pill"
                    className="glass-segmented-active-pill"
                    transition={{ type: 'spring', stiffness: 450, damping: 35, mass: 0.8 }}
                  />
                )}
                <span className="glass-segmented-tab-text">Sign In</span>
              </Link>
            </div>
          ) : (
            /* Eyebrow row with back button when in sub-screens (e.g. OTP or Reset Password) */
            <div className="glass-eyebrow-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    aria-label="Back"
                    className="glass-back-btn"
                  >
                    <ArrowLeft size={14} />
                  </button>
                )}
                {bar && (
                  <div className="glass-status-pill">
                    <span className="mono-status-dot" aria-hidden="true" />
                    <span className="glass-eyebrow">{bar}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Heading with smooth Cross-Fade Micro-Interactions */}
          <div style={{ position: 'relative', minHeight: '52px', marginBottom: '14px' }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.header
                key={mode ? mode : (typeof title === 'string' ? title : 'auth-header')}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
              >
                <h1 className="glass-heading glass-heading-gradient">{resolvedTitle}</h1>
                {resolvedSubtitle && <p className="glass-subtitle">{resolvedSubtitle}</p>}
              </motion.header>
            </AnimatePresence>
          </div>

          {/* Card Form Body */}
          {children}

          {/* Footer Switch Link */}
          {footer && (
            <div style={{ marginTop: '14px' }}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Backward compatibility alias for AuthBentoStrip
 */
export const AuthBentoStrip = () => null;

/**
 * Glass Input Fields:
 * Label with focus shift animation.
 * Input with bottom specular laser beam that expands horizontally on focus.
 */
export const AuthField = ({
  label,
  invalid,
  trailing,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  invalid?: boolean;
  trailing?: ReactNode;
}) => {
  return (
    <div className="glass-field-group">
      {label && <label className="glass-field-label">{label}</label>}
      <div className="glass-input-container" data-invalid={invalid ? 'true' : 'false'}>
        <input
          {...input}
          className="glass-input-element"
          aria-label={input['aria-label'] ?? label}
          aria-invalid={invalid || undefined}
        />
        {trailing && (
          <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            {trailing}
          </span>
        )}
        <span className="glass-input-beam" aria-hidden="true" />
      </div>
    </div>
  );
};

/**
 * Eye toggle button:
 * text-white/40 hover:text-white/85 transition-colors
 */
export const EyeToggle = ({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    aria-label={shown ? 'Hide password' : 'Show password'}
    aria-pressed={shown}
    onClick={onToggle}
    className="glass-eye-toggle"
  >
    {shown ? <EyeOff size={15} /> : <Eye size={15} />}
  </button>
);

/**
 * Custom monochrome checkbox for "Keep me signed in":
 * sleek 15px rounded-md glass box
 */
export const Tick = ({ on }: { on: boolean }) => (
  <span
    aria-hidden="true"
    className="glass-checkbox-box"
    data-checked={on ? 'true' : 'false'}
  >
    {on && <Check size={10} strokeWidth={3} />}
  </span>
);

/**
 * Hairline Divider:
 * Ultra-thin horizontal hairline gradients
 */
export const OrDivider = () => (
  <div aria-hidden="true" className="glass-divider">
    <span className="glass-divider-line" />
    <span className="glass-divider-text">OR</span>
    <span className="glass-divider-line" />
  </div>
);

/**
 * High-craft monochrome Google 'G' Mark
 */
export const GoogleMark = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path d="M12 23c2.97 0 5.46-.98 7gi.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
);

/**
 * Footer switch link
 */
export const SwitchLink = ({
  prompt,
  to,
  label,
  onSwitch,
}: {
  prompt: string;
  to: string;
  label: string;
  onSwitch?: () => void;
}) => (
  <p className="glass-switch-text">
    {prompt}{' '}
    <Link
      to={to}
      replace
      onClick={(e: React.MouseEvent) => {
        if (onSwitch) {
          e.preventDefault();
          onSwitch();
        }
      }}
      className="glass-switch-action"
    >
      {label}
    </Link>
  </p>
);

/**
 * Error Banner in glassmorphic styling
 */
export const AuthError = ({ text }: { text: string }) => (
  <div role="alert" className="glass-error-banner">
    <AlertCircle size={14} style={{ flexShrink: 0 }} />
    <span>{text}</span>
  </div>
);

/**
 * Legal terms notice in monochrome
 */
export const LegalLine = () => (
  <p style={{ margin: '2px 0 0', textAlign: 'center', fontSize: '11px', lineHeight: '15px', color: 'rgba(255, 255, 255, 0.40)' }}>
    By continuing you agree to our{' '}
    <Link to="/legal/terms" style={{ color: '#ffffff', textDecoration: 'underline', textUnderlineOffset: '3px' }}>Terms</Link> and{' '}
    <Link to="/legal/privacy" style={{ color: '#ffffff', textDecoration: 'underline', textUnderlineOffset: '3px' }}>Privacy Policy</Link>.
  </p>
);

/** Compatibility components for any legacy usages */
export const AuthSwitch = ({ current }: { current: 'login' | 'register' }) => (
  <div style={{ display: 'flex', gap: '8px', padding: '4px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
    <Link
      to="/login"
      replace
      style={{
        flex: 1,
        textAlign: 'center',
        padding: '8px',
        fontSize: '13px',
        fontWeight: 500,
        borderRadius: '8px',
        textDecoration: 'none',
        background: current === 'login' ? '#ffffff' : 'transparent',
        color: current === 'login' ? '#000000' : 'rgba(255, 255, 255, 0.6)',
      }}
    >
      Sign in
    </Link>
    <Link
      to="/register"
      replace
      style={{
        flex: 1,
        textAlign: 'center',
        padding: '8px',
        fontSize: '13px',
        fontWeight: 500,
        borderRadius: '8px',
        textDecoration: 'none',
        background: current === 'register' ? '#ffffff' : 'transparent',
        color: current === 'register' ? '#000000' : 'rgba(255, 255, 255, 0.6)',
      }}
    >
      Create account
    </Link>
  </div>
);

export const AuthGroup = ({ children }: { children: ReactNode; invalid?: boolean }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>{children}</div>
);

export const AuthRow = ({
  icon: Icon,
  children,
  trailing,
}: {
  icon: React.ElementType;
  first?: boolean;
  invalid?: boolean;
  children: ReactNode;
  trailing?: ReactNode;
}) => (
  <div className="glass-input-container">
    <span style={{ paddingLeft: '14px', display: 'flex', color: 'rgba(255, 255, 255, 0.4)' }}>
      <Icon size={16} />
    </span>
    {children}
    {trailing}
  </div>
);

export const AuthFooter = () => (
  <footer style={{ marginTop: 'auto', paddingTop: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', textAlign: 'center' }}>
    <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)' }}>
      <ShieldCheck size={13} /> Your files stay on this device.
    </p>
    <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255, 255, 255, 0.3)' }}>
      <Link to="/legal/terms" style={{ color: 'inherit' }}>Terms</Link> · <Link to="/legal/privacy" style={{ color: 'inherit' }}>Privacy</Link>
    </p>
  </footer>
);
