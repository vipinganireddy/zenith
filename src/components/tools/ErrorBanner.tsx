import { AlertCircle } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

const ErrorBanner = ({ message, onDismiss }: ErrorBannerProps) => {
  if (!message) return null;

  return (
    <div style={{
      margin: '0 0 16px 0', padding: '12px 16px',
      background: 'var(--danger-subtle)', border: '1px solid var(--danger-border)',
      borderRadius: '12px', color: 'var(--danger)', fontSize: '14px',
      display: 'flex', alignItems: 'center', gap: '8px',
    }}>
      <AlertCircle size={15} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '20px', lineHeight: 1, padding: 0, width: '32px', height: '32px', margin: '-6px -8px -6px 0', flexShrink: 0, borderRadius: '8px' }}
      >
        ×
      </button>
    </div>
  );
};

export default ErrorBanner;
