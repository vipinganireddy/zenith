import type { ReactNode } from 'react';

interface RingProps {
  /** 0–1 */
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
  label?: string;
}

/* Progress ring: a surface-high track with a round-capped arc that sweeps in
   on the shared spring (the `ring-sweep` keyframe in index.css; it is skipped
   under Reduce Motion). */
const Ring = ({ value, size = 112, stroke = 10, color = 'var(--accent)', children, label }: RingProps) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div role="img" aria-label={label} style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-high)" strokeWidth={stroke} />
        {v > 0 && (
          <circle
            className="ring-arc"
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c}
            style={{ strokeDashoffset: c * (1 - v), ['--ring-c' as string]: c }}
          />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        {children}
      </div>
    </div>
  );
};

export default Ring;
