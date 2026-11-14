import { useState } from 'react';
import { Download, Share, PlusSquare, X, RefreshCw } from 'lucide-react';
import { usePwa } from '../../hooks/usePwa';
import { promptInstall, applyUpdate, isNativeApp } from '../../utils/pwa';

const DISMISS_KEY = 'zenith_install_dismissed';

/**
 * "Install the app" card. Android / desktop Chrome get the browser's own install
 * dialog; iPhone Safari has no such API, so it shows the two-tap instructions.
 * Hidden once installed, inside the native app, or after the user dismisses it
 * (unless `persistent`, used on the Account screen).
 */
export function InstallAppCard({ persistent = false }: { persistent?: boolean }) {
  const { canPrompt, standalone, ios } = usePwa();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [showIosHelp, setShowIosHelp] = useState(false);

  if (standalone || isNativeApp() || (!canPrompt && !ios) || (dismissed && !persistent)) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
  };

  return (
    <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingRight: persistent ? 0 : '32px' }}>
        <img src="/icons/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: '12px', flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>Install O-Zenith</div>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>Full-screen app on your home screen. Works offline once tools are opened.</div>
        </div>
      </div>
      {!persistent && (
        <button onClick={dismiss} aria-label="Dismiss" style={{ position: 'absolute', top: '6px', right: '6px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: '12px' }}>
          <X size={18} />
        </button>
      )}
      {canPrompt ? (
        <button onClick={() => { promptInstall(); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', minHeight: '46px', borderRadius: '12px', border: 'none', background: 'var(--primary)', color: 'var(--on-accent)', fontWeight: 700, fontSize: '16px', cursor: 'pointer' }}>
          <Download size={18} /> Install app
        </button>
      ) : showIosHelp ? (
        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: 'var(--text-main)', lineHeight: 1.9 }}>
          <li>Tap <Share size={15} style={{ verticalAlign: '-2px' }} aria-label="Share" /> <strong>Share</strong> in Safari's toolbar</li>
          <li>Choose <PlusSquare size={15} style={{ verticalAlign: '-2px' }} aria-hidden /> <strong>Add to Home Screen</strong></li>
          <li>Tap <strong>Add</strong> — O-Zenith opens full-screen from its icon</li>
        </ol>
      ) : (
        <button onClick={() => setShowIosHelp(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', minHeight: '46px', borderRadius: '12px', border: 'none', background: 'var(--primary)', color: 'var(--on-accent)', fontWeight: 700, fontSize: '16px', cursor: 'pointer' }}>
          <PlusSquare size={18} /> Add to home screen
        </button>
      )}
    </div>
  );
}

/** "A new version is ready" bar, shown above the tab bar when an update has downloaded. */
export function UpdatePrompt() {
  const { updateReady } = usePwa();
  const [hidden, setHidden] = useState(false);
  if (!updateReady || hidden) return null;
  return (
    <div role="status" style={{
      position: 'fixed', zIndex: 9000, left: '50%', transform: 'translateX(-50%)',
      bottom: 'calc(84px + env(safe-area-inset-bottom))', width: 'min(420px, calc(100% - 24px))',
      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 10px 10px 16px', borderRadius: '16px',
      background: 'var(--primary)', color: 'var(--on-accent)', boxShadow: '0 12px 30px -12px rgba(33,18,0,0.5)',
    }}>
      <RefreshCw size={18} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: '14px', fontWeight: 600 }}>A new version of O-Zenith is ready.</span>
      <button onClick={() => setHidden(true)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.8)', fontWeight: 600, fontSize: '14px', padding: '10px 8px', cursor: 'pointer' }}>Later</button>
      <button onClick={applyUpdate} style={{ background: 'var(--surface)', color: 'var(--primary)', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '14px', padding: '10px 14px', cursor: 'pointer' }}>Update</button>
    </div>
  );
}
