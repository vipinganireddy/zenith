import { Info } from 'lucide-react';

/** Lists what a conversion could not reproduce exactly, so nothing goes missing silently. */
export default function ConversionNotes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '12px', background: 'var(--neutral-50)', border: '1px solid var(--border-color)', textAlign: 'left' }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
        <Info size={13} /> Conversion notes
      </p>
      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {notes.map(n => <li key={n}>{n}</li>)}
      </ul>
    </div>
  );
}
