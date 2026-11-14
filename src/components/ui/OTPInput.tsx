import { useLayoutEffect, useRef } from 'react';

const LENGTH = 6;

/**
 * Six single-digit boxes for a verification code.
 *
 * Reads the latest value through a ref, not the render closure: focus moves to
 * the next box synchronously, so a fast typist (or a password manager) can
 * land the next keystroke before React re-renders, and a stale `value` would
 * wipe the digit just entered. Multi-digit input — paste, or iOS/Android SMS
 * autofill, which drops the whole code into one box — is spread across boxes.
 */
export default function OTPInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const latest = useRef(value);
  // Pick up resets from the parent (e.g. "Go back" clears the code).
  useLayoutEffect(() => { latest.current = value; }, [value]);

  const digitsOf = (v: string) => Array.from({ length: LENGTH }, (_, i) => v[i] || '');
  const commit = (digits: string[]) => {
    const next = digits.join('');
    latest.current = next;
    onChange(next);
  };

  const fillFrom = (start: number, incoming: string) => {
    const digits = digitsOf(latest.current);
    const chars = incoming.slice(0, LENGTH - start).split('');
    chars.forEach((c, k) => { digits[start + k] = c; });
    commit(digits);
    refs.current[Math.min(start + chars.length, LENGTH - 1)]?.focus();
  };

  const handleChange = (i: number, raw: string) => {
    const typed = raw.replace(/\D/g, '');
    if (typed.length > 1) { fillFrom(raw.length === LENGTH ? 0 : i, typed); return; }
    const digits = digitsOf(latest.current);
    digits[i] = typed;
    commit(digits);
    if (typed && i < LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const digits = digitsOf(latest.current);
    if (e.key === 'Backspace') {
      if (digits[i]) {
        digits[i] = '';
      } else if (i > 0) {
        digits[i - 1] = '';
        refs.current[i - 1]?.focus();
      }
      commit(digits);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < LENGTH - 1) {
      refs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    fillFrom(0, e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH));
  };

  const digits = digitsOf(value);
  return (
    // Boxes share the available width (max 46px each) so six fit any phone.
    <div style={{ display: 'flex', gap: 'clamp(6px, 2vw, 10px)', justifyContent: 'center', width: '100%', maxWidth: '336px', margin: '0 auto' }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          // Allow a full code in any box so autofill/paste can be spread out.
          maxLength={LENGTH}
          value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
          style={{
            flex: '1 1 0', minWidth: 0, maxWidth: '46px', height: '54px', padding: 0, textAlign: 'center', fontSize: '24px', fontWeight: 700,
            borderRadius: '12px', border: `1.5px solid ${d ? 'var(--primary)' : 'var(--border-color)'}`,
            background: d ? 'var(--primary-subtle)' : 'var(--bg-main)',
            color: 'var(--text-main)', outline: 'none', transition: 'border-color 0.15s',
          }}
        />
      ))}
    </div>
  );
}
