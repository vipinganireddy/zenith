import { useLayoutEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import AuthLayout from './components/layout/AuthLayout';
import DashboardLayout from './components/layout/DashboardLayout';

// Legal Documents (Embedded in app)
import PrivacyPolicy from './pages/public/PrivacyPolicy';
import Terms from './pages/public/Terms';

// Auth Pages
import Welcome from './pages/auth/Welcome';
import { syncThemeToDom } from './utils/theme';
import LegalScreen from './pages/LegalScreen';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';

// Dashboard Pages
import DashboardHome from './pages/dashboard/DashboardHome';
import Tools from './pages/dashboard/Tools';
import ToolsFilter from './pages/dashboard/ToolsFilter';
import ToolWorkspace from './pages/dashboard/ToolWorkspace';
import AIWorkspace from './pages/dashboard/AIWorkspace';
import Files from './pages/dashboard/Files';
import Profile from './pages/dashboard/Profile';
import Favorites from './pages/dashboard/Favorites';
import Subscription from './pages/dashboard/Subscription';
import { UpdatePrompt } from './components/pwa/InstallApp';
import ErrorBoundary from './components/ErrorBoundary';

// ─── Spinner ─────────────────────────────────────────────────────────────────
const LoadingScreen = () => (
  <div style={{
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: 'var(--bg-main)',
    flexDirection: 'column', gap: '16px',
  }}>
    <div style={{
      width: '44px', height: '44px', border: '3px solid var(--border-color)',
      borderTopColor: 'var(--primary)', borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>Loading…</p>
  </div>
);

// ─── Root & Legacy Marketing Redirect ─────────────────────────────────────────
// If authenticated -> /dashboard; if not authenticated -> /login
const RootRedirect = () => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
};

// ─── Auth Guard ───────────────────────────────────────────────────────────────
const RequireAuth = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <LoadingScreen />;
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} />;
};

// ─── Guest Only (redirect if already logged in) ───────────────────────────────
const GuestOnly = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const from = (useLocation().state as { from?: { pathname: string; search?: string } } | null)?.from;
  if (isLoading) return null;
  const target = from?.pathname?.startsWith('/dashboard') ? from.pathname + (from.search ?? '') : '/dashboard';
  return isAuthenticated ? <Navigate to={target} replace /> : <Outlet />;
};

// ─── App ─────────────────────────────────────────────────────────────────────
function App() {
  useLayoutEffect(() => {
    syncThemeToDom();
  }, []);

  return (
    <AuthProvider>
      <SubscriptionProvider>
        <FavoritesProvider>
          <Router>
            <UpdatePrompt />
            <ErrorBoundary>
              <Routes>
              {/* Root & Legacy Marketing Redirects -> /dashboard or /login */}
              <Route path="/" element={<RootRedirect />} />
              <Route path="/features" element={<RootRedirect />} />
              <Route path="/pricing" element={<RootRedirect />} />
              <Route path="/tools" element={<RootRedirect />} />
              <Route path="/about" element={<RootRedirect />} />
              <Route path="/contact" element={<RootRedirect />} />
              <Route path="/blog" element={<RootRedirect />} />
              <Route path="/privacy" element={<Navigate to="/legal/privacy" replace />} />
              <Route path="/terms" element={<Navigate to="/legal/terms" replace />} />

              {/* In-App Legal Screen */}
              <Route path="/legal/:doc" element={<LegalScreen />} />

              {/* Auth Routes */}
              <Route element={<GuestOnly />}>
                <Route path="/welcome" element={<Welcome />} />
                <Route element={<AuthLayout />}>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                </Route>
              </Route>

              {/* Protected Dashboard Routes */}
              <Route element={<RequireAuth />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/dashboard" element={<DashboardHome />} />
                  <Route path="/dashboard/tools" element={<Tools />} />
                  <Route path="/dashboard/tools-filter" element={<ToolsFilter />} />
                  {/* Legacy tool redirect */}
                  <Route path="/dashboard/tools/chat-with-pdf" element={<Navigate to="/dashboard/ai" replace />} />
                  <Route path="/dashboard/tools/:toolId" element={<ToolWorkspace />} />
                  <Route path="/dashboard/ai" element={<AIWorkspace />} />
                  <Route path="/dashboard/ai/:chatId" element={<AIWorkspace />} />
                  <Route path="/dashboard/files" element={<Files />} />
                  <Route path="/dashboard/profile" element={<Profile />} />
                  <Route path="/dashboard/favorites" element={<Favorites />} />
                  <Route path="/dashboard/subscription" element={<Subscription />} />
                  <Route path="/dashboard/privacy" element={<PrivacyPolicy embedded />} />
                  <Route path="/dashboard/terms" element={<Terms embedded />} />
                </Route>
              </Route>

              {/* Catch-all — unknown URLs redirect to main app */}
              <Route path="*" element={<RootRedirect />} />
            </Routes>
          </ErrorBoundary>
        </Router>
        </FavoritesProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;
