import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, ArrowLeft } from 'lucide-react';

interface Props {
  children: ReactNode;
  label?: string;
  resetLabel?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Clean Frosted Glass Error Boundary catching render / worker errors.
 * Ensures that if a corrupted document or syntax error occurs, the user sees
 * a sleek recovery card rather than a blank or broken screen.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown) {
    console.error('[ErrorBoundary caught error]', err);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const title = this.props.label || 'Unable to process this file — Try another document';
    const resetText = this.props.resetLabel || 'Reset Tool';

    return (
      <div className="w-full min-h-[420px] flex items-center justify-center p-6">
        <div
          className="w-full max-w-md rounded-[28px] p-8 sm:p-10 flex flex-col items-center text-center relative overflow-hidden transition-all duration-300"
          style={{
            background: 'var(--card-bg, rgba(7, 12, 24, 0.75))',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            border: '1px solid var(--card-border, rgba(255, 255, 255, 0.12))',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)',
          }}
        >
          {/* Subtle Ambient Glow */}
          <div
            className="absolute -top-20 inset-x-0 h-40 pointer-events-none opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(245, 158, 11, 0.25) 0%, transparent 70%)' }}
          />

          {/* Warning Icon Emblem */}
          <div className="w-14 h-14 shrink-0 aspect-square rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-5 relative z-10 shadow-[0_0_24px_rgba(245,158,11,0.2)]">
            <AlertTriangle className="w-6 h-6 stroke-[2]" />
          </div>

          {/* Title */}
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white leading-snug mb-2 relative z-10">
            {title}
          </h2>

          {/* Description */}
          <p className="text-sm text-slate-500 dark:text-white/60 leading-relaxed mb-6 max-w-xs relative z-10">
            This document could not be parsed or rendered safely. Your files are untouched — nothing was uploaded or lost.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3 w-full relative z-10">
            <button
              type="button"
              onClick={this.handleReset}
              className="h-10 px-5 rounded-full bg-[#0297DE] hover:bg-[#19ADFF] text-white text-sm font-medium inline-flex items-center justify-center gap-2 shrink-0 shadow-[0_0_20px_rgba(2,151,222,0.35)] transition-all cursor-pointer border-none"
            >
              <RotateCcw className="w-4 h-4" />
              {resetText}
            </button>

            <button
              type="button"
              onClick={() => { window.location.href = '/dashboard/tools'; }}
              className="h-10 px-5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] dark:bg-white/[0.06] dark:hover:bg-white/[0.12] text-slate-700 dark:text-white/90 text-sm font-medium inline-flex items-center justify-center gap-2 shrink-0 border border-slate-300/40 dark:border-white/[0.12] transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Tools
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
