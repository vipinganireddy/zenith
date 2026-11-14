import { motion } from 'framer-motion';
import { InstallAppCard } from '../../components/pwa/InstallApp';
import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSubscription, FREE_CATEGORIES, FREE_USES_LIMIT } from '../../context/SubscriptionContext';
import { useToast } from '../../hooks/useToast';
import { saveDriveToken, verifyGoogleCallback, hasGoogleCallback, connectGoogleDrive, getDriveToken, fetchDriveQuota, APP_DRIVE_FOLDER, type DriveQuota } from '../../utils/googleDrive';
import { getApiKey, setApiKey, type Provider } from '../../utils/apiKeys';
import { useIsMobile } from '../../hooks/useIsMobile';
import { toolCountByCategory, categories, categoryName, TOTAL_TOOLS } from '../../data/toolsData';
import { getActiveProvider } from '../../utils/aiService';
import { detectProvider, identifyKey, maskKey, PROVIDER_LABEL, AMBIGUOUS } from '../../utils/keyDetect';
import { isNativeApp } from '../../utils/pwa';
import Ring from '../../components/ui/Ring';
import type { SyncStatus } from '../../utils/accountSync';
import { useTheme } from '../../hooks/useTheme';
import {
  User, Settings, Shield, CreditCard, HardDrive,
  Camera, CheckCircle, Eye, EyeOff, AlertCircle, Loader2, Check,
  Heart, Crown, Zap, CloudUpload,
  Smartphone, ChevronRight, LogOut, Palette, Mail, Lock, Trash2,
  LifeBuoy, Scale, Bug, ChevronDown, Cloud, Sparkles, Ban, FileText,
} from 'lucide-react';

// ── Google Drive localStorage helpers ─────────────────────────────────────────
const GD_KEY = 'zenith_google_drive';
interface GDState { linked: boolean; email: string; connectedAt: string; }
const getGD = (): GDState => {
  try { return JSON.parse(localStorage.getItem(GD_KEY) || 'null') || { linked: false, email: '', connectedAt: '' }; }
  catch { return { linked: false, email: '', connectedAt: '' }; }
};
/** A stored JSON value (untyped, like JSON.parse), or the fallback when it's missing or unreadable. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readJSON = (key: string, fallback: [] | null): any => {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; }
};
/** A one-time code from the browser's secure random source. */
const sixDigitCode = () => { const n = new Uint32Array(1); crypto.getRandomValues(n); return String(100000 + (n[0] % 900000)); };
const saveGD = (s: GDState) => localStorage.setItem(GD_KEY, JSON.stringify(s));

type Tab = 'personal' | 'appearance' | 'settings' | 'security' | 'subscription' | 'storage' | 'support' | 'policies';

// One address for support, privacy and legal (docs/DECISIONS.md → Support contact)
const SUPPORT_EMAIL = 'shadowxbooster@gmail.com';

// ── API Provider definitions ────────────────────────────────────────────────
const API_PROVIDERS = [
  { id: 'openai',      label: 'OpenAI',              models: 'GPT-4o, GPT-4 Turbo, GPT-3.5',         placeholder: 'sk-...',      storageKey: 'zenith_openai_key',      color: '#10a37f', docsUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic',   label: 'Anthropic / Claude',  models: 'Claude 3.5 Sonnet, Claude 3 Opus',     placeholder: 'sk-ant-...',  storageKey: 'zenith_anthropic_key',   color: '#D97706', docsUrl: 'https://console.anthropic.com/keys' },
  { id: 'gemini',      label: 'Google Gemini',        models: 'Gemini 1.5 Pro, Gemini 1.5 Flash',     placeholder: 'AIza...',     storageKey: 'zenith_gemini_key',      color: '#1a73e8', docsUrl: 'https://makersuite.google.com/app/apikey' },
  { id: 'groq',        label: 'Groq',                 models: 'Llama 3, Mixtral 8x7B, Gemma',         placeholder: 'gsk_...',     storageKey: 'zenith_groq_key',        color: 'var(--cat-energy)', docsUrl: 'https://console.groq.com/keys' },
  { id: 'openrouter',  label: 'O-Zenith AI Gateway',  models: '100+ models (GPT, Claude, Llama…)',    placeholder: 'sk-or-...',   storageKey: 'zenith_openrouter_key',  color: '#6366f1', docsUrl: 'https://openrouter.ai/keys' },
  { id: 'deepseek',    label: 'DeepSeek',             models: 'DeepSeek Chat, DeepSeek Coder',         placeholder: 'sk-...',      storageKey: 'zenith_deepseek_key',    color: '#0ea5e9', docsUrl: 'https://platform.deepseek.com' },
];

const Profile = () => {
  const { user, logout, updateProfile } = useAuth();
  const { isPro, isYearly, isMonthly, daysLeft, freeUsesLeft, subscription, } = useSubscription();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile(768);
  const [theme, setTheme] = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (tabParam === 'api-keys') return 'settings';
    return 'personal';
  });
  // On mobile the tabs become a master→detail drill-down: the category list is the
  // "master", and tapping one pushes its "detail" screen. The detail lives in the
  // URL (?section=…) so the app bar's back button, Android back and iOS swipe-back
  // all return to the list. Desktop shows both at once.
  const sectionParam = searchParams.get('section') as Tab | null;
  const mobileDetail = !!sectionParam || searchParams.get('tab') === 'api-keys';
  const openTab = (id: Tab) => { setActiveTab(id); navigate(`/dashboard/profile?section=${id}`); };
  useEffect(() => {
    // Follows the URL (back/forward), an external source.
    if (sectionParam) setActiveTab(sectionParam);
  }, [sectionParam]);

  // ── Account sync (API keys + plan, mirrored through the user's Drive) ──
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'idle' });

  // ── Drive storage quota (Storage tab is Drive-gated) ──
  const driveLinked = getGD().linked;
  const [driveQuota, setDriveQuota] = useState<DriveQuota | null>(null);
  const [quotaError, setQuotaError] = useState('');
  useEffect(() => {
    if (activeTab !== 'storage' || !driveLinked) return;
    const token = getDriveToken();
    // Async/external result — the no-token message is set here alongside the fetch outcome.
    if (!token) { setQuotaError('Drive session expired — reconnect to see your storage.'); return; }
    let cancelled = false;
    fetchDriveQuota(token.token)
      .then(q => { if (!cancelled) { setDriveQuota(q); setQuotaError(''); } })
      .catch(e => { if (!cancelled) setQuotaError(e instanceof Error ? e.message : 'Could not read Drive storage.'); });
    return () => { cancelled = true; };
  }, [activeTab, driveLinked]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    // Deep link from elsewhere in the app — follows the URL, an external source.
    if (tabParam === 'api-keys') setActiveTab('settings');
    // Integrations moved into the Files page — redirect any old links there,
    // preserving the OAuth callback hash so a returning connect flow completes.
    if (tabParam === 'connected' && !window.location.hash) navigate('/dashboard/files', { replace: true });
  }, [searchParams, navigate]);

  // ── Avatar ──
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => localStorage.getItem('zenith_avatar'));
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target?.result as string;
      localStorage.setItem('zenith_avatar', url);
      setAvatarUrl(url);
      // Notify all other components (sidebar, header) to update avatar
      window.dispatchEvent(new CustomEvent('zenith-avatar-updated', { detail: url }));
      showToast('Profile photo updated!');
    };
    reader.readAsDataURL(file);
  };

  // ── Personal Info ──
  const [name, setName] = useState(user?.name || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState('');

  // ── Email Change ──
  const [emailStep, setEmailStep] = useState<null | 'input' | 'verify'>(null);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [emailOtpInput, setEmailOtpInput] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailChangeError, setEmailChangeError] = useState('');

  const handleSendEmailCode = () => {
    const email = newEmailInput.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailChangeError('Enter a valid email address.'); return;
    }
    if (email === user?.email?.toLowerCase()) {
      setEmailChangeError('This is already your current email.'); return;
    }
    const users = readJSON('zenith_users', []);
    if (users.find((u: { email: string }) => u.email.toLowerCase() === email)) {
      setEmailChangeError('This email is already in use.'); return;
    }
    const code = sixDigitCode();
    setEmailCode(code);
    setEmailStep('verify');
    setEmailChangeError('');
    showToast(`Verification code sent! (Demo code: ${code})`);
  };

  const handleVerifyEmailCode = () => {
    if (emailOtpInput.trim() !== emailCode) {
      setEmailChangeError('Incorrect code. Try again.'); return;
    }
    const newEmail = newEmailInput.trim().toLowerCase();
    const users = readJSON('zenith_users', []);
    const idx = users.findIndex((u: { email: string }) => u.email.toLowerCase() === user?.email?.toLowerCase());
    if (idx >= 0) { users[idx].email = newEmail; localStorage.setItem('zenith_users', JSON.stringify(users)); }
    const session = readJSON('zenith_session', null);
    if (session) { session.email = newEmail; localStorage.setItem('zenith_session', JSON.stringify(session)); }
    setEmailStep(null); setEmailOtpInput(''); setEmailCode(''); setNewEmailInput('');
    showToast('✅ Email updated! Please log in again.');
    setTimeout(() => { logout(); navigate('/login', { replace: true }); }, 1200);
  };

  // ── Phone Change ──
  const [phoneStep, setPhoneStep] = useState<null | 'input' | 'verify'>(null);
  const [newPhoneDialCode, setNewPhoneDialCode] = useState('+91');
  const [newPhoneInput, setNewPhoneInput] = useState('');
  const [phoneOtpInput, setPhoneOtpInput] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneChangeError, setPhoneChangeError] = useState('');

  const handleSendPhoneCode = () => {
    const digits = newPhoneInput.replace(/\D/g, '');
    if (!digits || digits.length < 7) {
      setPhoneChangeError('Enter a valid phone number.'); return;
    }
    const full = `${newPhoneDialCode}${digits}`;
    const currentPhone = user?.phone?.replace(/\D/g, '') || '';
    if (digits === currentPhone || full.replace(/\D/g,'') === currentPhone) {
      setPhoneChangeError('This is already your current phone number.'); return;
    }
    const code = sixDigitCode();
    setPhoneCode(code);
    setPhoneStep('verify');
    setPhoneChangeError('');
    showToast(`OTP sent to ${full}  (Demo code: ${code})`);
  };

  const handleVerifyPhoneCode = () => {
    if (phoneOtpInput.trim() !== phoneCode) {
      setPhoneChangeError('Incorrect code. Try again.'); return;
    }
    const digits = newPhoneInput.replace(/\D/g, '');
    const full = `${newPhoneDialCode}${digits}`;
    // Update in users store
    const users = readJSON('zenith_users', []);
    const idx = users.findIndex((u: { email: string }) => u.email?.toLowerCase() === user?.email?.toLowerCase());
    if (idx >= 0) { users[idx].phone = full; localStorage.setItem('zenith_users', JSON.stringify(users)); }
    // Update session
    const session = readJSON('zenith_session', null);
    if (session) { session.phone = full; localStorage.setItem('zenith_session', JSON.stringify(session)); }
    // Update context
    updateProfile({ phone: full });
    setPhoneStep(null); setPhoneOtpInput(''); setPhoneCode(''); setNewPhoneInput('');
    showToast('✅ Phone number updated!');
  };

  // ── Security ──
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityMsg, setSecurityMsg] = useState('');
  const [securityError, setSecurityError] = useState('');

  // ── API Keys ──
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(() =>
    Object.fromEntries(API_PROVIDERS.map(p => [p.id, getApiKey(p.id as Provider)]))
  );
  const [newKey, setNewKey] = useState('');
  // For a plain sk- key: which of OpenAI / DeepSeek it's for (it's only checked with that one)
  const [keyFor, setKeyFor] = useState<Provider | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [addingKey, setAddingKey] = useState(false);
  const [keyError, setKeyError] = useState('');

  // ── Google Drive connection state (managed from the Files page; this page
  //    only lands the OAuth callback and reflects linked status where relevant) ──
  const [gd, setGd] = useState<GDState>(getGD);

  // ── Handle Google Drive OAuth callback ──
  useEffect(() => {
    if (!hasGoogleCallback()) return;
    const hash = window.location.hash;
    // Clean hash from URL regardless
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    verifyGoogleCallback(hash).then(({ user: g, accessToken, expiresIn }) => {
      if (!accessToken) throw new Error('Google didn’t grant Drive access.');
      saveDriveToken(accessToken, g.email, expiresIn);
      const next: GDState = { linked: true, email: g.email, connectedAt: new Date().toISOString() };
      saveGD(next); setGd(next);
      showToast('✅ Google Drive connected!');
      // Drive is now managed from the Files page — return the user there
      // (or wherever they started the connect flow from).
      const back = sessionStorage.getItem('gd_redirect_back');
      sessionStorage.removeItem('gd_redirect_back');
      navigate(back && back.startsWith('/') && !back.startsWith('//') ? back : '/dashboard/files', { replace: true });
    }).catch(e => {
      showToast(e instanceof Error ? e.message : 'Failed to connect Google Drive. Try again.');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'personal',     label: 'Personal info',  icon: User },
    { id: 'appearance',   label: 'Appearance',     icon: Palette },
    { id: 'settings',     label: 'API keys',       icon: Settings },
    { id: 'security',     label: 'Security',       icon: Shield },
    { id: 'subscription', label: 'Subscription',   icon: CreditCard },
    { id: 'storage',      label: 'Storage',        icon: HardDrive },
    { id: 'support',      label: 'Support',        icon: LifeBuoy },
    { id: 'policies',     label: 'Policies',       icon: Scale },
  ];

  const initials = user?.initials || user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'ZN';

  const handleSaveProfile = (e: FormEvent) => {
    e.preventDefault();
    setProfileError('');
    if (!name.trim()) { setProfileError('Name cannot be empty.'); return; }
    setSavingProfile(true);
    setTimeout(() => {
      updateProfile({ name: name.trim() });
      setSavingProfile(false); setProfileSaved(true);
      showToast('Profile updated!');
      setTimeout(() => setProfileSaved(false), 3000);
    }, 600);
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setSecurityError(''); setSecurityMsg('');
    if (newPw.length < 8) { setSecurityError('New password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setSecurityError('Passwords do not match.'); return; }
    if (!user?.email) { setSecurityError('No email on account.'); return; }
    setSecurityLoading(true);
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(currentPw));
      const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      const stored = readJSON('zenith_users', []);
      const me = stored.find((u: { email: string }) => u.email.toLowerCase() === user.email.toLowerCase());
      if (!me || me.passwordHash !== hash) { setSecurityError('Current password is incorrect.'); return; }
      const newBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(newPw));
      me.passwordHash = Array.from(new Uint8Array(newBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('zenith_users', JSON.stringify(stored));
      setSecurityMsg('Password updated successfully.');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      showToast('Password updated successfully!');
    } catch { setSecurityError('Failed to update password. Try again.'); }
    finally { setSecurityLoading(false); }
  };



  const connectedCount = API_PROVIDERS.filter(p => apiKeys[p.id]?.trim()).length;




  return (
    <div className="account-page-container max-w-6xl mx-auto px-6 sm:px-10 mt-4 mb-8 relative z-10 w-full" style={{ paddingBottom: '64px' }}>
      <div className={isMobile ? 'w-full' : 'account-layout-grid'}>

      {/* ── Phones: the Account root — a profile card, then grouped settings
          rows (one surface per group, tinted icon discs, value hints, theme
          chevrons) and sign-out on its own. Each row pushes its section. ── */}
      {isMobile && !mobileDetail && (() => {
        const groups: { title: string; rows: { id: Tab; hint?: string }[] }[] = [
          { title: 'Account', rows: [{ id: 'personal' }, { id: 'security' }] },
          { title: 'Preferences', rows: [
            { id: 'appearance', hint: theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light' },
            { id: 'settings', hint: isPro ? (connectedCount ? `${connectedCount} connected` : 'None') : 'PRO' },
          ] },
          { title: 'Plan & storage', rows: [
            { id: 'subscription', hint: isPro ? 'PRO' : 'Free' },
            { id: 'storage', hint: driveLinked ? 'Drive linked' : undefined },
          ] },
          { title: 'Support & policies', rows: [{ id: 'support' }, { id: 'policies' }] },
        ];
        const row = (id: Tab, label: string, Icon: React.ElementType, hint: string | undefined, first: boolean, onClick: () => void, danger = false) => (
          <button key={id + label} onClick={onClick} style={{
            position: 'relative', display: 'flex', alignItems: 'center', gap: '14px', width: '100%', minHeight: '60px',
            padding: '0 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer',
            color: danger ? 'var(--danger)' : 'var(--ink)', fontSize: '16px', lineHeight: '24px', fontWeight: danger ? 600 : 500,
          }}>
            {!first && <span aria-hidden style={{ position: 'absolute', top: 0, left: '66px', right: '16px', height: '1px', background: 'var(--hairline)' }} />}
            <span style={{
              width: '36px', height: '36px', borderRadius: '9999px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: danger ? 'var(--danger-bg)' : 'color-mix(in srgb, var(--accent) 12%, transparent)', color: danger ? 'var(--danger)' : 'var(--accent)',
            }}>
              <Icon size={18} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
            {hint && <span style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{hint}</span>}
            {!danger && <ChevronRight size={18} style={{ color: 'var(--chevron)', flexShrink: 0, marginRight: '-4px' }} />}
          </button>
        );
        return (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Profile card */}
            <button onClick={() => openTab('personal')} aria-label="Edit personal info" style={{
              display: 'flex', alignItems: 'center', gap: '16px', width: '100%', padding: '20px', border: '1px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', textAlign: 'left',
              background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '24px', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)', position: 'relative', overflow: 'hidden',
            }}>
              <span aria-hidden style={{ position: 'absolute', width: '220px', height: '220px', top: '-110px', right: '-60px', borderRadius: '9999px', background: 'radial-gradient(closest-side, rgba(255, 255, 255, 0.12), transparent)', pointerEvents: 'none' }} />
              <span style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '9999px', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', color: '#000000', fontWeight: 700, fontSize: '20px' }}>
                {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
              </span>
              <span style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontWeight: 600, fontSize: '20px', lineHeight: '28px', color: '#ffffff', letterSpacing: '-0.025em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || 'Your account'}</span>
                {user?.email && <span style={{ fontSize: '13px', lineHeight: '20px', color: 'rgba(255, 255, 255, 0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</span>}
                <span className="t-caps" style={{ alignSelf: 'flex-start', marginTop: '6px', padding: '2px 10px', borderRadius: '9999px', background: isPro ? '#ffffff' : 'rgba(255, 255, 255, 0.08)', color: isPro ? '#000000' : 'rgba(255, 255, 255, 0.7)', fontWeight: 700 }}>
                  {isPro ? 'PRO' : 'Free plan'}
                </span>
              </span>
              <ChevronRight size={20} style={{ position: 'relative', color: 'rgba(255, 255, 255, 0.4)', flexShrink: 0 }} />
            </button>

            {groups.map(g => (
              <section key={g.title}>
                <h2 className="t-caps" style={{ margin: '0 0 8px 16px', color: 'rgba(255, 255, 255, 0.45)' }}>{g.title}</h2>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '24px', overflow: 'hidden' }}>
                  {g.rows.map((r, i) => {
                    const t = tabs.find(x => x.id === r.id)!;
                    return row(r.id, t.label, t.icon, r.hint, i === 0, () => openTab(r.id));
                  })}
                </div>
              </section>
            ))}

            {/* Install the app (permanent entry; the Home card can be dismissed) */}
            <InstallAppCard persistent />

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '24px', overflow: 'hidden' }}>
              {row('personal', 'Sign out', LogOut, undefined, true, () => { logout(); navigate('/login', { replace: true }); }, true)}
            </div>
          </div>
        );
      })()}

      {/* ── Category list (master) — desktop ── */}
      {!isMobile && (
      <div className="account-sidebar-nav">
        <h1 className="account-sidebar-heading">Account</h1>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`account-sidebar-link ${active ? 'is-active' : ''}`}
            >
              {active && (
                <motion.div
                  layoutId="settings-nav-pill"
                  className="account-sidebar-link-bg"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}

        {/* Sign Out — separated destructive action */}
        <button
          onClick={() => { logout(); navigate('/login', { replace: true }); }}
          className="account-sidebar-signout"
        >
          <LogOut size={16} />
          <span>Sign out</span>
        </button>
      </div>
      )}

      {/* ── Content Panel (detail) ──
          Every section uses the same pieces as the Account root: an intro line
          (the app bar carries the title on phones), caps-titled groups on one
          surface with 24 radius, 56pt sunken fields, spec buttons, and honest
          copy. Helpers are plain functions (not components) so inputs keep
          focus across renders. */}
      {(!isMobile || mobileDetail) && (() => {
        const field: React.CSSProperties = {
          width: '100%', height: '52px', padding: '0 16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.1)', outline: 'none',
          background: 'rgba(255, 255, 255, 0.04)', color: '#ffffff', fontSize: '15px', boxSizing: 'border-box',
        };
        const pill: React.CSSProperties = {
          flexShrink: 0, height: '36px', padding: '0 14px', borderRadius: '9999px', border: '1px solid rgba(255, 255, 255, 0.12)', cursor: 'pointer',
          background: 'rgba(255, 255, 255, 0.08)', color: '#ffffff', fontSize: '13px', fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
        };
        const disc = (Icon: React.ElementType, _color = '#ffffff') => (
          <span aria-hidden style={{ width: '36px', height: '36px', borderRadius: '9999px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#ffffff' }}>
            <Icon size={18} />
          </span>
        );
        const intro = (title: string, text: React.ReactNode) => (
          <div>
            {!isMobile && <h2 style={{ fontSize: '24px', lineHeight: '32px', fontWeight: 600, margin: '0 0 4px', color: 'var(--dash-text, #ffffff)', letterSpacing: '-0.025em' }}>{title}</h2>}
            <p style={{ margin: 0, fontSize: '13px', lineHeight: '20px', color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.5))', padding: isMobile ? '0 4px' : 0 }}>{text}</p>
          </div>
        );
        const group = (title: string | null, body: React.ReactNode, footer?: React.ReactNode) => (
          <section>
            {title && <h3 className="t-caps" style={{ margin: '0 0 8px 16px', color: 'var(--dash-text-subtle, rgba(255, 255, 255, 0.45))' }}>{title}</h3>}
            <div style={{ background: 'var(--dash-card-bg, rgba(255, 255, 255, 0.03))', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--dash-card-border, rgba(255, 255, 255, 0.08))', boxShadow: 'var(--dash-card-shadow)', borderRadius: '24px', overflow: 'hidden' }}>{body}</div>
            {footer && <p style={{ margin: '8px 16px 0', fontSize: '12px', lineHeight: '16px', color: 'var(--dash-text-subtle, rgba(255, 255, 255, 0.45))' }}>{footer}</p>}
          </section>
        );
        const divider = (inset = 66) => <span aria-hidden style={{ display: 'block', height: '1px', margin: `0 16px 0 ${inset}px`, background: 'var(--dash-border-subtle, rgba(255, 255, 255, 0.06))' }} />;
        const banner = (kind: 'error' | 'ok', text: React.ReactNode) => (
          <div role={kind === 'error' ? 'alert' : 'status'} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '14px', fontSize: '13px', lineHeight: '20px', background: kind === 'error' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)', border: kind === 'error' ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(34, 197, 94, 0.25)', color: kind === 'error' ? '#f87171' : '#4ade80' }}>
            {kind === 'error' ? <AlertCircle size={16} style={{ flexShrink: 0 }} /> : <CheckCircle size={16} style={{ flexShrink: 0 }} />}
            <span>{text}</span>
          </div>
        );
        const emptyState = (Icon: React.ElementType, title: string, text: React.ReactNode, action: React.ReactNode, _color = 'var(--dash-text, #ffffff)') => (
          <div style={{ background: 'var(--dash-card-bg, rgba(255, 255, 255, 0.03))', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--dash-card-border, rgba(255, 255, 255, 0.08))', borderRadius: '24px', padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center' }}>
            <span style={{ width: '64px', height: '64px', borderRadius: '9999px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dash-icon-pod-bg, rgba(255, 255, 255, 0.08))', border: '1px solid var(--dash-icon-pod-border, rgba(255, 255, 255, 0.1))', color: 'var(--dash-text, #ffffff)', marginBottom: '8px' }}><Icon size={28} /></span>
            <h3 style={{ fontSize: '20px', lineHeight: '28px', fontWeight: 600, margin: 0, color: 'var(--dash-text, #ffffff)', letterSpacing: '-0.025em' }}>{title}</h3>
            <p style={{ margin: 0, fontSize: '13px', lineHeight: '20px', color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.5))', maxWidth: '340px' }}>{text}</p>
            <div style={{ marginTop: '16px', width: '100%', display: 'flex', justifyContent: 'center' }}>{action}</div>
          </div>
        );
        const eyeBtn = (shown: boolean, toggle: () => void, label: string) => (
          <button type="button" aria-label={label} aria-pressed={shown} onClick={toggle}
            style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', width: '40px', height: '40px', borderRadius: '9999px', border: 'none', background: 'transparent', color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.4))', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {shown ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        );
        const editPanel = (text: React.ReactNode, controls: React.ReactNode, error: string, footer?: React.ReactNode) => (
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ margin: 0, fontSize: '13px', lineHeight: '20px', color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.5))' }}>{text}</p>
            {controls}
            {error && <p role="alert" style={{ margin: 0, fontSize: '13px', lineHeight: '20px', color: 'var(--danger)' }}>{error}</p>}
            {footer}
          </div>
        );
        const since = user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null;
        const nameChanged = name.trim() !== (user?.name || '');

        return (
      <div className="account-content-pane" style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', minWidth: 0 }}>

        {/* ════════════════ PERSONAL INFO ════════════════ */}
        {activeTab === 'personal' && (<>
          {intro('Personal info', 'Your name, photo and how we reach you.')}

          {/* Identity card — tap the photo to change it */}
          <div style={{ position: 'relative', overflow: 'hidden', background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)' }}>
            <span aria-hidden style={{ position: 'absolute', width: '260px', height: '260px', top: '-150px', left: '50%', transform: 'translateX(-50%)', borderRadius: '9999px', background: 'radial-gradient(closest-side, rgba(255, 255, 255, 0.12), transparent)', pointerEvents: 'none' }} />
            <button type="button" onClick={() => avatarInputRef.current?.click()} aria-label="Change profile photo"
              style={{ position: 'relative', width: '96px', height: '96px', borderRadius: '9999px', border: '2px solid rgba(255, 255, 255, 0.8)', padding: 0, cursor: 'pointer', background: '#ffffff', color: '#000000', fontSize: '32px', fontWeight: 700, boxShadow: '0 0 25px rgba(255, 255, 255, 0.15)' }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '9999px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
              </span>
              <span aria-hidden style={{ position: 'absolute', right: '-2px', bottom: '-2px', width: '30px', height: '30px', borderRadius: '9999px', background: '#000000', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)' }}>
                <Camera size={15} />
              </span>
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
            <div style={{ position: 'relative', minWidth: 0, maxWidth: '100%' }}>
              <div style={{ fontSize: '20px', lineHeight: '28px', fontWeight: 600, color: '#ffffff', letterSpacing: '-0.025em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || 'Your account'}</div>
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="t-caps" style={{ padding: '2px 10px', borderRadius: '9999px', background: isPro ? '#ffffff' : 'rgba(255, 255, 255, 0.08)', color: isPro ? '#000000' : 'rgba(255, 255, 255, 0.7)', border: isPro ? 'none' : '1px solid rgba(255, 255, 255, 0.12)', fontWeight: 700 }}>
                  {isPro ? (isYearly ? 'PRO yearly' : 'PRO monthly') : 'Free plan'}
                </span>
                {since && <span style={{ fontSize: '12px', lineHeight: '16px', color: 'rgba(255, 255, 255, 0.45)' }}>Member since {since}</span>}
              </div>
            </div>
          </div>

          {profileError && banner('error', profileError)}
          {profileSaved && banner('ok', 'Your name was saved.')}

          {group('Name',
            <form onSubmit={handleSaveProfile} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" value={name} onChange={e => { setName(e.target.value); setProfileError(''); }} aria-label="Full name" autoComplete="name" style={field} />
              <div style={{ display: 'flex', gap: '12px' }}>
                {nameChanged && (
                  <button type="button" className="btn-secondary" onClick={() => { setName(user?.name || ''); setProfileError(''); }} style={{ flex: 1 }}>Cancel</button>
                )}
                <button type="submit" className="btn-primary" disabled={savingProfile || !nameChanged} style={{ flex: 2 }}>
                  {savingProfile ? <><Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} />Saving…</> : profileSaved && !nameChanged ? <><Check size={18} />Saved</> : 'Save name'}
                </button>
              </div>
            </form>
          )}

          {group('Contact', <>
            {/* Email */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', minHeight: '68px' }}>
              {disc(Mail)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--ink-faint)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Email {user?.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--success)', fontWeight: 600 }}><CheckCircle size={12} />Verified</span>}
                </div>
                <div style={{ fontSize: '16px', lineHeight: '24px', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email || 'Not set'}</div>
              </div>
              {emailStep === null && (
                <button type="button" style={pill} onClick={() => { setEmailStep('input'); setEmailChangeError(''); setNewEmailInput(''); }}>Change</button>
              )}
            </div>
            {emailStep === 'input' && editPanel(
              'Enter your new email. We’ll send a 6-digit code to confirm it.',
              <>
                <input type="email" value={newEmailInput} onChange={e => { setNewEmailInput(e.target.value); setEmailChangeError(''); }} placeholder="new@email.com" aria-label="New email" autoComplete="email" style={field} />
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => { setEmailStep(null); setEmailChangeError(''); }}>Cancel</button>
                  <button type="button" className="btn-primary" style={{ flex: 2 }} onClick={handleSendEmailCode} disabled={!newEmailInput.trim()}>Send code</button>
                </div>
              </>,
              emailChangeError,
            )}
            {emailStep === 'verify' && editPanel(
              <>Code sent to <strong style={{ color: 'var(--ink)' }}>{newEmailInput}</strong>. Enter it to confirm. You’ll sign in again afterwards.</>,
              <>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" value={emailOtpInput} onChange={e => { setEmailOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6)); setEmailChangeError(''); }} placeholder="6-digit code" aria-label="Verification code" maxLength={6} style={{ ...field, letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' }} />
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => { setEmailStep(null); setEmailChangeError(''); setEmailOtpInput(''); }}>Cancel</button>
                  <button type="button" className="btn-primary" style={{ flex: 2 }} onClick={handleVerifyEmailCode} disabled={emailOtpInput.length < 6}>Verify</button>
                </div>
              </>,
              emailChangeError,
              <button type="button" onClick={() => setEmailStep('input')} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: '8px 0', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--accent)' }}>Use a different email</button>,
            )}

            {divider()}

            {/* Phone */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', minHeight: '68px' }}>
              {disc(Smartphone)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--ink-faint)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Phone {user?.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--success)', fontWeight: 600 }}><CheckCircle size={12} />Verified</span>}
                </div>
                <div style={{ fontSize: '16px', lineHeight: '24px', color: user?.phone ? 'var(--ink)' : 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.phone || 'Not added'}</div>
              </div>
              {phoneStep === null && (
                <button type="button" style={pill} onClick={() => { setPhoneStep('input'); setPhoneChangeError(''); setNewPhoneInput(''); }}>{user?.phone ? 'Change' : 'Add'}</button>
              )}
            </div>
            {phoneStep === 'input' && editPanel(
              'Enter your number. We’ll send a 6-digit code to confirm it.',
              <>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select value={newPhoneDialCode} onChange={e => setNewPhoneDialCode(e.target.value)} aria-label="Country code" style={{ ...field, width: 'auto', flexShrink: 0, padding: '0 12px', fontWeight: 600 }}>
                    {['+1', '+44', '+91', '+61', '+33', '+49', '+81', '+86', '+971', '+65'].map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input type="tel" value={newPhoneInput} onChange={e => { setNewPhoneInput(e.target.value); setPhoneChangeError(''); }} placeholder="000 000 0000" aria-label="Phone number" autoComplete="tel-national" style={{ ...field, flex: 1, minWidth: 0 }} />
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => { setPhoneStep(null); setPhoneChangeError(''); }}>Cancel</button>
                  <button type="button" className="btn-primary" style={{ flex: 2 }} onClick={handleSendPhoneCode} disabled={!newPhoneInput.trim()}>Send code</button>
                </div>
              </>,
              phoneChangeError,
            )}
            {phoneStep === 'verify' && editPanel(
              <>Code sent to <strong style={{ color: 'var(--ink)' }}>{newPhoneDialCode} {newPhoneInput}</strong>. Enter it to confirm.</>,
              <>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" value={phoneOtpInput} onChange={e => { setPhoneOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6)); setPhoneChangeError(''); }} placeholder="6-digit code" aria-label="Verification code" maxLength={6} style={{ ...field, letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' }} />
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => { setPhoneStep(null); setPhoneChangeError(''); setPhoneOtpInput(''); }}>Cancel</button>
                  <button type="button" className="btn-primary" style={{ flex: 2 }} onClick={handleVerifyPhoneCode} disabled={phoneOtpInput.length < 6}>Verify</button>
                </div>
              </>,
              phoneChangeError,
              <button type="button" onClick={() => { setPhoneStep('input'); setPhoneChangeError(''); setPhoneOtpInput(''); }} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: '8px 0', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--accent)' }}>Use a different number</button>,
            )}
          </>, 'Changing your email signs you out, so you can sign in with the new address.')}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>)}

        {/* ════════════════ APPEARANCE ════════════════ */}
        {activeTab === 'appearance' && (<>
          {intro('Appearance', 'Choose how O-Zenith looks across your workspace.')}
          {group('Workspace Glass Theme',
            <div role="radiogroup" aria-label="Theme" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '16px', padding: '8px 0' }}>
              {([
                {
                  id: 'dark' as const,
                  label: 'Dark',
                  sub: 'Deep Space Obsidian & Liquid Silver',
                  canvas: '#020203',
                  surface: 'rgba(255, 255, 255, 0.05)',
                  border: 'rgba(255, 255, 255, 0.12)',
                  ink: '#FFFFFF',
                  accent: 'linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 100%)',
                  btnText: '#000000',
                  dots: ['#FF5F56', '#FFBD2E', '#27C93F'],
                },
                {
                  id: 'light' as const,
                  label: 'Light',
                  sub: 'Polar Alabaster & Frosted Quartz',
                  canvas: '#F4F4F6',
                  surface: 'rgba(255, 255, 255, 0.88)',
                  border: 'rgba(0, 0, 0, 0.08)',
                  ink: '#09090B',
                  accent: 'linear-gradient(180deg, #27272A 0%, #09090B 100%)',
                  btnText: '#FFFFFF',
                  dots: ['#FF5F56', '#FFBD2E', '#27C93F'],
                },
                {
                  id: 'system' as const,
                  label: 'System (Auto)',
                  sub: 'Matches your OS appearance',
                  canvas: 'split',
                  surface: 'split',
                  border: 'rgba(255, 255, 255, 0.16)',
                  ink: 'var(--dash-text)',
                  accent: 'linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 100%)',
                  btnText: '#000000',
                  dots: ['#FF5F56', '#FFBD2E', '#27C93F'],
                },
              ]).map(opt => {
                const selected = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTheme(opt.id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '20px',
                      border: selected ? '2px solid var(--accent, #FFFFFF)' : '1px solid var(--dash-border-subtle, rgba(255, 255, 255, 0.12))',
                      cursor: 'pointer',
                      textAlign: 'left',
                      background: selected ? 'var(--dash-dock-bg, rgba(255, 255, 255, 0.06))' : 'transparent',
                      boxShadow: selected ? '0 0 25px rgba(255, 255, 255, 0.15)' : 'none',
                      transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  >
                    {/* Mini Apple-like Window Frame */}
                    <div
                      aria-hidden
                      style={{
                        position: 'relative',
                        height: '130px',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        background: opt.id === 'system'
                          ? 'linear-gradient(135deg, #F4F4F6 50%, #020203 50%)'
                          : opt.canvas,
                        border: `1px solid ${opt.border}`,
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      {/* Window Title Bar */}
                      <div
                        style={{
                          height: '24px',
                          padding: '0 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          borderBottom: `1px solid ${opt.id === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
                          background: opt.id === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                        }}
                      >
                        {opt.dots.map((c, i) => (
                          <span key={i} style={{ width: '6px', height: '6px', borderRadius: '9999px', background: c, opacity: 0.8 }} />
                        ))}
                        <span
                          style={{
                            marginLeft: 'auto',
                            width: '42px',
                            height: '6px',
                            borderRadius: '9999px',
                            background: opt.id === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
                          }}
                        />
                      </div>

                      {/* Window Body Mockup */}
                      <div style={{ flex: 1, padding: '10px', display: 'flex', gap: '8px', position: 'relative' }}>
                        {opt.id === 'system' ? (
                          <>
                            {/* Left Side: Light */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <span style={{ width: '45%', height: '6px', borderRadius: '3px', background: '#0A0A0A', opacity: 0.8 }} />
                              <span style={{ flex: 1, borderRadius: '8px', background: '#FFFFFF', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
                                <span style={{ width: '80%', height: '4px', borderRadius: '2px', background: '#0A0A0A', opacity: 0.5 }} />
                                <span style={{ width: '50%', height: '4px', borderRadius: '2px', background: '#0A0A0A', opacity: 0.25 }} />
                                <span style={{ marginTop: 'auto', width: '60%', height: '10px', borderRadius: '9999px', background: '#0A0A0A' }} />
                              </span>
                            </div>
                            {/* Right Side: Dark */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <span style={{ width: '45%', height: '6px', borderRadius: '3px', background: '#FFFFFF', opacity: 0.8 }} />
                              <span style={{ flex: 1, borderRadius: '8px', background: 'rgba(255, 255, 255, 0.08)', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                <span style={{ width: '80%', height: '4px', borderRadius: '2px', background: '#FFFFFF', opacity: 0.5 }} />
                                <span style={{ width: '50%', height: '4px', borderRadius: '2px', background: '#FFFFFF', opacity: 0.25 }} />
                                <span style={{ marginTop: 'auto', width: '60%', height: '10px', borderRadius: '9999px', background: '#FFFFFF' }} />
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Side mini rail */}
                            <div style={{ width: '18px', display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '2px' }}>
                              <span style={{ width: '14px', height: '14px', borderRadius: '4px', background: opt.accent, opacity: 0.9 }} />
                              <span style={{ width: '14px', height: '14px', borderRadius: '4px', background: opt.ink, opacity: 0.15 }} />
                              <span style={{ width: '14px', height: '14px', borderRadius: '4px', background: opt.ink, opacity: 0.15 }} />
                            </div>
                            {/* Main content pane */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <span style={{ width: '50%', height: '6px', borderRadius: '3px', background: opt.ink, opacity: 0.75 }} />
                              <div style={{ flex: 1, borderRadius: '8px', background: opt.surface, border: `1px solid ${opt.border}`, padding: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <span style={{ width: '75%', height: '4px', borderRadius: '2px', background: opt.ink, opacity: 0.5 }} />
                                <span style={{ width: '45%', height: '4px', borderRadius: '2px', background: opt.ink, opacity: 0.25 }} />
                                <span style={{ marginTop: 'auto', width: '55%', height: '12px', borderRadius: '9999px', background: opt.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ width: '20px', height: '2px', borderRadius: '1px', background: opt.btnText }} />
                                </span>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Bottom Label & Radio Indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '0 4px', width: '100%', boxSizing: 'border-box' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--dash-text, var(--ink))', lineHeight: 1.2 }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--dash-text-muted, var(--ink-faint))', marginTop: '2px' }}>
                          {opt.sub}
                        </div>
                      </div>
                      <div
                        aria-hidden
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '9999px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: selected ? 'var(--dash-button-primary-bg, #FFFFFF)' : 'var(--dash-dock-bg, rgba(255, 255, 255, 0.10))',
                          border: `1px solid ${selected ? 'transparent' : 'var(--dash-border-medium, rgba(255, 255, 255, 0.20))'}`,
                          color: selected ? 'var(--dash-button-primary-text, #000000)' : 'transparent',
                          flexShrink: 0,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {selected && <Check size={13} strokeWidth={3} />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>,
            'Changes take effect instantaneously and persist across reloads.',
          )}
        </>)}

        {/* ════════════════ API KEYS ════════════════ */}
        {activeTab === 'settings' && !isPro && (<>
          {intro('API keys', 'Your own AI provider key powers the AI tools.')}
          {emptyState(Crown, 'API keys come with PRO',
            <>Add your own OpenAI, Anthropic, Gemini, Groq, O-Zenith AI Gateway or DeepSeek key to use all {toolCountByCategory['ai']} AI tools. Keys stay in your browser.</>,
            <button type="button" className="btn-primary" onClick={() => navigate('/dashboard/subscription')} style={{ width: isMobile ? '100%' : 'auto', padding: '0 32px' }}>Upgrade to PRO</button>,
          )}
        </>)}

        {activeTab === 'settings' && isPro && (() => {
          const inUse = getActiveProvider()?.provider;
          const savedProviders = API_PROVIDERS.filter(p => (apiKeys[p.id] || '').trim());
          const guess = detectProvider(newKey);
          const hint = !newKey.trim() ? null
            : !guess ? { tone: 'bad' as const, text: 'This doesn’t look like a key from a supported provider.' }
            : guess.confident ? { tone: 'good' as const, text: `Looks like ${/^[AEIOU]/.test(PROVIDER_LABEL[guess.provider]) ? 'an' : 'a'} ${PROVIDER_LABEL[guess.provider]} key.` }
            : { tone: 'neutral' as const, text: 'OpenAI or DeepSeek? Pick one — the key is only checked with that provider.' };
          const ambiguous = !!guess && !guess.confident;
          const chosenFor = keyFor ?? guess?.provider ?? null;

          const addKey = async () => {
            const key = newKey.trim();
            if (!key || addingKey) return;
            setKeyError('');
            setAddingKey(true);
            try {
              const res = await identifyKey(key, undefined, ambiguous ? chosenFor ?? undefined : undefined);
              if (res.status === 'unrecognised') { setKeyError('We couldn’t tell which provider this key is for. Check you copied the whole key.'); return; }
              if (res.status === 'rejected') { setKeyError(`${PROVIDER_LABEL[res.provider]} didn’t accept this key. Check it’s active and copied in full.`); return; }
              const replaced = !!(apiKeys[res.provider] || '').trim();
              setApiKey(res.provider, key);
              setApiKeys(prev => ({ ...prev, [res.provider]: key }));
              setNewKey('');
              setKeyFor(null);
              setShowNewKey(false);
              showToast(`${replaced ? 'Replaced your' : 'Added'} ${PROVIDER_LABEL[res.provider]} key${res.verified ? '' : ' (we couldn’t reach them to check it)'}.`);
            } finally {
              setAddingKey(false);
            }
          };
          const removeKey = (id: string) => {
            setApiKey(id as Provider, '');
            setApiKeys(prev => ({ ...prev, [id]: '' }));
            showToast(`Removed your ${PROVIDER_LABEL[id as Provider]} key.`);
          };

          return (<>
            {intro('API keys', 'Paste a key from any supported provider. O-Zenith works out which one it is. Keys never touch an O-Zenith server.')}

            {group('Add a key',
              <form onSubmit={e => { e.preventDefault(); addKey(); }} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ position: 'relative' }}>
                  <input type={showNewKey ? 'text' : 'password'} value={newKey} autoComplete="off" spellCheck={false} autoCapitalize="off" autoCorrect="off"
                    onChange={e => { setNewKey(e.target.value); setKeyError(''); }}
                    placeholder="Paste an API key" aria-label="API key" aria-describedby="key-hint"
                    style={{ ...field, paddingRight: '56px', fontFamily: newKey ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined }} />
                  {eyeBtn(showNewKey, () => setShowNewKey(v => !v), 'Show or hide key')}
                </div>
                <p id="key-hint" aria-live="polite" style={{ margin: 0, minHeight: '20px', fontSize: '14px', lineHeight: '20px', display: 'flex', alignItems: 'center', gap: '6px',
                  color: keyError ? 'var(--danger)' : hint?.tone === 'good' ? 'var(--success)' : hint?.tone === 'bad' ? 'var(--danger)' : 'var(--ink-faint)' }}>
                  {keyError ? <><AlertCircle size={16} style={{ flexShrink: 0 }} />{keyError}</>
                    : hint ? <>{hint.tone === 'good' ? <CheckCircle size={16} style={{ flexShrink: 0 }} /> : hint.tone === 'bad' ? <AlertCircle size={16} style={{ flexShrink: 0 }} /> : null}{hint.text}</>
                    : 'Works with OpenAI, Anthropic, Google Gemini, Groq, O-Zenith AI Gateway and DeepSeek.'}
                </p>
                {ambiguous && (
                  <div className="segmented" role="tablist" aria-label="Key provider">
                    {AMBIGUOUS.map(p => (
                      <button key={p} type="button" role="tab" aria-selected={chosenFor === p} onClick={() => { setKeyFor(p); setKeyError(''); }}>{PROVIDER_LABEL[p]}</button>
                    ))}
                  </div>
                )}
                <button type="submit" className="btn-primary" disabled={!guess || addingKey} style={{ width: '100%' }}>
                  {addingKey ? <><Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} />Checking key…</> : 'Add key'}
                </button>
              </form>,
            )}

            {group('Your keys',
              savedProviders.length === 0 ? (
                <p style={{ margin: 0, padding: '20px 16px', fontSize: '14px', lineHeight: '20px', color: 'var(--ink-faint)', textAlign: 'center' }}>No keys yet. Add one above to use the AI tools and Chat.</p>
              ) : savedProviders.map((provider, i) => (
                <div key={provider.id}>
                  {i > 0 && divider()}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 8px 12px 16px', minHeight: '68px' }}>
                    <span aria-hidden style={{ width: '36px', height: '36px', borderRadius: '9999px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${provider.color} 16%, transparent)`, color: provider.color, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px' }}>
                      {PROVIDER_LABEL[provider.id as Provider][0]}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', lineHeight: '24px', fontWeight: 600, color: 'var(--ink)' }}>
                        {PROVIDER_LABEL[provider.id as Provider]}
                        {inUse === provider.id && <span className="t-caps" style={{ padding: '1px 8px', borderRadius: '9999px', background: 'var(--accent)', color: 'var(--on-accent)' }}>In use</span>}
                      </span>
                      <span style={{ display: 'block', fontSize: '12px', lineHeight: '16px', color: 'var(--ink-faint)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{maskKey(apiKeys[provider.id] || '')}</span>
                    </span>
                    <button type="button" onClick={() => removeKey(provider.id)} aria-label={`Remove ${PROVIDER_LABEL[provider.id as Provider]} key`}
                      style={{ flexShrink: 0, width: '44px', height: '44px', borderRadius: '9999px', border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              )),
              savedProviders.length > 1 ? 'With more than one key, the first in this list is used.' : undefined,
            )}

            {/* Sync status — visible, not a silent background job */}
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '24px', padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              {disc(CloudUpload, driveLinked ? '#1A73E8' : 'var(--accent)')}
              <div style={{ flex: 1, minWidth: 0, fontSize: '13px', lineHeight: '20px', color: 'rgba(255, 255, 255, 0.5)' }}>
                {!driveLinked
                  ? 'Keys stay on this device. Link Google Drive to carry them to your other devices.'
                  : syncStatus.state === 'syncing' ? 'Syncing with your Google Drive…'
                  : syncStatus.state === 'error' ? <span style={{ color: 'var(--danger)' }}>{syncStatus.message}</span>
                  : syncStatus.state === 'no-drive' ? 'Drive session expired. Reconnect to resume syncing.'
                  : syncStatus.state === 'ok'
                    ? (syncStatus.restoredKeys > 0 ? `Restored ${syncStatus.restoredKeys} key${syncStatus.restoredKeys !== 1 ? 's' : ''} from your Drive.` : 'Synced to your Drive.')
                    : 'Keys sync to your other devices through a private file in your Google Drive.'}
              </div>
              {driveLinked && (
                <button type="button" style={{ ...pill, cursor: syncStatus.state === 'syncing' ? 'wait' : 'pointer' }} disabled={syncStatus.state === 'syncing'}
                  onClick={async () => {
                    setSyncStatus({ state: 'syncing' });
                    const m = await import('../../utils/accountSync');
                    const res = await m.syncAccountNow();
                    setSyncStatus(res);
                    if (res.state === 'ok') {
                      setApiKeys(Object.fromEntries(API_PROVIDERS.map(p => [p.id, getApiKey(p.id as Provider)])));
                      showToast(res.restoredKeys > 0 ? `Restored ${res.restoredKeys} key${res.restoredKeys !== 1 ? 's' : ''}.` : 'Keys synced to your Drive.');
                    } else if (res.state === 'error') showToast(res.message);
                  }}>
                  {syncStatus.state === 'syncing' ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
                  Sync now
                </button>
              )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>);
        })()}

        {/* ════════════════ SECURITY ════════════════ */}
        {activeTab === 'security' && (<>
          {intro('Security', 'Change the password you use to sign in.')}
          {securityError && banner('error', securityError)}
          {securityMsg && banner('ok', securityMsg)}
          {group('Change password',
            <form onSubmit={handleChangePassword} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { id: 'pw-current', label: 'Current password', value: currentPw, set: setCurrentPw, auto: 'current-password' },
                { id: 'pw-new',     label: 'New password',     value: newPw,     set: setNewPw,     auto: 'new-password' },
                { id: 'pw-confirm', label: 'Confirm new password', value: confirmPw, set: setConfirmPw, auto: 'new-password' },
              ].map(({ id, label, value, set, auto }) => (
                <div key={id}>
                  <label className="field-label" htmlFor={id}>{label}</label>
                  <div style={{ position: 'relative' }}>
                    <input id={id} type={showPw ? 'text' : 'password'} value={value} autoComplete={auto}
                      onChange={e => { set(e.target.value); setSecurityError(''); setSecurityMsg(''); }}
                      style={{ ...field, paddingRight: '56px' }} />
                    {eyeBtn(showPw, () => setShowPw(v => !v), 'Show or hide passwords')}
                  </div>
                </div>
              ))}
              {newPw && (
                <p style={{ margin: '-4px 0 0', fontSize: '12px', lineHeight: '16px', color: newPw.length >= 8 ? '#4ade80' : 'rgba(255, 255, 255, 0.45)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {newPw.length >= 8 ? <CheckCircle size={14} /> : <AlertCircle size={14} />} At least 8 characters
                  {confirmPw && <span style={{ marginLeft: '8px', color: newPw === confirmPw ? '#4ade80' : 'var(--danger)' }}>· {newPw === confirmPw ? 'Passwords match' : 'Passwords don’t match'}</span>}
                </p>
              )}
              <button type="submit" className="btn-primary" disabled={securityLoading || !currentPw || !newPw || !confirmPw} style={{ width: '100%' }}>
                {securityLoading ? <><Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} />Updating…</> : 'Update password'}
              </button>
            </form>,
            'Your password is stored as a one-way hash on this device only.',
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>)}

        {/* ════════════════ SUBSCRIPTION ════════════════ */}
        {activeTab === 'subscription' && (() => {
          const periodDays = isYearly ? 365 : 30;
          const ringValue = isPro ? (daysLeft !== null ? daysLeft / periodDays : 1) : freeUsesLeft / FREE_USES_LIMIT;
          const renews = isPro && subscription.expiresAt
            ? new Date(subscription.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
          return (<>
            {intro('Subscription', 'Your plan and what it includes.')}

            <div style={{ position: 'relative', overflow: 'hidden', background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '24px', padding: '24px', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <span aria-hidden style={{ position: 'absolute', width: '300px', height: '300px', top: '-160px', right: '-90px', borderRadius: '9999px', background: 'radial-gradient(closest-side, rgba(255, 255, 255, 0.12), transparent)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <Ring value={ringValue} size={96} label={isPro ? (daysLeft !== null ? `${daysLeft} days left in this period` : 'Active') : `${freeUsesLeft} of ${FREE_USES_LIMIT} free uses left`}>
                  <span style={{ fontWeight: 700, fontSize: String(isPro ? (daysLeft ?? '∞') : freeUsesLeft).length >= 3 ? '18px' : '24px', lineHeight: '28px', color: '#ffffff' }}>{isPro ? (daysLeft ?? '∞') : freeUsesLeft}</span>
                  <span className="t-caps" style={{ color: 'rgba(255, 255, 255, 0.45)' }}>{isPro ? 'days' : 'left'}</span>
                </Ring>
                <div style={{ minWidth: 0 }}>
                  <div className="t-caps" style={{ color: 'rgba(255, 255, 255, 0.45)' }}>Current plan</div>
                  <div style={{ fontSize: '20px', lineHeight: '28px', fontWeight: 600, color: '#ffffff', letterSpacing: '-0.025em' }}>{isPro ? (isYearly ? 'PRO yearly' : 'PRO monthly') : 'Free'}</div>
                  <div style={{ fontSize: '13px', lineHeight: '20px', color: 'rgba(255, 255, 255, 0.5)' }}>
                    {isPro ? (isMonthly ? '₹29 a month' : '₹339 a year') : `${freeUsesLeft} of ${FREE_USES_LIMIT} free uses left`}
                  </div>
                  {renews && <div style={{ fontSize: '12px', lineHeight: '16px', color: 'rgba(255, 255, 255, 0.45)', marginTop: '2px' }}>Renews {renews}</div>}
                </div>
              </div>
              {isPro
                ? <button type="button" className="btn-secondary" onClick={() => navigate('/dashboard/subscription')} style={{ position: 'relative', width: '100%' }}>Manage plan</button>
                : <button type="button" className="btn-primary" onClick={() => navigate('/dashboard/subscription')} style={{ position: 'relative', width: '100%' }}>Upgrade to PRO · ₹29 a month</button>}
            </div>

            {group(isPro ? 'Included in your plan' : 'What PRO unlocks',
              categories.filter(c => c.id !== 'all').map((c, i) => {
                const unlocked = isPro;
                const freeLimited = !isPro && FREE_CATEGORIES.has(c.id);
                return (
                  <div key={c.id}>
                    {i > 0 && divider()}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', minHeight: '60px' }}>
                      {disc(unlocked ? Check : freeLimited ? Zap : Lock, unlocked ? 'var(--success)' : 'var(--accent)')}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '16px', lineHeight: '24px', color: 'var(--ink)' }}>{categoryName(c.id)}</span>
                        {!isPro && <span style={{ display: 'block', fontSize: '12px', lineHeight: '16px', color: 'var(--ink-faint)' }}>{freeLimited ? `Shares your ${FREE_USES_LIMIT} free uses` : 'PRO only'}</span>}
                      </span>
                      <span style={{ fontSize: '14px', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{toolCountByCategory[c.id] ?? 0} tools</span>
                    </div>
                  </div>
                );
              }),
              isPro ? `All ${TOTAL_TOOLS} tools, with no limit on uses.` : `PRO opens all ${TOTAL_TOOLS} tools with no limit on uses.`,
            )}
          </>);
        })()}

        {/* ════════════════ STORAGE ════════════════ */}
        {activeTab === 'storage' && (() => {
          const items = [
            { label: 'Account data', key: 'zenith_users',        color: 'var(--cat-water)',  icon: User },
            { label: 'Favorites',    key: 'zenith_favorites',    color: 'var(--accent)',     icon: Heart },
            { label: 'Recent tools', key: 'zenith_recent_tools', color: 'var(--cat-vitals)', icon: Settings },
            { label: 'Subscription', key: 'zenith_subscription', color: 'var(--cat-body)',   icon: CreditCard },
            { label: 'API keys',     key: null,                  color: 'var(--cat-mind)',   icon: Shield },
          ];
          // Measured by key prefix: plans are stored per account (zenith_subscription__<uid>)
          const getSize = (key: string | null) =>
            key ? Object.keys(localStorage).filter(k => k === key || k.startsWith(key + '__'))
                    .reduce((a, k) => a + new Blob([localStorage.getItem(k) || '']).size, 0)
              : API_PROVIDERS.reduce((a, p) => a + new Blob([getApiKey(p.id as Provider)]).size, 0);
          const sizes = items.map(i => getSize(i.key));
          const total = sizes.reduce((a, b) => a + b, 0);
          const usage = driveQuota?.usage ?? 0;
          const limit = driveQuota?.limit ?? null;
          const fmt = (b: number) =>
            b < 1024 ? `${b} B`
            : b < 1048576 ? `${(b / 1024).toFixed(1)} KB`
            : b < 1073741824 ? `${(b / 1048576).toFixed(1)} MB`
            : `${(b / 1073741824).toFixed(1)} GB`;
          return (<>
            {intro('Storage', driveLinked ? 'Your files back up to your own Google Drive. O-Zenith keeps nothing on its own servers.' : 'Your data stays on this device. O-Zenith keeps nothing on its own servers.')}
            {quotaError && banner('error', quotaError)}

            {/* Google Drive */}
            {driveLinked ? (
              <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--surface)', borderRadius: '24px', padding: '24px', boxShadow: 'var(--shadow-raised)', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <Ring value={limit ? usage / limit : 0} size={104} label={limit ? `${fmt(usage)} of ${fmt(limit)} used` : 'Google Drive storage'}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '16px', lineHeight: '24px', color: 'var(--ink)' }}>{driveQuota ? fmt(usage) : '…'}</span>
                  <span className="t-caps" style={{ color: 'var(--ink-faint)' }}>used</span>
                </Ring>
                <div style={{ minWidth: 0 }}>
                  <div className="t-caps" style={{ color: 'var(--ink-faint)' }}>Google Drive</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', lineHeight: '28px', fontWeight: 700, color: 'var(--ink)' }}>
                    {driveQuota ? (limit ? `${fmt(limit - usage)} free` : 'Unlimited') : 'Reading…'}
                  </div>
                  {limit && <div style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--ink-muted)' }}>of {fmt(limit)}</div>}
                  {gd.email && <div style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--ink-faint)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gd.email}</div>}
                </div>
              </div>
            ) : isNativeApp() ? (
              emptyState(CloudUpload, 'Google Drive isn’t linked',
                'Google sign-in is only available on the O-Zenith website. Link Drive there to see your Drive storage and back up files.',
                null, '#1A73E8')
            ) : (
              emptyState(CloudUpload, 'Link Google Drive',
                'See your used and free Drive space here, and back up the files you upload.',
                <button type="button" onClick={() => connectGoogleDrive('/dashboard/profile?tab=storage')} style={{ height: '56px', padding: '0 32px', borderRadius: '24px', border: 'none', cursor: 'pointer', background: '#1A73E8', color: '#FFFFFF', fontSize: '16px', fontWeight: 700, width: isMobile ? '100%' : 'auto' }}>
                  Link Google Drive
                </button>, '#1A73E8')
            )}

            {group(`On this device · ${fmt(total)}`,
              items.map((item, i) => {
                const pct = total > 0 ? (sizes[i] / total) * 100 : 0;
                return (
                  <div key={item.label}>
                    {i > 0 && divider()}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', minHeight: '64px' }}>
                      {disc(item.icon, item.color)}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '16px', lineHeight: '24px', color: 'var(--ink)' }}>{item.label}</span>
                          <span style={{ fontSize: '14px', lineHeight: '24px', color: 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmt(sizes[i])}</span>
                        </div>
                        <div style={{ height: '6px', borderRadius: '9999px', background: 'var(--surface-high)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: '100%', background: item.color, borderRadius: '9999px', transform: `scaleX(${pct / 100})`, transformOrigin: 'left', transition: 'transform var(--dur-spring) var(--ease-spring)' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }),
              'PDF tools run in your browser and files are never uploaded to O-Zenith. AI tools send document text only to the AI provider whose key you added.',
            )}

            {group(null,
              <button type="button"
                onClick={() => {
                  if (window.confirm('Clear app data on this device? Recent history, favorites and saved files are deleted. You stay signed in, and your plan and API keys are kept.')) {
                    const keysToKeep = new Set([
                      'zenith_session', 'zenith_users', 'zenith_subscription',
                      'zenith_dark', 'zenith_google_drive', 'zenith_avatar',
                      ...API_PROVIDERS.map(p => p.storageKey),
                    ]);
                    Object.keys(localStorage)
                      .filter(k =>
                        k.startsWith('zenith_') && !keysToKeep.has(k) &&
                        // Preserve per-account API keys and paid plans across a data-clear
                        !k.startsWith('zenith_apikey_') &&
                        !k.startsWith('zenith_subscription__'))
                      .forEach(k => localStorage.removeItem(k));
                    showToast('App data cleared.');
                    window.location.reload();
                  }
                }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', minHeight: '60px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: 'var(--danger)', fontSize: '16px', fontWeight: 600 }}>
                <span aria-hidden style={{ width: '36px', height: '36px', borderRadius: '9999px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--danger-bg)', color: 'var(--danger)' }}><Trash2 size={18} /></span>
                Clear app data
              </button>,
              'Removes history, favorites and saved files from this device. Your account, plan and API keys stay.',
            )}
          </>);
        })()}

        {/* ════════════════ SUPPORT ════════════════ */}
        {activeTab === 'support' && (() => {
          const platform = isNativeApp() ? 'iOS app' : 'Web';
          const mail = (subject: string, body = '') =>
            `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
          const reportBody = `What happened:\n\n\nWhat I expected:\n\n\nSteps to get there:\n1. \n\n— \nO-Zenith · ${platform} · ${navigator.userAgent}`;
          const linkRow = (href: string, Icon: React.ElementType, title: string, detail: string, first: boolean) => (
            <>
              {!first && divider()}
              <a href={href} style={{ display: 'flex', alignItems: 'center', gap: '14px', minHeight: '64px', padding: '10px 16px', color: 'var(--ink)', textDecoration: 'none' }}>
                {disc(Icon)}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '16px', lineHeight: '24px', fontWeight: 500 }}>{title}</span>
                  <span style={{ display: 'block', fontSize: '14px', lineHeight: '20px', color: 'var(--ink-muted)' }}>{detail}</span>
                </span>
                <ChevronRight size={18} style={{ color: 'var(--chevron)', flexShrink: 0 }} />
              </a>
            </>
          );
          const faqs: { q: string; a: React.ReactNode }[] = [
            { q: 'Do my files get uploaded anywhere?',
              a: <>No — every tool runs on your device. A file only leaves it when you choose to: saving it to your Google Drive, or asking Chat or an AI tool about it (its text goes straight to the AI provider of your own key).</> },
            { q: 'Where are my files kept?',
              a: <>In O-Zenith’s storage on this device, under Files. If you link Google Drive, you can also keep copies in a “{APP_DRIVE_FOLDER}” folder in your Drive.</> },
            { q: 'How do the AI features work?',
              a: <>They use your own API key from OpenAI, Anthropic, Gemini, Groq, O-Zenith AI Gateway or DeepSeek — add it under API keys (PRO). Usage is billed by that provider, not by O-Zenith.</> },
            { q: 'I forgot a folder password',
              a: <>It can’t be recovered or reset — O-Zenith only keeps a scrambled check of it, never the password itself. When you lock a folder, pick one you’ll remember.</> },
            { q: 'What does the free plan include?',
              a: <>{FREE_USES_LIMIT} free uses across the {[...FREE_CATEGORIES].map(categoryName).join(', ')} tools. PRO unlocks all {TOTAL_TOOLS} tools, the AI features and Google Drive backup.</> },
            { q: 'Google Drive says the session expired',
              a: <>Google sign-ins last about an hour. Your Drive is still linked — tap Resume session in Files to carry on.</> },
          ];
          return (<>
            {intro('Support', 'Answers to common questions, and a direct line to us.')}

            {group('Contact us', <>
              {linkRow(mail('O-Zenith support'), Mail, 'Email support', SUPPORT_EMAIL, true)}
              {linkRow(mail('O-Zenith problem report', reportBody), Bug, 'Report a problem', 'Opens an email with your device details filled in', false)}
            </>, 'Both open your email app, so you see everything before it’s sent. Don’t include passwords or API keys.')}

            {group('Common questions', faqs.map((f, i) => (
              <details key={f.q} className="faq">
                <summary style={{ position: 'relative', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', padding: '0 16px', cursor: 'pointer', fontSize: '16px', lineHeight: '22px', fontWeight: 500, color: 'var(--ink)' }}>
                  {i > 0 && <span aria-hidden style={{ position: 'absolute', top: 0, left: '16px', right: '16px', height: '1px', background: 'var(--hairline)' }} />}
                  <span style={{ flex: 1, padding: '14px 0' }}>{f.q}</span>
                  <ChevronDown className="faq-chevron" size={18} style={{ color: 'var(--chevron)', flexShrink: 0 }} />
                </summary>
                <p style={{ margin: 0, padding: '0 16px 16px', fontSize: '14px', lineHeight: '20px', color: 'var(--ink-muted)' }}>{f.a}</p>
              </details>
            )))}

            <p style={{ margin: 0, textAlign: 'center', fontSize: '12px', lineHeight: '16px', color: 'var(--ink-faint)' }}>
              O-Zenith · {TOTAL_TOOLS} tools · {platform}
            </p>
          </>);
        })()}

        {/* ════════════════ POLICIES ════════════════ */}
        {activeTab === 'policies' && (() => {
          // Plain-language summary of what the code actually does — keep it in
          // step with docs/DECISIONS.md, never with marketing copy.
          const point = (Icon: React.ElementType, title: string, text: React.ReactNode, first: boolean, color?: string) => (
            <>
              {!first && divider()}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '16px' }}>
                {disc(Icon, color)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '16px', lineHeight: '24px', fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
                  <div style={{ marginTop: '2px', fontSize: '14px', lineHeight: '20px', color: 'var(--ink-muted)' }}>{text}</div>
                </div>
              </div>
            </>
          );
          const docRow = (to: string, title: string, first: boolean) => (
            <>
              {!first && divider()}
              <button type="button" onClick={() => navigate(to)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', minHeight: '60px', padding: '0 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: 'var(--ink)', fontSize: '16px', fontWeight: 500 }}>
                {disc(FileText)}
                <span style={{ flex: 1 }}>{title}</span>
                <ChevronRight size={18} style={{ color: 'var(--chevron)', flexShrink: 0 }} />
              </button>
            </>
          );
          return (<>
            {intro('Policies', 'The short version, in plain words. The full documents are below.')}

            {group('Your privacy', <>
              {point(Smartphone, 'Your files stay on your device', 'Every tool works on your phone or computer. O-Zenith has no servers your files are sent to.', true)}
              {point(Cloud, 'Google Drive, only if you link it', <>Files you choose to save there go to a “{APP_DRIVE_FOLDER}” folder in your Drive. A private file in the app’s Drive folder keeps your plan and API keys in step across your devices.</>, false, '#1A73E8')}
              {point(Sparkles, 'AI features use your own key', 'When you ask Chat or an AI tool about a file, its text and your question go straight from your device to that AI provider, under their terms.', false, '#A855F7')}
              {point(Ban, 'No ads, no tracking', 'O-Zenith shows no ads and contains no tracking or analytics code.', false)}
              {point(Lock, 'Folder passwords', 'Only a scrambled check of each password is kept, on this device. A locked folder stays closed inside O-Zenith — its files aren’t encrypted.', false)}
            </>)}

            {group('Using O-Zenith', <>
              {point(FileText, 'Your files remain yours', 'O-Zenith claims no rights over anything you open, create or convert.', true)}
              {point(Shield, 'Use it lawfully', 'Only process documents you have the right to use, and don’t use O-Zenith to break the law.', false)}
              {point(AlertCircle, 'Check important results', 'Converted documents and AI answers can contain mistakes — review anything that matters before you rely on it.', false, 'var(--warn)')}
              {point(CreditCard, 'Plans and billing', 'Plans, renewals and refunds are covered in full in the Terms of Service.', false)}
            </>)}

            {group('Full documents', <>
              {docRow('/dashboard/privacy', 'Privacy Policy', true)}
              {docRow('/dashboard/terms', 'Terms of Service', false)}
            </>, <>Questions about privacy or these terms? Email <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>{SUPPORT_EMAIL}</a>.</>)}
          </>);
        })()}
      </div>
        );
      })()}
      </div>
    </div>
  );
};

export default Profile;
