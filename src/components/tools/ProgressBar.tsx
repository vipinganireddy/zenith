interface ProgressBarProps {
  progress: number;
  color: string;
  trackColor?: string;
}

export default function ProgressBar({ progress, color, trackColor = 'var(--surface-high)' }: ProgressBarProps) {
  return (
    <div style={{ height: '6px', background: trackColor, borderRadius: '9999px', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: '100%', borderRadius: '9999px', background: color, transform: `scaleX(${progress / 100})`, transformOrigin: 'left', transition: 'transform var(--dur-spring) var(--ease-spring)' }} />
    </div>
  );
}
