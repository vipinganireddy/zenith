import { isNativeApp } from '../../utils/pwa';
import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ArrowRight } from 'lucide-react';
import {
  AuthScreen,
  AuthField,
  EyeToggle,
  AuthError,
  GoogleMark,
  OrDivider,
  SwitchLink,
  Tick,
  LegalLine,
} from '../../components/auth/AuthKit';
import { isAppMode } from '../../utils/appMode';
import { useAuth } from '../../context/AuthContext';
import {
  saveDriveToken,
  saveGDState,
  startGoogleOAuth,
  verifyGoogleCallback,
  hasGoogleCallback,
} from '../../utils/googleDrive';
import OTPInput from '../../components/ui/OTPInput';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export default function AuthUnified() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, verifyEmailOTP, loginWithGoogle } = useAuth();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';

  // Mode derived from URL pathname
  const isRegister = location.pathname === '/register';
  const mode: 'login' | 'register' = isRegister ? 'register' : 'login';

  // Registration verification phase
  const [phase, setPhase] = useState<'form' | 'verify'>('form');

  // Shared form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  // Login-specific state
  const appMode = isAppMode();
  const [remember, setRemember] = useState(true);

  // OTP-specific state
  const [otp, setOtp] = useState('');
  const [demoOTP, setDemoOTP] = useState('');

  // Status & error states
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [pwErr, setPwErr] = useState('');

  const resetErrors = () => {
    setError('');
    setNameErr('');
    setEmailErr('');
    setPwErr('');
  };

  // Adjust state during render when route changes (standard React pattern)
  const [prevPath, setPrevPath] = useState(location.pathname);
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname);
    setError('');
    setNameErr('');
    setEmailErr('');
    setPwErr('');
    if (location.pathname === '/login') {
      setPhase('form');
    }
  }

  // Smooth switch mode handler that preserves form state and avoids page reloading
  const handleSwitchMode = (newMode: 'login' | 'register') => {
    if (newMode === mode && phase === 'form') return;
    resetErrors();
    setPhase('form');
    navigate(newMode === 'register' ? '/register' : '/login', { replace: true });
  };

  // Google OAuth callback handling
  useEffect(() => {
    if (!hasGoogleCallback()) return;
    const hash = window.location.hash;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setGoogleLoading(true);
    verifyGoogleCallback(hash)
      .then(async ({ user, accessToken, expiresIn }) => {
        await loginWithGoogle(user);
        if (accessToken) {
          saveDriveToken(accessToken, user.email, expiresIn);
          saveGDState({ linked: true, email: user.email, connectedAt: new Date().toISOString() });
        }
        navigate('/dashboard', { replace: true });
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Google sign-in failed.');
        setGoogleLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogleAuth = useCallback(() => {
    if (!GOOGLE_CLIENT_ID) {
      setError(
        mode === 'register'
          ? 'Google sign-up isn’t set up yet. Use your email instead.'
          : 'Google Sign-In is not configured yet. Add VITE_GOOGLE_CLIENT_ID to .env.local'
      );
      return;
    }
    startGoogleOAuth(mode === 'register' ? '/register' : '/login');
  }, [mode]);

  // Email login submit
  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault();
    resetErrors();
    let valid = true;
    if (!email) {
      setEmailErr('Email is required.');
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailErr('Enter a valid email.');
      valid = false;
    }
    if (!password) {
      setPwErr('Password is required.');
      valid = false;
    }
    if (!valid) return;

    setLoading(true);
    try {
      await login(email, password, appMode || remember);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  // Email register submit
  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    resetErrors();
    let ok = true;
    if (!name.trim()) {
      setNameErr('Full name is required.');
      ok = false;
    }
    if (!email) {
      setEmailErr('Email is required.');
      ok = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailErr('Enter a valid email.');
      ok = false;
    }
    if (!password) {
      setPwErr('Password is required.');
      ok = false;
    } else if (password.length < 8) {
      setPwErr('Password must be at least 8 characters.');
      ok = false;
    }
    if (!ok) return;

    setLoading(true);
    try {
      const code = await register(name.trim(), email, password);
      setDemoOTP(code as unknown as string);
      setPhase('verify');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  // OTP verify submit
  const handleVerifyOTP = async (e: FormEvent) => {
    e.preventDefault();
    resetErrors();
    if (otp.replace(/\D/g, '').length < 6) {
      setError('Enter all 6 digits.');
      return;
    }
    setLoading(true);
    try {
      await verifyEmailOTP(email, otp);
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const fieldErr = nameErr || emailErr || pwErr;
  const spinner = <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />;

  // ── Registration OTP Verification Phase ──
  if (mode === 'register' && phase === 'verify') {
    return (
      <AuthScreen
        bar="VERIFY EMAIL"
        title="Check your email."
        subtitle={
          <>
            Enter the 6-digit code sent to <strong style={{ color: '#ffffff' }}>{email}</strong>
          </>
        }
        onBack={() => {
          setPhase('form');
          setOtp('');
          setError('');
        }}
      >
        <form onSubmit={handleVerifyOTP} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error && <AuthError text={error} />}
          {demoOTP && (
            <p style={{ margin: 0, textAlign: 'center', fontSize: '13px', color: 'rgba(255, 255, 255, 0.50)' }}>
              Demo code{' '}
              <strong
                style={{
                  marginLeft: '6px',
                  fontSize: '15px',
                  letterSpacing: '0.15em',
                  color: '#ffffff',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {demoOTP}
              </strong>
            </p>
          )}
          <OTPInput value={otp} onChange={setOtp} />
          <button
            type="submit"
            disabled={loading || otp.replace(/\D/g, '').length < 6}
            className="glass-primary-btn"
          >
            {loading ? (
              <>
                {spinner} <span>Verifying…</span>
              </>
            ) : (
              'Verify'
            )}
          </button>
        </form>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </AuthScreen>
    );
  }

  // ── Main Auth Screen (Login & Register with Spring Height & Layout Morphing) ──
  return (
        <AuthScreen
          mode={mode}
          onSwitchMode={handleSwitchMode}
      footer={
        <div style={{ textAlign: 'center' }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{ duration: 0.18 }}
            >
              {mode === 'register' ? (
                <SwitchLink
                  prompt="Already have an account?"
                  to="/login"
                  label="Sign in"
                  onSwitch={() => handleSwitchMode('login')}
                />
              ) : (
                <SwitchLink
                  prompt="New to O-ZENITH?"
                  to="/register"
                  label="Create account"
                  onSwitch={() => handleSwitchMode('register')}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      }
    >
      <form
        onSubmit={mode === 'register' ? handleRegister : handleEmailLogin}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: '11px', width: '100%', minWidth: 0 }}
      >
        {(error || fieldErr) && <AuthError text={error || fieldErr} />}

        {/* Dynamic Content Morphing: Full Name Field (smooth spring expand / collapse) */}
        <AnimatePresence initial={false}>
          {mode === 'register' && (
            <motion.div
              key="field-name"
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              transition={{
                height: { type: 'spring', stiffness: 360, damping: 30, mass: 0.8 },
                opacity: { duration: 0.2 },
                y: { duration: 0.22 },
              }}
              style={{ overflow: 'hidden' }}
            >
              <AuthField
                label="Full name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  resetErrors();
                }}
                placeholder="Your name"
                invalid={!!nameErr}
                autoComplete="name"
                autoCapitalize="words"
                enterKeyHint="next"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Shared Email Address Field (Persistent Value Across Modes) */}
        <AuthField
          label="Email address"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            resetErrors();
          }}
          placeholder="you@example.com"
          invalid={!!emailErr}
          autoComplete="email"
          autoCapitalize="none"
          enterKeyHint="next"
        />

        {/* Password Field & Mode-Specific Utilities */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <AuthField
            label="Password"
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              resetErrors();
            }}
            placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
            invalid={!!pwErr}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            enterKeyHint="go"
            trailing={<EyeToggle shown={showPw} onToggle={() => setShowPw((v) => !v)} />}
          />

          {/* Dynamic Content Morphing: Keep Me Signed In & Forgot Password (Sign-In Mode Only) */}
          <AnimatePresence initial={false}>
            {mode === 'login' && (
              <motion.div
                key="login-options"
                initial={{ opacity: 0, height: 0, y: -4 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -4 }}
                transition={{
                  height: { type: 'spring', stiffness: 360, damping: 30, mass: 0.8 },
                  opacity: { duration: 0.2 },
                }}
                style={{ overflow: 'hidden' }}
              >
                <div
                  className="glass-utility-row"
                  style={{ justifyContent: appMode ? 'flex-end' : 'space-between', paddingTop: '2px' }}
                >
                  {!appMode && (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={remember}
                      onClick={() => setRemember((v) => !v)}
                      className="glass-checkbox-trigger"
                    >
                      <Tick on={remember} />
                      <span>Keep me signed in</span>
                    </button>
                  )}
                  <Link to="/forgot-password" className="glass-forgot-link">
                    Forgot password?
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Primary CTA Button with Micro-Interaction Cross-Fade */}
        <button
          type="submit"
          disabled={loading}
          className="glass-primary-btn group"
          style={{ marginTop: '2px' }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {loading ? (
              <motion.span
                key="submitting-spinner"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                {spinner}
                <span>{mode === 'register' ? 'Creating account…' : 'Signing in…'}</span>
              </motion.span>
            ) : (
              <motion.span
                key={mode}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <span>{mode === 'register' ? 'Create account' : 'Sign in'}</span>
                <ArrowRight size={15} className="glass-arrow-icon" />
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Google OAuth Button with Micro-Interaction Cross-Fade */}
        {!isNativeApp() && (
          <>
            <OrDivider />
            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={googleLoading}
              className="glass-secondary-btn"
            >
              <AnimatePresence mode="wait" initial={false}>
                {googleLoading ? (
                  <motion.span
                    key="google-loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                  >
                    {spinner}
                    <span>Signing in…</span>
                  </motion.span>
                ) : (
                  <motion.span
                    key={mode}
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                  >
                    <GoogleMark />
                    <span>{mode === 'register' ? 'Sign up with Google' : 'Continue with Google'}</span>
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </>
        )}

        {/* Dynamic Legal Line in Register Mode (smooth spring expand / collapse) */}
        <AnimatePresence initial={false}>
          {mode === 'register' && (
            <motion.div
              key="legal-section"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{
                height: { type: 'spring', stiffness: 360, damping: 30, mass: 0.8 },
                opacity: { duration: 0.2 },
              }}
              style={{ overflow: 'hidden' }}
            >
              <LegalLine />
            </motion.div>
          )}
        </AnimatePresence>
      </form>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </AuthScreen>
  );
}
