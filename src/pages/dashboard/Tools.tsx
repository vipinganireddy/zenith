import { Search, Heart, Lock, Crown, Zap, SlidersHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { categories, toolsData } from '../../data/toolsData';
import { readFilter, filterQuery, applyFilter, activeFilterCount, type ToolFilter } from '../../utils/toolFilters';
import { useFavorites } from '../../context/FavoritesContext';
import { useSubscription, FREE_CATEGORIES } from '../../context/SubscriptionContext';
import { useToast } from '../../hooks/useToast';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  handleGlassMouseMove,
  handleGlassMouseDown,
  handleGlassMouseUp,
  handleGlassMouseLeave,
} from '../../utils/glassPhysics';
import GateModal from '../../components/GateModal';
import type { AccessResult } from '../../context/SubscriptionContext';


const Tools = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { showToast } = useToast();
  const {
    isFree, isPaid,
    freeUsesLeft,
    checkAccess,
  } = useSubscription();

  const isMobile = useIsMobile(768);
  // Category + sort live in the URL so the filter page can set them (utils/toolFilters)
  const filter = readFilter(searchParams);
  const activeCategory = filter.cat;
  const applyFilterChange = (next: ToolFilter) =>
    setSearchParams(new URLSearchParams(filterQuery(next, searchQuery).slice(1)), { replace: true });
  const setActiveCategory = (cat: string) => applyFilterChange({ ...filter, cat });
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '');
  const [gateReason, setGateReason] = useState<AccessResult | null>(null);
  const [gateTool, setGateTool] = useState<string | undefined>();

  const filtersOn = activeFilterCount(filter);
  const openFilter = () => navigate(`/dashboard/tools-filter${filterQuery(filter, searchQuery)}`);

  // Pre-populate search from URL param
  const urlQuery = searchParams.get('q');
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    if (urlQuery) setSearchQuery(urlQuery);
  }

  const getToolId = (name: string) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const filteredTools = useMemo(
    () => applyFilter(toolsData, filter, searchQuery),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `filter` is rebuilt each render; its fields are the real deps
    [filter.cat, filter.sort, searchQuery],
  );

  const handleFav = (e: React.MouseEvent, toolName: string) => {
    e.stopPropagation();
    const id = getToolId(toolName);
    const result = toggleFavorite(id, toolName);
    showToast(result === 'added' ? `❤️ "${toolName}" saved to Favorites` : `Removed "${toolName}" from Favorites`);
  };

  const handleToolClick = (tool: typeof toolsData[0]) => {
    const toolId = getToolId(tool.name);
    const access = checkAccess(tool.category, toolId);

    if (access === 'allowed') {
      navigate(`/dashboard/tools/${toolId}`);
    } else {
      setGateTool(tool.name);
      setGateReason(access);
    }
  };

  // Determine lock state for a tool card — purely category-based
  const getToolLock = (tool: typeof toolsData[0]): { locked: boolean; badge: string | null } => {
    if (isPaid) return { locked: false, badge: null };
    // Free user — only FREE_CATEGORIES are accessible
    if (!FREE_CATEGORIES.has(tool.category)) {
      return { locked: true, badge: 'PRO' };
    }
    if (freeUsesLeft <= 0) {
      return { locked: true, badge: 'PRO' };
    }
    return { locked: false, badge: null };
  };

  return (
    <div className="tools-page-container workspace-page-container max-w-6xl mx-auto px-6 sm:px-10 mt-4 mb-8 relative z-10" style={{ paddingBottom: '64px' }}>
      {/* ── Free plan upgrade banner ── */}
      {isFree && (
        <div
          className="rounded-[24px] bg-[#070C18]/65 dark:bg-[#070C18]/65 light:bg-white/80 backdrop-blur-[40px] saturate-[180%] border border-white/[0.11] dark:border-white/[0.11] light:border-slate-900/[0.09] shadow-[0_24px_60px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.15)] light:shadow-[0_20px_50px_rgba(15,23,42,0.07),inset_0_1px_0_0_#FFFFFF] p-4 sm:p-6 mb-6 flex items-center justify-between gap-4 flex-wrap text-slate-900 dark:text-white"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              className="w-10 h-10 rounded-xl bg-[#0297DE]/15 border border-[#0297DE]/30 text-[#0297DE] flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(2,151,222,0.2)]"
            >
              <Zap size={18} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>
                {freeUsesLeft > 0
                  ? `You're on the Free plan — ${freeUsesLeft}/3 free uses left`
                  : 'Your free uses are finished'}
              </div>
              {!isMobile && <div style={{ fontSize: '12px', opacity: 0.65, marginTop: '2px' }}>
                {freeUsesLeft > 0
                  ? '3 free uses in the Edit & Convert tools. Upgrade to PRO for unlimited access to every tool.'
                  : 'All tools are now locked. Upgrade to PRO for unlimited access to every tool.'}
              </div>}
            </div>
          </div>
          <button
            onClick={() => navigate('/dashboard/subscription')}
            style={{
              padding: isMobile ? '10px 18px' : '8px 20px', minHeight: isMobile ? '44px' : undefined, width: isMobile ? '100%' : undefined,
              background: '#0297DE',
              color: '#ffffff',
              border: 'none', borderRadius: '9999px',
              fontWeight: 600, fontSize: '13px', cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
              boxShadow: '0 0 20px rgba(2, 151, 222, 0.35)',
              transition: 'all 0.2s ease',
            }}
          >
            Upgrade to PRO
          </button>
        </div>
      )}

      {/* Header — on phones the search and category chips stay pinned while the list scrolls */}
      <div style={isMobile
        ? { position: 'sticky', top: '-12px', zIndex: 20, margin: '-12px -24px 0', padding: '12px 24px 16px', background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }
        : undefined}>
      <div style={{ textAlign: 'center', marginBottom: isMobile ? 0 : '32px' }}>
        {!isMobile && (
          <h1 className="tools-hero-heading text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            What do you want to do today?
          </h1>
        )}
        <div className="tools-search-wrapper" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div className="tools-search-bar" style={{ flex: 1, minWidth: 0 }}>
            <Search size={isMobile ? 16 : 18} style={{ color: 'rgba(255, 255, 255, 0.40)', flexShrink: 0, pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder={isMobile ? 'Search tools' : "Search tools, e.g. 'Compress PDF'…"}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              enterKeyHint="search"
              className="tools-search-input"
            />
          </div>
          {isMobile && (
            <button
              onClick={openFilter}
              aria-label={filtersOn ? `Filter, ${filtersOn} active` : 'Filter'}
              style={{
                position: 'relative', flexShrink: 0, width: '44px', height: '44px', borderRadius: '9999px', border: '1px solid rgba(255, 255, 255, 0.12)', padding: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: filtersOn ? '#ffffff' : 'rgba(255, 255, 255, 0.05)', color: filtersOn ? '#000000' : '#ffffff',
              }}
            >
              <SlidersHorizontal size={18} />
              {filtersOn > 0 && (
                <span aria-hidden style={{ position: 'absolute', top: '-2px', right: '-2px', minWidth: '18px', height: '18px', padding: '0 4px', borderRadius: '9999px', background: '#ffffff', color: '#000000', fontSize: '11px', lineHeight: '18px', fontWeight: 700, textAlign: 'center' }}>{filtersOn}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Category pills — horizontal touch scrolling with hidden scrollbars on mobile, wrapped on desktop */}
      <div className="tools-categories-scroll no-scrollbar overflow-x-auto flex-nowrap sm:flex-wrap max-w-full" style={{ marginBottom: isMobile ? '16px' : '28px' }}>
        {categories.map(cat => {
          const isActive = activeCategory === cat.id;
          const isCatLocked = !isPaid && cat.id !== 'all' && !FREE_CATEGORIES.has(cat.id);

          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`tools-cat-pill ${isActive ? 'is-active' : ''}`}
            >
              {isActive && (
                <motion.div
                  layoutId="tools-cat-pill"
                  className="tools-cat-pill-bg"
                  transition={{ type: 'spring', stiffness: 380, damping: 24, mass: 0.8 }}
                />
              )}
              {isCatLocked && !isActive && <Lock size={11} style={{ opacity: 0.6 }} />}
              {cat.name}
            </button>
          );
        })}
      </div>

      </div>

      {/* Results count */}
      {searchQuery && (
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: isMobile ? '0 0 12px' : '0 0 16px' }}>
          {`${filteredTools.length} result${filteredTools.length !== 1 ? 's' : ''} for "${searchQuery}"`}
        </p>
      )}

      {/* Empty state */}
      {filteredTools.length === 0 && (
        <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--text-muted)' }}>
          <Search size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
          <p style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-secondary)' }}>No tools found</p>
          <p style={{ fontSize: '14px', marginTop: '6px' }}>Try a different search term or category.</p>
          <button onClick={() => { setSearchQuery(''); applyFilterChange({ cat: 'all', sort: 'recommended' }); }} style={{ marginTop: '16px', padding: '10px 20px', background: 'var(--primary)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>
            Clear filters
          </button>
        </div>
      )}

      {/* Tools grid */}
      <motion.div
        key={activeCategory + filter.sort + searchQuery}
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.018 } },
        }}
        className="tools-cards-grid"
      >
        {filteredTools.map((tool) => {
          const toolId = getToolId(tool.name);
          const favd = isFavorite(toolId);
          const { locked, badge } = getToolLock(tool);
          const Icon = tool.icon;

          return (
            <motion.div
              variants={{
                hidden: { opacity: 0, scale: 0.96 },
                show: { opacity: 1, scale: 1, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
              }}
              key={toolId}
              onClick={() => handleToolClick(tool)}
              onMouseMove={(e) => handleGlassMouseMove(e, { maxTilt: 3, lift: 3 })}
              onMouseDown={handleGlassMouseDown}
              onMouseUp={handleGlassMouseUp}
              onMouseLeave={handleGlassMouseLeave}
              className="tool-glass-card group bg-[#070C18]/65 dark:bg-[#070C18]/65 light:bg-white/80 backdrop-blur-[40px] saturate-[180%] border border-white/[0.11] dark:border-white/[0.11] light:border-slate-900/[0.09] hover:border-white/[0.25] light:hover:border-slate-900/[0.2] shadow-[0_24px_60px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.15)] light:shadow-[0_20px_50px_rgba(15,23,42,0.07),inset_0_1px_0_0_#FFFFFF] rounded-[22px] p-6 text-slate-900 dark:text-white transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] flex flex-col justify-between h-[196px] relative overflow-hidden cursor-pointer"
            >
              {/* Plan badge (PRO) */}
              {locked && badge && (
                <div style={{
                  position: 'absolute', top: '16px', left: '16px',
                  display: 'flex', alignItems: 'center', gap: '4px',
                  background: 'var(--dash-button-primary-bg, #0297DE)',
                  color: 'var(--dash-button-primary-text, #ffffff)', fontSize: '10px', fontWeight: 800, letterSpacing: '0.12em',
                  padding: '2px 8px', borderRadius: '9999px',
                  zIndex: 2,
                }}>
                  <Lock size={10} />
                  {badge}
                </div>
              )}

              {/* Top Row: Icon Pod + Favorite Button */}
              <div className="tool-card-top-row flex items-center justify-between w-full shrink-0 relative z-10">
                <div
                  className="tool-icon-pod w-10 h-10 shrink-0 aspect-square rounded-xl bg-[#0297DE]/12 border border-[#0297DE]/25 text-[#38BDF8] flex items-center justify-center group-hover:bg-[#0297DE] group-hover:text-white transition-all"
                  style={{ marginTop: (locked && badge) ? '8px' : '0' }}
                >
                  {locked ? <Lock size={16} /> : <Icon size={18} />}
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.82 }}
                    animate={favd ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                    onClick={e => handleFav(e, tool.name)}
                    aria-label={favd ? `Remove ${tool.name} from favorites` : `Add ${tool.name} to favorites`}
                    aria-pressed={favd}
                    className={`tool-card-fav-btn w-8 h-8 shrink-0 aspect-square flex items-center justify-center ${favd ? 'is-fav' : ''}`}
                  >
                    <Heart size={14} fill={favd ? 'currentColor' : 'none'} />
                  </motion.button>
                </div>
              </div>

              {/* Bottom text stack */}
              <div className="w-full min-w-0 mt-auto">
                <h3 className="tool-card-title text-base font-semibold text-slate-900 dark:text-white tracking-tight leading-snug truncate m-0">
                  {tool.name}
                </h3>
                <p className="tool-card-desc text-sm opacity-60 text-slate-900 dark:text-white leading-relaxed line-clamp-2 mt-1 m-0">
                  {tool.desc}
                </p>
              </div>

              {/* Bottom: Use Tool link */}
              <div className="tool-card-footer-link text-sm font-medium text-[#0297DE] hover:text-[#19ADFF] flex items-center gap-1 transition-colors mt-2">
                {locked ? (
                  <>
                    <span className="flex items-center gap-1 text-amber-500 dark:text-amber-400">
                      <span>Upgrade to PRO</span>
                      <Crown size={12} />
                    </span>
                  </>
                ) : (
                  <>
                    <span>Use Tool</span>
                    <span aria-hidden="true">↗</span>
                  </>
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Gate Modal */}
      <GateModal
        reason={gateReason}
        onClose={() => { setGateReason(null); setGateTool(undefined); }}
        toolName={gateTool}
      />
    </div>
  );
};

export default Tools;
