import { ArrowLeft, Heart, FolderOpen, FileText } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFavorites } from '../../context/FavoritesContext';
import { useToast } from '../../hooks/useToast';
import { useIsMobile } from '../../hooks/useIsMobile';
import { toolsData, categoryName } from '../../data/toolsData';
import FilesPicker from './FilesPicker';

interface ToolWorkspaceLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
}

interface InputInfo { accept: string; multiple: boolean }

const ToolWorkspaceLayout = ({ title, description, children }: ToolWorkspaceLayoutProps) => {
  const { toolId } = useParams<{ toolId: string }>();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { showToast } = useToast();
  const isMobile = useIsMobile(768);

  const favd = toolId ? isFavorite(toolId) : false;
  const handleFav = () => {
    if (!toolId) return;
    const result = toggleFavorite(toolId, title);
    showToast(result === 'added' ? `Added "${title}" to Favorites` : `Removed "${title}" from Favorites`);
  };

  // Find metadata for icon & category
  const toolMeta = toolsData.find((t) => {
    const tid = t.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    return tid === toolId || t.name.toLowerCase() === title.toLowerCase();
  });
  const ToolIcon = toolMeta?.icon || FileText;
  const catLabel = toolMeta?.category ? categoryName(toolMeta.category) : '';

  // ── Watch the tool for a file input ──
  const contentRef = useRef<HTMLDivElement>(null);
  const [inputInfo, setInputInfo] = useState<InputInfo | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [zoneHost, setZoneHost] = useState<HTMLElement | null>(null);

  const findInput = () =>
    contentRef.current?.querySelector<HTMLInputElement>('input[type="file"]:not([disabled])') ?? null;

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const sync = () => {
      const el = findInput();
      const zone = el?.closest<HTMLElement>('[style*="dashed"]')
        ?? el?.parentElement?.querySelector<HTMLElement>(':scope > [style*="dashed"], :scope > * > [style*="dashed"]') ?? null;
      const outside = !!zone && (zone.tagName === 'BUTTON' || zone.tagName === 'LABEL' || zone.tagName === 'A');
      let host: HTMLElement | null = zone
        ? (outside ? (zone.nextElementSibling as HTMLElement | null)?.dataset?.filesPick !== undefined ? zone.nextElementSibling as HTMLElement : null
                   : zone.querySelector<HTMLElement>(':scope > [data-files-pick]'))
        : null;
      if (zone && !host) {
        host = document.createElement('div');
        host.dataset.filesPick = '';
        host.style.cssText = `display:flex;justify-content:center;width:100%;${outside ? 'margin-top:10px' : 'margin-top:14px'}`;
        if (outside) zone.after(host); else zone.appendChild(host);
      }
      setZoneHost((prev) => (prev === host ? prev : host));
      setInputInfo((prev) => {
        const next = el ? { accept: el.accept || '', multiple: el.multiple } : null;
        return prev?.accept === next?.accept && prev?.multiple === next?.multiple ? prev : next;
      });
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['accept', 'multiple', 'disabled', 'type'] });
    return () => obs.disconnect();
  }, []);

  const handlePick = (files: File[]) => {
    setPickerOpen(false);
    const el = findInput();
    if (!el || !files.length) return;
    const dt = new DataTransfer();
    (el.multiple ? files : files.slice(0, 1)).forEach((f) => dt.items.add(f));
    el.files = dt.files;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const inlineFilesButton = (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); setPickerOpen(true); }}
      className="tool-action-pill"
    >
      <FolderOpen size={15} /> Choose from Files
    </button>
  );

  const filesButton = inputInfo && !zoneHost && (
    <button
      type="button"
      onClick={() => setPickerOpen(true)}
      className="tool-action-pill"
    >
      <FolderOpen size={15} /> Choose from Files
    </button>
  );

  return (
    <div className="tool-workspace-page w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* ── Top Navigation & Back Pill ── */}
      <div className="tool-top-nav">
        <Link
          to="/dashboard/tools"
          className="tool-back-pill"
        >
          <ArrowLeft size={14} /> Back to Tools
        </Link>

        {toolId && (
          <button
            type="button"
            onClick={handleFav}
            aria-label={favd ? 'Remove from Favorites' : 'Add to Favorites'}
            aria-pressed={favd}
            className={`tool-fav-pill ${favd ? 'is-active' : ''}`}
          >
            <Heart size={14} fill={favd ? 'currentColor' : 'none'} />
            <span>{favd ? 'Favorited' : 'Favorite'}</span>
          </button>
        )}
      </div>

      {/* ── Unified Tool Header Card ── */}
      <div className="tool-header-card rounded-[28px] bg-[#070C18]/65 dark:bg-[#070C18]/65 light:bg-white/80 backdrop-blur-[40px] border border-white/[0.11] dark:border-white/[0.11] light:border-slate-900/[0.09] p-6 sm:p-8 shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
        <div className="tool-header-left">
          {/* Electric Blue Glass Icon Pod */}
          <div className="tool-icon-pod-lg w-12 h-12 rounded-2xl bg-[#0297DE]/15 border border-[#0297DE]/30 text-[#0297DE] flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(2,151,222,0.15)]">
            <ToolIcon size={24} />
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="tool-title-row flex items-center gap-2.5 flex-wrap mb-1">
              <h1 className="tool-title-text text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {title}
              </h1>
              {catLabel && (
                <span className="tool-cat-badge">
                  {catLabel}
                </span>
              )}
            </div>
            <p className="tool-desc-text text-xs sm:text-sm text-slate-600 dark:text-white/60 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {filesButton && <div style={{ flexShrink: 0 }}>{filesButton}</div>}
      </div>

      {/* ── Workspace Core Stage ── */}
      <div
        className="tool-workspace-card rounded-[28px] bg-[#070C18]/65 dark:bg-[#070C18]/65 light:bg-white/80 backdrop-blur-[40px] border border-white/[0.11] dark:border-white/[0.11] light:border-slate-900/[0.09] p-6 sm:p-8 shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
        style={{ minHeight: isMobile ? 0 : '500px' }}
      >
        <div ref={contentRef} className="tool-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%' }}>
          {children}
        </div>
      </div>

      {zoneHost && inputInfo && createPortal(inlineFilesButton, zoneHost)}

      <FilesPicker
        open={pickerOpen}
        accept={inputInfo?.accept ?? ''}
        multiple={!!inputInfo?.multiple}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
      />
    </div>
  );
};

export default ToolWorkspaceLayout;
