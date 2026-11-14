import { useNavigate } from 'react-router-dom';
import { useFavorites } from '../../context/FavoritesContext';
import { useToast } from '../../hooks/useToast';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Heart, ArrowRight, Wrench, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toolsData } from '../../data/toolsData';

// Same slug rule as the Tools screen and the tool routes (strips "&", "/", …)
const toolId = (name: string) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

function getToolMeta(id: string, savedName: string) {
  const match = toolsData.find(t => toolId(t.name) === id);
  return match ?? { name: savedName, desc: 'PDF tool', color: 'var(--accent)', icon: Wrench, category: 'TOOL' };
}

function timeAgo(iso?: string): string {
  if (!iso) return 'recently';
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff)) return 'recently';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

const Favorites = () => {
  const { favorites, removeFavorite } = useFavorites();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile(768);

  const handleRemove = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    removeFavorite(id);
    showToast(`Removed "${name}" from Favorites`);
  };

  // Filled heart = saved; tapping it removes the tool (the same control as on Tools)
  const heartBtn = (id: string, name: string) => (
    <motion.button
      whileTap={{ scale: 0.82 }}
      animate={{ scale: [1, 1.35, 1] }}
      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      onClick={e => handleRemove(e, id, name)}
      aria-label={`Remove ${name} from favorites`}
      style={{
        flexShrink: 0,
        width: '40px',
        height: '40px',
        borderRadius: '9999px',
        border: '1px solid rgba(255, 71, 87, 0.3)',
        background: 'rgba(255, 71, 87, 0.12)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ff4757',
        transition: 'all 0.2s ease',
      }}
    >
      <Heart size={18} fill="#ff4757" />
    </motion.button>
  );

  return (
    <div className="workspace-page-container max-w-6xl mx-auto px-6 sm:px-10 mt-4 mb-8 relative z-10 w-full" style={{ paddingBottom: '64px' }}>
      {/* Desktop heading — on phones the app bar already says "Favorites" */}
      {!isMobile && (
        <div style={{ marginBottom: '28px' }}>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white" style={{ margin: '0 0 6px' }}>Favorites</h1>
          <p className="text-sm opacity-60 text-slate-900 dark:text-white" style={{ margin: 0 }}>
            {favorites.length === 0 ? 'Tools you save show up here.' : `${favorites.length} saved tool${favorites.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      )}

      {/* Empty state: locked min-h-[320px] */}
      {favorites.length === 0 && (
        <div className="w-full min-h-[320px] rounded-[24px] p-8 sm:p-10 flex flex-col items-center justify-center text-center bg-white/[0.02] border border-white/[0.08] backdrop-blur-[24px]">
          <div className="w-14 h-14 shrink-0 aspect-square rounded-2xl bg-[#0297DE]/12 border border-[#0297DE]/25 text-[#38BDF8] flex items-center justify-center mb-5 relative overflow-hidden">
            <Heart size={24} className="w-6 h-6 shrink-0 static text-[#38BDF8]" fill="rgba(2, 151, 222, 0.25)" />
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white leading-snug mb-1.5 m-0">
            No favorites yet
          </h2>
          <p className="text-sm text-slate-500 dark:text-white/55 max-w-xs leading-relaxed mb-6 m-0">
            Tap the heart on any tool to keep it here for quick access.
          </p>
          <button
            type="button"
            className="h-10 px-6 rounded-full bg-[#0297DE] hover:bg-[#19ADFF] text-white text-sm font-medium inline-flex items-center justify-center gap-2 shrink-0 shadow-[0_0_20px_rgba(2,151,222,0.35)] transition-all border-none cursor-pointer"
            onClick={() => navigate('/dashboard/tools')}
          >
            Browse tools
          </button>
        </div>
      )}

      {/* Phones: one grouped list */}
      {favorites.length > 0 && isMobile && (
        <>
          <p className="t-caps" style={{ margin: '0 0 8px 16px', color: 'rgba(255, 255, 255, 0.45)' }}>
            {favorites.length} saved tool{favorites.length !== 1 ? 's' : ''}
          </p>
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '24px', overflow: 'hidden' }}>
            <AnimatePresence initial={false}>
              {favorites.map((fav, i) => {
                const meta = getToolMeta(fav.id, fav.name);
                const Icon = meta.icon;
                return (
                  <motion.div
                    key={fav.id}
                    layout
                    exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/dashboard/tools/${fav.id}`)}
                    onKeyDown={e => { if (e.key === 'Enter') navigate(`/dashboard/tools/${fav.id}`); }}
                    style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '14px', minHeight: '68px', padding: '0 8px 0 16px', cursor: 'pointer' }}
                  >
                    {i > 0 && <span aria-hidden style={{ position: 'absolute', top: 0, left: '70px', right: '16px', height: '1px', background: 'rgba(255, 255, 255, 0.06)' }} />}
                    <span style={{ width: '40px', height: '40px', borderRadius: '9999px', flexShrink: 0, background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.08)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={20} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '15px', lineHeight: '22px', fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.name}</span>
                      <span style={{ display: 'block', fontSize: '12px', lineHeight: '16px', color: 'rgba(255, 255, 255, 0.45)' }}>Saved {timeAgo(fav.addedAt)}</span>
                    </span>
                    {heartBtn(fav.id, meta.name)}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Desktop: card grid */}
      {favorites.length > 0 && !isMobile && (
        <motion.div layout style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: '16px' }}>
          <AnimatePresence>
            {favorites.map(fav => {
              const meta = getToolMeta(fav.id, fav.name);
              const Icon = meta.icon;
              return (
                <motion.div
                  layout
                  key={fav.id}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/dashboard/tools/${fav.id}`)}
                  onKeyDown={e => { if (e.key === 'Enter') navigate(`/dashboard/tools/${fav.id}`); }}
                  onMouseMove={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const cardX = e.clientX - r.left;
                    const cardY = e.clientY - r.top;
                    e.currentTarget.style.setProperty('--card-x', `${cardX}px`);
                    e.currentTarget.style.setProperty('--card-y', `${cardY}px`);
                    e.currentTarget.style.setProperty('--mouse-x', `${cardX}px`);
                    e.currentTarget.style.setProperty('--mouse-y', `${cardY}px`);
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.setProperty('--mouse-x', '-999px');
                    e.currentTarget.style.setProperty('--mouse-y', '-999px');
                  }}
                  className="favorite-card-interactive tool-glass-card group"
                  style={{
                    background: 'var(--dash-subcard-bg, rgba(255, 255, 255, 0.025))',
                    backdropFilter: 'blur(28px)',
                    WebkitBackdropFilter: 'blur(28px)',
                    border: '1px solid var(--dash-subcard-border, rgba(255, 255, 255, 0.07))',
                    borderRadius: '24px',
                    padding: '24px',
                    height: '200px',
                    cursor: 'pointer',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxSizing: 'border-box',
                    transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 10 }}>{heartBtn(fav.id, meta.name)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(2, 151, 222, 0.12)', border: '1px solid rgba(2, 151, 222, 0.25)', color: '#38BDF8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={18} />
                    </span>
                  </div>
                  <div style={{ margin: 'auto 0 0', minWidth: 0 }}>
                    <h3 style={{ fontSize: '16px', lineHeight: '22px', fontWeight: 600, margin: 0, color: 'var(--dash-text, #ffffff)', letterSpacing: '-0.025em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.name}</h3>
                    <p style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--dash-text-secondary, rgba(255, 255, 255, 0.60))', margin: '4px 0 0' }}>Saved {timeAgo(fav.addedAt)}</p>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0297DE', fontWeight: 500, fontSize: '14px', marginTop: '12px' }}>
                    Open tool <ArrowRight size={13} />
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {favorites.length > 0 && (
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <button className="btn-secondary" onClick={() => navigate('/dashboard/tools')} style={isMobile ? { width: '100%' } : { padding: '0 32px' }}>
            Browse more tools {isMobile ? <ChevronRight size={18} /> : <ArrowRight size={16} />}
          </button>
        </div>
      )}
    </div>
  );
};

export default Favorites;
