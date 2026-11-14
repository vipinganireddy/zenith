import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Loader2 } from 'lucide-react';
import { AuthScreen, AuthField, AuthError, EyeToggle } from '../../components/auth/AuthKit';
import { useAuth } from '../../context/AuthContext';
import OTPInput from '../../components/ui/OTPInput';

type Phase = 'email' | 'otp' | 'reset' | 'done';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const { forgotPassword, resetPassword } = useAuth();
  const [phase, setPhase] = useState<Phase>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [demoOTP, setDemoOTP] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendReset = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !/\S+@\S+\.\S+/.test(email)) { setError('Enter a valid email address.'); return; }
    setLoading(true);
    try {
      const code = await forgotPassword(email);
      setDemoOTP(code);
      setPhase('otp');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset code.');
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (otp.replace(/\D/g,'').length < 6) { setError('Enter all 6 digits.'); return; }
    setPhase('reset');
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPw.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await resetPassword(email, otp, newPw);
      setPhase('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reset failed.');
      setPhase('otp'); // go back to OTP entry
    } finally { setLoading(false); }
  };

  const spinner = <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />;
  const keyframes = <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>;
  const formStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '16px' };

  if (phase === 'email') return (
    <AuthScreen
      bar="RESET PASSWORD"
      title="Reset password."
      subtitle="Enter your email and we'll send you a code."
      onBack={() => navigate('/login', { replace: true })}
    >
      <form onSubmit={handleSendReset} noValidate style={formStyle}>
        {error && <AuthError text={error} />}
        <AuthField
          label="Email address"
          type="email"
          inputMode="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setError(''); }}
          placeholder="you@example.com"
          aria-label="Email"
          invalid={!!error}
          autoComplete="email"
          autoCapitalize="none"
          enterKeyHint="send"
        />
        <button type="submit" disabled={loading} className="glass-primary-btn" style={{ marginTop: '4px' }}>
          {loading ? <>{spinner} <span>Sending…</span></> : 'Send code'}
        </button>
      </form>
      {keyframes}
    </AuthScreen>
  );

  if (phase === 'otp') return (
    <AuthScreen
      bar="RESET PASSWORD"
      title="Check your email."
      subtitle={<>Enter the 6-digit code sent to <strong style={{ color: '#ffffff' }}>{email}</strong></>}
      onBack={() => { setPhase('email'); setOtp(''); setError(''); }}
    >
      <form onSubmit={handleVerifyOtp} style={{ ...formStyle, gap: '18px' }}>
        {error && <AuthError text={error} />}
        {demoOTP && (
          <p style={{ margin: 0, textAlign: 'center', fontSize: '13px', color: 'rgba(255, 255, 255, 0.50)' }}>
            Demo code <strong style={{ marginLeft: '6px', fontSize: '15px', letterSpacing: '0.15em', color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>{demoOTP}</strong>
          </p>
        )}
        <OTPInput value={otp} onChange={setOtp} />
        <button type="submit" disabled={otp.replace(/\D/g, '').length < 6} className="glass-primary-btn">
          Continue
        </button>
      </form>
    </AuthScreen>
  );

  if (phase === 'reset') return (
    <AuthScreen
      bar="RESET PASSWORD"
      title="New password."
      subtitle="At least 8 characters."
      onBack={() => setPhase('otp')}
    >
      <form onSubmit={handleReset} noValidate style={formStyle}>
        {error && <AuthError text={error} />}
        <AuthField
          label="New password"
          type={showPw ? 'text' : 'password'}
          value={newPw}
          onChange={e => { setNewPw(e.target.value); setError(''); }}
          placeholder="New password"
          aria-label="New password"
          autoComplete="new-password"
          enterKeyHint="next"
          trailing={<EyeToggle shown={showPw} onToggle={() => setShowPw(v => !v)} />}
        />
        <AuthField
          label="Repeat password"
          type={showPw ? 'text' : 'password'}
          value={confirmPw}
          onChange={e => { setConfirmPw(e.target.value); setError(''); }}
          placeholder="Repeat password"
          aria-label="Repeat password"
          autoComplete="new-password"
          enterKeyHint="done"
        />
        {confirmPw && newPw === confirmPw && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.85)' }}>
            <CheckCircle size={13} /> Passwords match
          </span>
        )}
        <button type="submit" disabled={loading} className="glass-primary-btn" style={{ marginTop: '4px' }}>
          {loading ? <>{spinner} <span>Saving…</span></> : 'Save password'}
        </button>
      </form>
      {keyframes}
    </AuthScreen>
  );

  return (
    <AuthScreen
      bar="RESET PASSWORD"
      title="Password updated."
      subtitle="Sign in with your new password."
      onBack={() => navigate('/login', { replace: true })}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '12px 0 8px' }}>
        <span aria-hidden style={{ width: '64px', height: '64px', borderRadius: '9999px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.16)', color: '#ffffff' }}>
          <CheckCircle size={30} />
        </span>
      </div>
      <button type="button" onClick={() => navigate('/login', { replace: true })} className="glass-primary-btn">
        Sign in
      </button>
    </AuthScreen>
  );
};

export default ForgotPassword;
