import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFavorites } from '../../context/FavoritesContext';
import { getTotalUsage, getTimeSpent, formatDuration } from '../../utils/activityTracker';
import { toolsData } from '../../data/toolsData';
import { loadFiles, type FileItem } from '../../utils/fileLibrary';
import {
  TrendingUp,
  RefreshCcw,
  FolderOpen,
  FileText,
  UploadCloud,
  Sparkles,
  Layers,
  Minimize2,
  Zap,
  ArrowUp,
  X,
  FileUp,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  handleGlassMouseMove,
  handleGlassMouseDown,
  handleGlassMouseUp,
  handleGlassMouseLeave,
} from '../../utils/glassPhysics';
import '../../components/layout/DashboardMonochrome.css';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'GOOD MORNING';
  if (h < 18) return 'GOOD AFTERNOON';
  return 'GOOD EVENING';
}

function useCountUp(target: number, duration: number = 800) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let animId: number;
    const startTime = performance.now();
    const start = 0;
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setVal(Math.round(start + (target - start) * ease));
      if (progress < 1) {
        animId = requestAnimationFrame(step);
      }
    };
    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [target, duration]);
  return val;
}

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const toolId = (name: string) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

const DashboardHome: React.FC = () => {
  const { user } = useAuth();
  const { favorites } = useFavorites();
  const navigate = useNavigate();

  // Telemetry metrics
  const [totalUsage, setTotalUsage] = useState(0);
  const [timeSpent, setTimeSpent] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [recentFiles, setRecentFiles] = useState<FileItem[]>([]);

  // Interactive dropzone state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Copilot input state
  const [copilotPrompt, setCopilotPrompt] = useState('');

  const animatedRuns = useCountUp(totalUsage);
  const animatedFiles = useCountUp(fileCount);

  useEffect(() => {
    const refresh = () => {
      setTotalUsage(getTotalUsage());
      setTimeSpent(getTimeSpent());
      const loaded = loadFiles().filter((f) => !f.trashed);
      setFileCount(loaded.length);
      setRecentFiles(loaded.slice(0, 3));
    };
    refresh();
    const iv = setInterval(() => setTimeSpent(getTimeSpent()), 10000);
    return () => clearInterval(iv);
  }, []);

  const displayName = user?.name || 'ShadowXBooster';
  const timeSpentLabel = formatDuration(timeSpent);

  // Quick Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleClearSelectedFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Copilot prompt submit
  const handleCopilotSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = copilotPrompt.trim();
    if (!query) return;
    try {
      sessionStorage.setItem('zenith_pending_prompt', query);
    } catch {
      // ignore storage errors
    }
    navigate(`/dashboard/ai?q=${encodeURIComponent(query)}`);
  };

  const handlePromptClick = (promptText: string) => {
    try {
      sessionStorage.setItem('zenith_pending_prompt', promptText);
    } catch {
      // ignore
    }
    navigate(`/dashboard/ai?q=${encodeURIComponent(promptText)}`);
  };

  // Spotlight workflows data
  const spotlightWorkflows = useMemo(
    () => [
      {
        id: 'ai-summarize-pdf',
        title: 'AI Summarize PDF',
        desc: 'Instant executive summaries & key takeaways',
        icon: Sparkles,
        path: '/dashboard/tools/ai-summarize-pdf',
      },
      {
        id: 'compress-pdf',
        title: 'Compress PDF',
        desc: 'Shrink file size up to 80% with zero quality loss',
        icon: Minimize2,
        path: '/dashboard/tools/compress-pdf',
      },
      {
        id: 'merge-pdf',
        title: 'Merge & Organize',
        desc: 'Combine, reorder, or split multiple PDFs',
        icon: Layers,
        path: '/dashboard/tools/merge-pdf',
      },
      {
        id: 'pdf-to-word',
        title: 'PDF to Word / Excel',
        desc: 'Convert documents with preserved formatting',
        icon: FileText,
        path: '/dashboard/tools/pdf-to-word',
      },
    ],
    []
  );

  return (
    <div className="dashboard-monochrome-workspace w-full min-h-full">
      <div className="bento-command-center">
        {/* ═══════════════════════════════════════════════════════════════════════════
            ROW 1: HERO IDENTITY & TELEMETRY (LOCKED MIN-H-[164PX], 12 COLS)
            ═══════════════════════════════════════════════════════════════════════════ */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          onMouseMove={(e) => handleGlassMouseMove(e, { maxTilt: 2.5, lift: 2 })}
          onMouseDown={handleGlassMouseDown}
          onMouseUp={handleGlassMouseUp}
          onMouseLeave={handleGlassMouseLeave}
          className="dashboard-home-hero bento-row-hero"
        >
          {/* Left Identity Block (6 cols) */}
          <div className="bento-hero-left">
            {/* Emblem with Slow Breathing Glow */}
            <div className="relative shrink-0">
              <div className="absolute -inset-1 rounded-2xl bg-[#0297DE]/25 blur-sm animate-pulse pointer-events-none" />
              <div className="hero-pro-badge">
                <span className="hero-pro-symbol">
                  ∞
                </span>
                <span className="hero-pro-label">
                  PRO
                </span>
              </div>
            </div>

            {/* Vertical Text Stack (space-y-1) */}
            <div className="space-y-1 min-w-0">
              {/* Greeting */}
              <div className="text-xs font-medium uppercase tracking-wider opacity-50 text-slate-900 dark:text-white leading-none">
                {getGreeting()}
              </div>

              {/* Name */}
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white leading-tight m-0 truncate">
                {displayName}
              </h1>

              {/* Subtitle */}
              <p className="text-sm opacity-60 text-slate-900 dark:text-white m-0">
                Every tool, no limits.
              </p>
            </div>
          </div>

          {/* Right Telemetry Pods (6 cols: 3 identical tiles locked to h-[112px]) */}
          <div className="bento-hero-right">
            {/* Runs Pod */}
            <div
              onClick={() => navigate('/dashboard/tools')}
              onMouseMove={(e) => handleGlassMouseMove(e, { maxTilt: 2.5, lift: 2 })}
              onMouseDown={handleGlassMouseDown}
              onMouseUp={handleGlassMouseUp}
              onMouseLeave={handleGlassMouseLeave}
              className="bento-stat-pod group h-[116px] p-4 rounded-2xl flex flex-col justify-between"
            >
              <div className="w-8 h-8 shrink-0 aspect-square rounded-lg bg-[#0297DE]/15 border border-[#0297DE]/30 text-[#38BDF8] flex items-center justify-center">
                <TrendingUp size={14} />
              </div>
              <div>
                <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-none">
                  {animatedRuns}
                </div>
                <div className="text-xs font-medium uppercase tracking-wider opacity-55 text-slate-900 dark:text-white mt-1.5 leading-none">
                  RUNS
                </div>
              </div>
            </div>

            {/* Time Pod */}
            <div
              onMouseMove={(e) => handleGlassMouseMove(e, { maxTilt: 2.5, lift: 2 })}
              onMouseDown={handleGlassMouseDown}
              onMouseUp={handleGlassMouseUp}
              onMouseLeave={handleGlassMouseLeave}
              className="bento-stat-pod group h-[116px] p-4 rounded-2xl flex flex-col justify-between"
            >
              <div className="w-8 h-8 shrink-0 aspect-square rounded-lg bg-[#0297DE]/15 border border-[#0297DE]/30 text-[#38BDF8] flex items-center justify-center">
                <RefreshCcw size={14} />
              </div>
              <div>
                <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-none truncate">
                  {timeSpentLabel}
                </div>
                <div className="text-xs font-medium uppercase tracking-wider opacity-55 text-slate-900 dark:text-white mt-1.5 leading-none">
                  TIME
                </div>
              </div>
            </div>

            {/* Files Pod */}
            <div
              onClick={() => navigate('/dashboard/files')}
              onMouseMove={(e) => handleGlassMouseMove(e, { maxTilt: 2.5, lift: 2 })}
              onMouseDown={handleGlassMouseDown}
              onMouseUp={handleGlassMouseUp}
              onMouseLeave={handleGlassMouseLeave}
              className="bento-stat-pod group h-[116px] p-4 rounded-2xl flex flex-col justify-between"
            >
              <div className="w-8 h-8 shrink-0 aspect-square rounded-lg bg-[#0297DE]/15 border border-[#0297DE]/30 text-[#38BDF8] flex items-center justify-center">
                <FolderOpen size={14} />
              </div>
              <div>
                <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-none">
                  {animatedFiles}
                </div>
                <div className="text-xs font-medium uppercase tracking-wider opacity-55 text-slate-900 dark:text-white mt-1.5 leading-none">
                  FILES
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ═══════════════════════════════════════════════════════════════════════════
            ROW 2: QUICK DROP & AI COPILOT (7 COLS / 5 COLS)
            ═══════════════════════════════════════════════════════════════════════════ */}
        <section className="bento-row-workspace">
          {/* ── Left Card (Col 1: 7fr) — Quick Drop ── */}
          <div
            onMouseMove={(e) => handleGlassMouseMove(e, { maxTilt: 2.5, lift: 2 })}
            onMouseDown={handleGlassMouseDown}
            onMouseUp={handleGlassMouseUp}
            onMouseLeave={handleGlassMouseLeave}
            className="bento-glass-card bento-card-dropzone group p-6 rounded-[24px] flex flex-col justify-between gap-5 min-h-[250px]"
          >
            {/* Top Header */}
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="bento-icon-pod">
                <UploadCloud size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight leading-snug text-slate-900 dark:text-white m-0 truncate">
                  Quick Drop
                </h2>
                <p className="text-sm opacity-60 text-slate-900 dark:text-white m-0 truncate">
                  Drop a document to open it in Tools.
                </p>
              </div>
            </div>

            {/* Hidden Native File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
              accept=".pdf,.docx,.xlsx,.pptx,.txt,.jpg,.jpeg,.png,.webp,.heic"
            />

            {/* Middle Dropzone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex-1 rounded-2xl border border-dashed border-white/[0.14] hover:border-[#0297DE]/60 bg-white/[0.02] flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all ${
                isDragging ? 'border-[#0297DE] bg-[#0297DE]/10' : ''
              }`}
            >
              {!selectedFile ? (
                /* Default Dropzone State */
                <>
                  <div className="w-9 h-9 rounded-xl bg-[#0297DE]/15 text-[#38BDF8] flex items-center justify-center mb-2.5 shrink-0">
                    <FileUp size={18} />
                  </div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white m-0">
                    Drag and drop a file here, or click to browse
                  </p>
                </>
              ) : (
                /* File Selected Active State */
                <div className="flex flex-col items-center gap-2.5 w-full">
                  <div className="bento-file-pill">
                    <FileText size={16} className="text-[#38BDF8] shrink-0" />
                    <span className="text-xs font-semibold truncate max-w-[180px] sm:max-w-[240px]">
                      {selectedFile.name}
                    </span>
                    <span className="text-xs text-[#38BDF8] shrink-0">
                      ({formatBytes(selectedFile.size)})
                    </span>
                    <button
                      type="button"
                      onClick={handleClearSelectedFile}
                      aria-label="Remove file"
                      className="w-4 h-4 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer border-0 ml-1"
                    >
                      <X size={10} />
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2 w-full max-w-[380px]">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/dashboard/tools/ai-summarize-pdf');
                      }}
                      className="bento-action-btn-primary"
                    >
                      <Sparkles size={11} />
                      <span>Summarize</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/dashboard/tools/compress-pdf');
                      }}
                      className="bento-action-btn-secondary"
                    >
                      <Minimize2 size={11} />
                      <span>Compress</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/dashboard/tools/merge-pdf');
                      }}
                      className="bento-action-btn-secondary"
                    >
                      <Layers size={11} />
                      <span>Merge</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/dashboard/tools/pdf-to-word');
                      }}
                      className="bento-action-btn-secondary"
                    >
                      <FileText size={11} />
                      <span>Convert</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Right Card (Col 2: 5fr) — AI Copilot ── */}
          <div
            onMouseMove={(e) => handleGlassMouseMove(e, { maxTilt: 2.5, lift: 2 })}
            onMouseDown={handleGlassMouseDown}
            onMouseUp={handleGlassMouseUp}
            onMouseLeave={handleGlassMouseLeave}
            className="bento-glass-card bento-card-copilot group h-full min-h-[260px] p-6 rounded-[24px] flex flex-col justify-between gap-5"
          >
            {/* Top Header Row */}
            <div className="flex items-center justify-between gap-3 w-full shrink-0">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 shrink-0 aspect-square rounded-xl bg-[#0297DE]/15 border border-[#0297DE]/30 text-[#38BDF8] flex items-center justify-center shadow-[0_0_20px_rgba(2,151,222,0.2)]">
                  <Sparkles size={18} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-tight leading-tight text-slate-900 dark:text-white m-0 truncate">
                    AI Copilot
                  </h2>
                  <p className="text-sm opacity-60 text-slate-900 dark:text-white mt-0.5 m-0 truncate">
                    Instant document intelligence
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/dashboard/ai')}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#38BDF8] hover:text-white bg-transparent border-0 p-0 shadow-none transition-colors duration-200 group shrink-0 cursor-pointer bento-header-action-link"
              >
                <span>Open Chat</span>
                <span className="transition-transform duration-200 group-hover:translate-x-1 inline-block link-arrow">→</span>
              </button>
            </div>

            {/* Middle Interactive Quick-Action Grid: 4 equal-dimension glass prompt buttons */}
            <div className="grid grid-cols-2 gap-2.5 my-auto w-full">
              {[
                { label: 'Summarize PDF', prompt: 'Summarize my document into clear key takeaways.' },
                { label: 'Extract points', prompt: 'Extract the most important action items and metrics.' },
                { label: 'Explain simply', prompt: 'Explain the complex sections of this document in simple terms.' },
                { label: 'Study notes', prompt: 'Create structured study notes and questions from this file.' },
              ].map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handlePromptClick(item.prompt)}
                  className="h-10 px-3.5 rounded-xl bg-white/[0.035] hover:bg-[#0297DE]/15 border border-white/[0.08] hover:border-[#0297DE]/40 flex items-center justify-between gap-2 text-sm font-medium text-slate-700 dark:text-white/80 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer group/prompt min-w-0"
                >
                  <span className="truncate">{item.label}</span>
                  <ChevronRight
                    size={14}
                    className="w-3.5 h-3.5 shrink-0 opacity-50 group-hover/prompt:opacity-100 group-hover/prompt:translate-x-0.5 transition-all"
                  />
                </button>
              ))}
            </div>

            {/* Bottom Live Composer Bar */}
            <form onSubmit={handleCopilotSubmit} className="w-full m-0 p-0 shrink-0">
              <div className="h-12 w-full rounded-xl bg-white/[0.045] border border-white/[0.1] focus-within:border-[#0297DE]/60 pl-4 pr-1.5 flex items-center gap-2 transition-all">
                <input
                  type="text"
                  value={copilotPrompt}
                  onChange={(e) => setCopilotPrompt(e.target.value)}
                  placeholder="Ask AI Copilot anything..."
                  className="bg-transparent border-0 outline-none text-sm w-full min-w-0 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/35"
                />
                <button
                  type="submit"
                  disabled={!copilotPrompt.trim()}
                  aria-label="Send prompt"
                  className="w-9 h-9 shrink-0 aspect-square rounded-lg bg-[#0297DE] hover:bg-[#19ADFF] disabled:opacity-30 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all shadow-[0_0_15px_rgba(2,151,222,0.35)] cursor-pointer border-none"
                >
                  <ArrowUp size={14} />
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════════
            ROW 3: SPOTLIGHT WORKFLOWS (4 EQUAL TILES, LOCKED H-[160PX])
            ═══════════════════════════════════════════════════════════════════════════ */}
        <section className="w-full">
          {/* Section Header */}
          <div className="flex items-center justify-between h-7 mb-3">
            <div className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900 dark:text-white">
              <Zap size={15} className="text-[#38BDF8]" />
              <span>Spotlight Workflows</span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/dashboard/tools')}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#38BDF8] hover:text-white bg-transparent border-0 p-0 shadow-none transition-colors duration-200 group cursor-pointer bento-header-action-link"
            >
              <span>View all 95+ tools</span>
              <span className="transition-transform duration-200 group-hover:translate-x-1 inline-block link-arrow">→</span>
            </button>
          </div>

          {/* 4-Tile Grid */}
          <div className="bento-spotlight-grid">
            {spotlightWorkflows.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  onClick={() => navigate(item.path)}
                  onMouseMove={(e) => handleGlassMouseMove(e, { maxTilt: 2.5, lift: 2 })}
                  onMouseDown={handleGlassMouseDown}
                  onMouseUp={handleGlassMouseUp}
                  onMouseLeave={handleGlassMouseLeave}
                  className="bento-glass-card bento-spotlight-card group h-[160px] p-5 rounded-[22px] flex flex-col justify-between cursor-pointer"
                >
                  {/* Top Row: Icon Box on left, Subtle Arrow on right */}
                  <div className="flex items-center justify-between w-full shrink-0">
                    <div className="w-10 h-10 shrink-0 aspect-square rounded-xl bg-[#0297DE]/15 border border-[#0297DE]/30 text-[#38BDF8] flex items-center justify-center group-hover:bg-[#0297DE] group-hover:text-white group-hover:border-[#0297DE] transition-all">
                      <Icon size={18} />
                    </div>
                    <div className="w-5 h-5 flex items-center justify-center opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-slate-900 dark:text-white select-none">
                      →
                    </div>
                  </div>

                  {/* Bottom block: Tool title + 2-line description */}
                  <div className="w-full min-w-0 mt-auto">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white leading-snug group-hover:text-[#38BDF8] transition-colors truncate m-0">
                      {item.title}
                    </h3>
                    <p className="text-sm opacity-60 text-slate-900 dark:text-white leading-relaxed line-clamp-2 mt-1 m-0">
                      {item.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════════
            ROW 4: FAVORITES & RECENT VAULT (7 COLS / 5 COLS)
            ═══════════════════════════════════════════════════════════════════════════ */}
        <section className="bento-row-decks">
          {/* ── Left Column (Col 1: 7fr) — ♡ Favorites ── */}
          <div className="bento-deck-favorites w-full">
            <div className="flex items-center justify-between h-7 mb-3">
              <div className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900 dark:text-white">
                <span className="text-base leading-none select-none text-[#38BDF8]">♡</span>
                <span>Favorites</span>
              </div>
              {favorites.length > 0 && (
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/tools')}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#38BDF8] hover:text-white bg-transparent border-0 p-0 shadow-none transition-colors duration-200 group cursor-pointer bento-header-action-link"
                >
                  <span>More tools</span>
                  <span className="transition-transform duration-200 group-hover:translate-x-1 inline-block link-arrow">→</span>
                </button>
              )}
            </div>

            <div
              onMouseMove={(e) => handleGlassMouseMove(e, { maxTilt: 2.5, lift: 2 })}
              onMouseDown={handleGlassMouseDown}
              onMouseUp={handleGlassMouseUp}
              onMouseLeave={handleGlassMouseLeave}
              className="bento-glass-card bento-deck-card group p-6 rounded-[24px] flex flex-col justify-center items-center text-center"
            >
              {favorites.length === 0 ? (
                /* Empty Favorites State */
                <>
                  <div className="w-14 h-14 shrink-0 aspect-square rounded-2xl mb-5 bg-[#0297DE]/12 border border-[#0297DE]/25 text-[#38BDF8] flex items-center justify-center relative overflow-hidden">
                    <span className="text-xl leading-none select-none text-[#38BDF8] shrink-0 static">♡</span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white leading-snug mb-1.5 m-0">
                    No favorites yet
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-white/55 max-w-xs leading-relaxed mb-6 m-0">
                    Tap the heart on any tool to keep it here for 1-click access.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard/tools')}
                    className="h-10 px-6 rounded-full bg-[#0297DE] hover:bg-[#19ADFF] text-white text-sm font-medium inline-flex items-center justify-center gap-2 shrink-0 shadow-[0_0_20px_rgba(2,151,222,0.35)] transition-all border-none cursor-pointer"
                  >
                    Browse tools
                  </button>
                </>
              ) : (
                /* 2-Column Mini Grid */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full my-auto">
                  {favorites.slice(0, 4).map((fav) => {
                    const meta = toolsData.find((t) => toolId(t.name) === fav.id);
                    const Icon = meta?.icon ?? FileText;
                    return (
                      <div
                        key={fav.id}
                        onClick={() => navigate(`/dashboard/tools/${fav.id}`)}
                        className="bento-recent-row group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-[#0297DE]/15 border border-[#0297DE]/30 text-[#38BDF8] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            <Icon size={15} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="bento-recent-title group-hover:text-[#38BDF8] transition-colors">
                              {meta?.name ?? fav.name}
                            </h4>
                          </div>
                        </div>
                        <ChevronRight size={13} className="text-slate-400 dark:text-white/40 group-hover:text-[#38BDF8] group-hover:translate-x-0.5 transition-all shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Right Column (Col 2: 5fr) — Recent Files & Activity ── */}
          <div className="bento-deck-recent w-full">
            <div className="flex items-center justify-between h-7 mb-3">
              <div className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900 dark:text-white">
                <Clock size={15} className="text-[#38BDF8]" />
                <span>Recent Files & Activity</span>
              </div>
              <button
                type="button"
                onClick={() => navigate('/dashboard/files')}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#38BDF8] hover:text-white bg-transparent border-0 p-0 shadow-none transition-colors duration-200 group cursor-pointer bento-header-action-link"
              >
                <span>Manage files</span>
                <span className="transition-transform duration-200 group-hover:translate-x-1 inline-block link-arrow">→</span>
              </button>
            </div>

            <div
              onMouseMove={(e) => handleGlassMouseMove(e, { maxTilt: 2.5, lift: 2 })}
              onMouseDown={handleGlassMouseDown}
              onMouseUp={handleGlassMouseUp}
              onMouseLeave={handleGlassMouseLeave}
              className="bento-glass-card bento-deck-card group p-6 rounded-[24px] flex flex-col justify-center items-center text-center"
            >
              {recentFiles.length === 0 ? (
                /* Empty Files State */
                <>
                  <div className="w-14 h-14 shrink-0 aspect-square rounded-2xl mb-5 bg-[#0297DE]/12 border border-[#0297DE]/25 text-[#38BDF8] flex items-center justify-center relative overflow-hidden">
                    <FolderOpen size={24} className="w-6 h-6 shrink-0 static text-[#38BDF8]" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white leading-snug mb-1.5 m-0">
                    Your local vault is empty
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-white/55 max-w-xs leading-relaxed mb-6 m-0">
                    Files you process or save stay private on your device.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard/files')}
                    className="h-10 px-6 rounded-full bg-[#0297DE] hover:bg-[#19ADFF] text-white text-sm font-medium inline-flex items-center justify-center gap-2 shrink-0 shadow-[0_0_20px_rgba(2,151,222,0.35)] transition-all border-none cursor-pointer"
                  >
                    Go to Files →
                  </button>
                </>
              ) : (
                /* Recent Files List */
                <div className="space-y-2 w-full my-auto">
                  {recentFiles.map((f) => (
                    <div
                      key={f.id}
                      onClick={() => navigate('/dashboard/files')}
                      className="bento-recent-row group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-[#0297DE]/15 border border-[#0297DE]/30 text-[#38BDF8] flex items-center justify-center shrink-0">
                          <FileText size={14} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="bento-recent-title group-hover:text-[#38BDF8] transition-colors">
                            {f.name}
                          </h4>
                          <p className="bento-recent-sub">
                            {f.size} · {f.date}
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={13} className="text-slate-400 dark:text-white/40 group-hover:text-[#38BDF8] group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                  ))}
                  <div className="pt-1.5 flex items-center justify-between text-xs opacity-50 text-slate-900 dark:text-white">
                    <span>Indexed storage</span>
                    <span>{fileCount} total file{fileCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default DashboardHome;
