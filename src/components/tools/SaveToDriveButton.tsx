import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, CheckCircle, AlertCircle, Loader2, Crown } from 'lucide-react';
import { getDriveToken, uploadFileToAppFolder } from '../../utils/googleDrive';
import { addFileRecord } from '../../utils/fileLibrary';
import { useSubscription } from '../../context/SubscriptionContext';
import { isNativeApp } from '../../utils/pwa';

interface SaveToDriveButtonProps {
  downloadUrl: string | null;
  fileName: string;
}

const SaveToDriveButtonBody = ({ downloadUrl, fileName }: SaveToDriveButtonProps) => {
  const navigate = useNavigate();
  const { isPaid } = useSubscription();
  const [state, setState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  // Drive rides on Google sign-in, which the native apps can't offer (see docs/MOBILE.md);
  // there the Download button's share sheet covers "Save to Drive" via the Drive app.
  if (!downloadUrl || isNativeApp()) return null;

  // Not on a paid plan → show upgrade prompt
  if (!isPaid) {
    return (
      <button
        onClick={() => navigate('/dashboard/subscription')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          width: '100%', padding: '10px',
          background: 'linear-gradient(135deg, #7C3AED18, #9F67FF18)',
          color: 'var(--max-color)',
          border: '1px solid var(--max-border)',
          borderRadius: '8px', fontWeight: 600, fontSize: '14px',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, #7C3AED28, #9F67FF28)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, #7C3AED18, #9F67FF18)'; }}
        title="Google Drive save requires the PRO plan"
      >
        <Crown size={13} />
        PRO — Save to Drive
      </button>
    );
  }

  const driveToken = getDriveToken();

  // PRO but not connected → show connect prompt
  if (!driveToken) {
    return (
      <button
        onClick={() => navigate('/dashboard/profile?tab=connected')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          width: '100%', padding: '10px',
          background: 'transparent',
          color: '#1A73E8',
          border: '1px solid #1A73E8',
          borderRadius: '8px', fontWeight: 600, fontSize: '14px',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#1A73E810'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        <Cloud size={14} />
        Connect Drive to save
      </button>
    );
  }

  const handleSave = async () => {
    if (state === 'uploading' || state === 'success') return;
    const token = getDriveToken();
    if (!token) { navigate('/dashboard/profile?tab=connected'); return; }

    setState('uploading');
    setError('');
    try {
      const resp = await fetch(downloadUrl);
      const blob = await resp.blob();
      // Upload into the same "Zenith Uploads" folder the Files page uses, so
      // tool output and manual uploads live together in Drive rather than the
      // tool output landing loose in My Drive.
      const meta = await uploadFileToAppFolder(blob, fileName, token.token);
      // Record it so the file shows up under Files. Without this, anything a
      // tool saved to Drive was invisible in the app.
      addFileRecord({
        name: meta.name || fileName,
        sizeBytes: blob.size,
        mimeType: blob.type,
        sync: 'synced',
        driveId: meta.id,
        driveLink: meta.webViewLink,
      });
      setState('success');
      setTimeout(() => setState('idle'), 4000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      if (msg.includes('expired')) {
        navigate('/dashboard/profile?tab=connected');
        return;
      }
      setError(msg);
      setState('error');
      setTimeout(() => { setState('idle'); setError(''); }, 6000);
    }
  };

  if (state === 'success') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        width: '100%', padding: '10px',
        background: 'rgba(16,185,129,0.10)', border: '1px solid var(--success)',
        borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--success)',
      }}>
        <CheckCircle size={14} />
        Saved to Drive!
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        width: '100%', padding: '10px',
        background: 'var(--danger-subtle)', border: '1px solid var(--danger-border)',
        borderRadius: '8px', fontSize: '12px', color: 'var(--danger)',
      }}>
        <AlertCircle size={13} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{error || 'Upload failed'}</span>
      </div>
    );
  }

  return (
    <button
      onClick={handleSave}
      disabled={state === 'uploading'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        width: '100%', padding: '10px',
        background: state === 'uploading' ? '#1A73E820' : '#1A73E8',
        color: state === 'uploading' ? '#1A73E8' : 'white',
        border: state === 'uploading' ? '1px solid #1A73E8' : 'none',
        borderRadius: '8px', fontWeight: 600, fontSize: '14px',
        cursor: state === 'uploading' ? 'wait' : 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {state === 'uploading' ? (
        <>
          <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
          Saving to Drive…
        </>
      ) : (
        <>
          <Cloud size={14} />
          Save to Drive
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
};

/* Public wrapper — guarantees consistent spacing from whatever sits above it
   (download buttons, success text) in every tool that renders this. */
const SaveToDriveButton = (props: SaveToDriveButtonProps) => {
  if (!props.downloadUrl) return null;
  return (
    <div style={{ marginTop: '10px' }}>
      <SaveToDriveButtonBody {...props} />
    </div>
  );
};

export default SaveToDriveButton;
