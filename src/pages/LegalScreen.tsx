import { useNavigate, useParams, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft } from 'lucide-react';
import PrivacyPolicy from './public/PrivacyPolicy';
import Terms from './public/Terms';

/* Privacy Policy / Terms of Service as an app screen: a pinned bar with a
   round back button and the title, then the document. Works signed in or
   out, so the Welcome and sign-up screens can link here instead of to the
   website pages. */
const DOCS = { privacy: { title: 'Privacy Policy', Doc: PrivacyPolicy }, terms: { title: 'Terms of Service', Doc: Terms } } as const;

const LegalScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { doc } = useParams<{ doc: string }>();
  const entry = doc && Object.hasOwn(DOCS, doc) ? DOCS[doc as keyof typeof DOCS] : null;
  if (!entry) return <Navigate to="/dashboard" replace />;
  // Back within the app when there is an in-app page to return to; never off-site
  const back = () => (location.key !== 'default' ? navigate(-1) : navigate(isAuthenticated ? '/dashboard' : '/welcome', { replace: true }));
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--canvas)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: '12px',
        padding: 'calc(env(safe-area-inset-top) + 8px) 16px 10px', background: 'color-mix(in srgb, var(--canvas) 88%, transparent)',
        backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)' }}>
        <button type="button" onClick={back} aria-label="Back"
          style={{ flexShrink: 0, width: '44px', height: '44px', borderRadius: '9999px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-high)', color: 'var(--ink)' }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '20px', lineHeight: '28px', fontWeight: 700, color: 'var(--ink)' }}>{entry.title}</span>
      </header>
      <div style={{ padding: '0 20px calc(env(safe-area-inset-bottom) + 24px)' }}>
        <entry.Doc embedded />
      </div>
    </div>
  );
};

export default LegalScreen;
