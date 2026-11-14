import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Search, Star, ChevronLeft, RefreshCw, X, CornerDownLeft, Sparkles,
} from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useKeyboardOpen } from '../../hooks/useKeyboard';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, useCallback, useMemo, type FormEvent } from 'react';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useToast } from '../../hooks/useToast';
import { CHATS_FULL_EVENT } from '../../utils/chatStore';
import { useAuth } from '../../context/AuthContext';
import { toolsData } from '../../data/toolsData';
import { addActiveSeconds } from '../../utils/activityTracker';
import { syncThemeToDom } from '../../utils/theme';
import FluidSilkCanvas from '../canvas/FluidSilkCanvas';
import ViewportScrollBlur from './ViewportScrollBlur';
import './DashboardMonochrome.css';

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return text;
  const q = query.trim().toLowerCase();
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);
  return (
    <>
      {before}
      <span className="glass-dropdown-highlight">{match}</span>
      {after}
    </>
  );
}

const DashboardLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile(768);

  const mainRef = useRef<HTMLElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const full = () => showToast('Storage is full. Delete some chats or files to keep saving.', 'error');
    window.addEventListener(CHATS_FULL_EVENT, full);
    return () => window.removeEventListener(CHATS_FULL_EVENT, full);
  }, [showToast]);

  const pageRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef<HTMLDivElement>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const screenKey = location.pathname + (location.pathname === '/dashboard/profile' ? location.search : '');
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [screenKey]);

  useEffect(() => {
    const TICK = 10;
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') addActiveSeconds(TICK);
    }, TICK * 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    syncThemeToDom();
  }, []);

  // Header Search state
  const [headerSearch, setHeaderSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHovered, setSearchHovered] = useState(false);
  const isSearchExpanded = searchHovered || searchFocused || Boolean(headerSearch);
  const [activeIdx, setActiveIdx] = useState(0);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const toolId = (name: string) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // Global ⌘K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchFocused(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // 4 Popular quick launch tools for empty state
  const POPULAR_TOOLS = useMemo(() => {
    const popularNames = ['Compress PDF', 'Merge PDF', 'AI Summarize PDF', 'PDF to Word'];
    return popularNames
      .map((name) => toolsData.find((t) => t.name.toLowerCase() === name.toLowerCase()))
      .filter((t): t is typeof toolsData[0] => Boolean(t));
  }, []);

  const matches = useMemo(() => {
    const q = headerSearch.trim().toLowerCase();
    if (!q) return [];
    return toolsData
      .filter((t) => t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q))
      .slice(0, 6);
  }, [headerSearch]);

  const currentItems = matches.length > 0 ? matches : (!headerSearch.trim() ? POPULAR_TOOLS : []);

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = (e instanceof MouseEvent ? e.target : (e as TouchEvent).touches?.[0]?.target) as Node | null;
      if (searchBoxRef.current && target && !searchBoxRef.current.contains(target)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, []);

  const goToTool = (name: string) => {
    setHeaderSearch('');
    setActiveIdx(0);
    setSearchFocused(false);
    searchInputRef.current?.blur();
    navigate(`/dashboard/tools/${toolId(name)}`);
  };

  const handleHeaderSearch = (e: FormEvent) => {
    e.preventDefault();
    if (currentItems.length > 0) {
      goToTool(currentItems[activeIdx]?.name ?? currentItems[0].name);
      return;
    }
    if (headerSearch.trim()) {
      navigate(`/dashboard/tools?q=${encodeURIComponent(headerSearch.trim())}`);
      setHeaderSearch('');
      setActiveIdx(0);
      setSearchFocused(false);
      searchInputRef.current?.blur();
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!currentItems.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % currentItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + currentItems.length) % currentItems.length);
    } else if (e.key === 'Escape') {
      setSearchFocused(false);
      searchInputRef.current?.blur();
    }
  };

  // Center horizontal nav links
  const navLinks = [
    { path: '/dashboard', label: 'Home' },
    { path: '/dashboard/tools', label: 'Tools' },
    { path: '/dashboard/ai', label: 'Chat' },
    { path: '/dashboard/files', label: 'Files' },
    { path: '/dashboard/favorites', label: 'Favorites' },
  ];

  const isActive = (path: string) =>
    path === '/dashboard'
      ? location.pathname === path
      : location.pathname === path || location.pathname.startsWith(path + '/');

  // Mobile navigation detection
  const TAB_ROOTS = ['/dashboard', '/dashboard/tools', '/dashboard/ai', '/dashboard/files', '/dashboard/favorites'];
  const params = new URLSearchParams(location.search);
  const ACCOUNT_SECTIONS: Record<string, string> = {
    personal: 'Personal info',
    appearance: 'Appearance',
    settings: 'API keys',
    security: 'Security',
    subscription: 'Subscription',
    storage: 'Storage',
    support: 'Support',
    policies: 'Policies',
  };
  const accountSection =
    location.pathname === '/dashboard/profile'
      ? params.get('section') ?? (params.get('tab') === 'api-keys' ? 'settings' : null)
      : null;
  const isTabRoot = TAB_ROOTS.includes(location.pathname.replace(/\/$/, '') || '/dashboard') && !accountSection;

  const pushedTitle = location.pathname.startsWith('/dashboard/tools/')
    ? toolsData.find((t) => toolId(t.name) === location.pathname.split('/')[3])?.name ?? 'Tool'
    : location.pathname.startsWith('/dashboard/tools-filter')
      ? 'Filter'
      : location.pathname.startsWith('/dashboard/ai/')
        ? 'Chat'
        : location.pathname.startsWith('/dashboard/favorites')
          ? 'Favorites'
          : location.pathname.startsWith('/dashboard/subscription')
            ? 'Plans'
            : location.pathname.startsWith('/dashboard/privacy')
              ? 'Privacy Policy'
              : location.pathname.startsWith('/dashboard/terms')
                ? 'Terms of Service'
                : accountSection
                  ? ACCOUNT_SECTIONS[accountSection] ?? 'Account'
                  : location.pathname.startsWith('/dashboard/profile')
                    ? 'Account'
                    : '';

  const keyboardOpen = useKeyboardOpen() && isMobile;
  const showTabBar = isMobile && isTabRoot && !keyboardOpen;

  const refreshPage = useCallback(() => {
    setRefreshKey((k) => k + 1);
    window.dispatchEvent(new Event('zenith-refresh'));
  }, []);

  const inChat = location.pathname.startsWith('/dashboard/ai/');
  const isChatRoute = location.pathname.startsWith('/dashboard/ai');
  const inTool = location.pathname.startsWith('/dashboard/tools/');
  usePullToRefresh(mainRef, pageRef, pullRef, refreshPage, isMobile && !keyboardOpen && !inChat && !inTool);

  const goBack = () => {
    if (location.key !== 'default') navigate(-1);
    else
      navigate(
        location.pathname.startsWith('/dashboard/tools')
          ? '/dashboard/tools'
          : location.pathname.startsWith('/dashboard/ai/')
            ? '/dashboard/ai'
            : accountSection
              ? '/dashboard/profile'
              : '/dashboard'
      );
  };

  // Avatar resolution: fallback to 'S' (or user initial) as high-contrast badge
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => localStorage.getItem('zenith_avatar'));
  useEffect(() => {
    const handler = (e: Event) => setAvatarUrl((e as CustomEvent<string>).detail);
    window.addEventListener('zenith-avatar-updated', handler);
    return () => window.removeEventListener('zenith-avatar-updated', handler);
  }, []);

  const avatarInitial = user?.name ? user.name.trim()[0].toUpperCase() : 'S';

  return (
    <div
      className="dvh-screen min-h-screen w-full flex flex-col relative overflow-hidden transition-colors duration-300"
      style={{
        backgroundColor: 'var(--dash-bg, #000000)',
        color: 'var(--dash-text, #ffffff)',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {/* ═══════════════════════════════════════════════════════════════════════════
          GPU WEBGL FLUID SILK SHADER CANVAS
          ═══════════════════════════════════════════════════════════════════════════ */}
      <FluidSilkCanvas />

      {/* ═══════════════════════════════════════════════════════════════════════════
          GLOBAL TOP & BOTTOM VIEWPORT PROGRESSIVE SCROLL BLUR (Z-40)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <ViewportScrollBlur />
      {/* ═══════════════════════════════════════════════════════════════════════════
          BORDERLESS FLOATING TOP GLASS BAR (CENTERED ARCHITECTURE, PT-6 PB-2)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <header
        className="sticky top-0 z-50 w-full apple-glass-nav border-none border-b-0 shadow-none bg-transparent"
        style={{
          background: 'transparent',
          border: 'none',
          borderBottom: 0,
          boxShadow: 'none',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
      >
        <div
          className={`w-full flex items-center justify-between transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] apple-nav-container ${
            isChatRoute
              ? 'is-chat-nav max-w-[100vw] mx-auto px-5 pt-3.5 pb-2'
              : 'max-w-[1152px] mx-auto px-4 sm:px-10 pt-3 sm:pt-5 pb-2 sm:pb-3'
          }`}
        >
          {/* Mobile Back button for pushed screens */}
          {isMobile && !isTabRoot ? (
            <div className="apple-mobile-header flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={goBack}
                  aria-label="Back"
                  className="apple-back-btn"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="apple-pushed-title">{pushedTitle}</span>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  to="/dashboard/profile"
                  aria-label="Account"
                  className="w-9 h-9 rounded-full glass-user-avatar font-bold text-sm flex items-center justify-center hover:opacity-90 transition-opacity overflow-hidden"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    avatarInitial
                  )}
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Left Column — Brand Mark */}
              <div className="flex items-center">
                <Link
                  to="/dashboard"
                  className="text-sm sm:text-[15px] font-bold tracking-[0.24em] select-none hover:opacity-85 transition-opacity apple-brand-mark"
                  style={{ textDecoration: 'none', letterSpacing: '0.24em' }}
                >
                  O-ZENITH
                </Link>
              </div>

              {/* Center Column — Apple-Style Floating Glass Pill Dock with Liquid-Stretch Active Pill */}
              <nav className="hidden md:flex items-center gap-3 apple-center-dock">
                {navLinks.map((link) => {
                  const active = isActive(link.path);
                  return (
                    <Link
                      key={link.path}
                      to={link.path}
                      onMouseMove={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        const dx = (e.clientX - (r.left + r.width / 2)) * 0.15;
                        const dy = (e.clientY - (r.top + r.height / 2)) * 0.15;
                        e.currentTarget.style.setProperty('--mag-x', `${Math.max(-3, Math.min(3, dx)).toFixed(1)}px`);
                        e.currentTarget.style.setProperty('--mag-y', `${Math.max(-3, Math.min(3, dy)).toFixed(1)}px`);
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.setProperty('--mag-x', '0px');
                        e.currentTarget.style.setProperty('--mag-y', '0px');
                      }}
                      className={`apple-nav-link ${active ? 'is-active' : ''}`}
                    >
                      {active && (
                        <motion.div
                          layoutId="navbar-pill"
                          className="apple-nav-link-bg"
                          transition={{ type: 'spring', stiffness: 380, damping: 24, mass: 0.8 }}
                        />
                      )}
                      {link.label}
                    </Link>
                  );
                })}
              </nav>

              {/* Right Column — Search & User Utilities */}
              <div className="flex items-center gap-3 apple-nav-actions">
                {/* Sleek Expanding Glass Search */}
                <div
                  ref={searchBoxRef}
                  className="relative flex items-center apple-search-wrapper"
                  onMouseEnter={() => setSearchHovered(true)}
                  onMouseLeave={() => setSearchHovered(false)}
                >
                  <form onSubmit={handleHeaderSearch} className="m-0 p-0 flex items-center apple-search-form">
                    <div
                      className={`glass-search-control ${isSearchExpanded ? 'is-expanded' : 'is-collapsed'}`}
                      onClick={() => {
                        searchInputRef.current?.focus();
                        setSearchFocused(true);
                      }}
                    >
                      <span className="glass-search-icon-wrapper" aria-hidden="true">
                        <Search size={15} className="glass-search-icon" />
                      </span>
                      <div className={`glass-search-input-wrap ${isSearchExpanded ? 'opacity-100' : 'w-0 opacity-0 pointer-events-none'}`}>
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={headerSearch}
                          onChange={(e) => {
                            setHeaderSearch(e.target.value);
                            setActiveIdx(0);
                          }}
                          onFocus={() => setSearchFocused(true)}
                          onBlur={() => {
                            if (!headerSearch) setSearchFocused(false);
                          }}
                          onKeyDown={handleSearchKeyDown}
                          placeholder="Search tools..."
                          className="glass-search-input"
                          tabIndex={isSearchExpanded ? 0 : -1}
                        />
                        {headerSearch ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setHeaderSearch('');
                              setActiveIdx(0);
                              searchInputRef.current?.focus();
                            }}
                            className="glass-search-clear-btn"
                            aria-label="Clear search"
                          >
                            <X size={13} />
                          </button>
                        ) : (
                          <span className="glass-search-shortcut-badge">⌘K</span>
                        )}
                      </div>
                    </div>
                  </form>

                  {/* Frosted-Glass Live Suggestions Popover */}
                  {searchFocused && (
                    <div className="glass-search-dropdown shadow-2xl">
                      {headerSearch.trim() === '' ? (
                        <>
                          <div className="glass-dropdown-section-header flex items-center gap-1.5">
                            <Sparkles size={11} />
                            <span>Quick Launch / Popular</span>
                          </div>
                          {POPULAR_TOOLS.map((t, i) => {
                            const Icon = t.icon;
                            const active = i === activeIdx;
                            return (
                              <button
                                key={t.name}
                                type="button"
                                onMouseEnter={() => setActiveIdx(i)}
                                onClick={() => goToTool(t.name)}
                                className={`glass-dropdown-item ${active ? 'is-active' : ''}`}
                              >
                                <span className="glass-dropdown-icon">
                                  <Icon size={14} />
                                </span>
                                <span className="glass-dropdown-meta">
                                  <span className="glass-dropdown-title">
                                    <span>{t.name}</span>
                                    <span className="glass-dropdown-badge">{t.category}</span>
                                  </span>
                                  <span className="glass-dropdown-desc">{t.desc}</span>
                                </span>
                                {active && (
                                  <CornerDownLeft size={13} className="glass-dropdown-return-icon" />
                                )}
                              </button>
                            );
                          })}
                        </>
                      ) : matches.length === 0 ? (
                        <div className="p-4 text-xs text-center opacity-60">
                          No tools match “{headerSearch.trim()}”
                        </div>
                      ) : (
                        <>
                          <div className="glass-dropdown-section-header">
                            Tools matching “{headerSearch.trim()}”
                          </div>
                          {matches.map((t, i) => {
                            const Icon = t.icon;
                            const active = i === activeIdx;
                            return (
                              <button
                                key={t.name}
                                type="button"
                                onMouseEnter={() => setActiveIdx(i)}
                                onClick={() => goToTool(t.name)}
                                className={`glass-dropdown-item ${active ? 'is-active' : ''}`}
                              >
                                <span className="glass-dropdown-icon">
                                  <Icon size={14} />
                                </span>
                                <span className="glass-dropdown-meta">
                                  <span className="glass-dropdown-title">
                                    <span>{highlightMatch(t.name, headerSearch)}</span>
                                    <span className="glass-dropdown-badge">{t.category}</span>
                                  </span>
                                  <span className="glass-dropdown-desc">{t.desc}</span>
                                </span>
                                {active && (
                                  <CornerDownLeft size={13} className="glass-dropdown-return-icon" />
                                )}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => {
                              navigate(`/dashboard/tools?q=${encodeURIComponent(headerSearch.trim())}`);
                              setHeaderSearch('');
                              setActiveIdx(0);
                              setSearchFocused(false);
                              searchInputRef.current?.blur();
                            }}
                            className="glass-dropdown-see-all"
                          >
                            See all results for “{headerSearch.trim()}”
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Star Icon Button (Starred Files) */}
                <Link
                  to="/dashboard/files?tab=starred"
                  title="Starred files"
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white/[0.04] border border-white/[0.09] text-white/70 hover:text-white hover:bg-white/[0.08] transition-all duration-200 glass-star-btn"
                  style={{ textDecoration: 'none' }}
                >
                  <Star
                    size={15}
                    fill={
                      location.pathname === '/dashboard/files' && location.search.includes('tab=starred')
                        ? 'currentColor'
                        : 'none'
                    }
                  />
                </Link>

                {/* User Avatar Badge */}
                <Link
                  to="/dashboard/profile"
                  aria-label="Account"
                  className="w-10 h-10 rounded-full font-bold text-sm flex items-center justify-center hover:opacity-90 transition-opacity overflow-hidden glass-user-avatar"
                  style={{ textDecoration: 'none' }}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    avatarInitial
                  )}
                </Link>
              </div>
            </>
          )}
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════════
          PAGE CONTENT (ONLY SCROLLABLE AREA)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <main
        ref={mainRef}
        className={
          isChatRoute
            ? "flex-1 min-h-0 h-full overflow-hidden relative flex flex-col p-0"
            : "flex-1 overflow-y-auto overflow-x-hidden relative pb-20 md:pb-0"
        }
        style={{
          WebkitOverflowScrolling: 'touch',
          paddingBottom: !isChatRoute && isMobile && showTabBar ? 'calc(76px + var(--island-bottom, 12px))' : undefined,
        }}
      >
        {isMobile && !isChatRoute && (
          <div ref={pullRef} className="ptr" aria-hidden>
            <RefreshCw size={18} />
          </div>
        )}
        <div ref={pageRef} className={`w-full h-full relative z-10 ${isChatRoute ? 'flex flex-col overflow-hidden p-0' : ''}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname + ':' + refreshKey}
              initial={{ opacity: 0, y: isChatRoute ? 0 : 6, filter: 'blur(3px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: isChatRoute ? 0 : -4, filter: 'blur(2px)' }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className={`w-full h-full ${isChatRoute ? 'flex flex-col overflow-hidden p-0' : ''}`}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* ── Mobile Floating Glass Tab Dock (< 768px) ── */}
      {showTabBar && (
        <nav
          aria-label="Main"
          className="tab-island fixed bottom-3 inset-x-3 z-50 h-14 rounded-2xl flex items-center justify-around px-1.5 md:hidden"
        >
          {navLinks.map((t) => {
            const active = isActive(t.path);
            return (
              <Link
                key={t.path}
                to={t.path}
                aria-current={active ? 'page' : undefined}
                className={`tab-island-link ${active ? 'is-active' : ''}`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
};

export default DashboardLayout;
