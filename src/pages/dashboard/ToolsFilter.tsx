import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Lock, LayoutList, LayoutGrid } from 'lucide-react';
import { categories, toolsData, toolCountByCategory, TOTAL_TOOLS } from '../../data/toolsData';
import { useSubscription, FREE_CATEGORIES } from '../../context/SubscriptionContext';
import {
  DEFAULT_FILTER, SORT_OPTIONS, readFilter, filterQuery, applyFilter, readCols, writeCols,
  type ToolFilter, type ToolCols,
} from '../../utils/toolFilters';

/* Filter page for the Tools list (a pushed screen; the app bar supplies Back
   and the "Filter" title). Edits a draft — nothing applies until Done, and
   Reset only returns the draft to the defaults. */
const ToolsFilter = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isPaid } = useSubscription();
  const q = params.get('q') ?? '';

  const [draft, setDraft] = useState<ToolFilter>(() => readFilter(params));
  const [cols, setCols] = useState<ToolCols>(readCols);
  const set = (patch: Partial<ToolFilter>) => setDraft(d => ({ ...d, ...patch }));

  const matches = applyFilter(toolsData, draft, q).length;
  const isDefault = draft.cat === DEFAULT_FILTER.cat && draft.sort === DEFAULT_FILTER.sort && cols === 1;

  const done = () => {
    writeCols(cols);
    navigate(`/dashboard/tools${filterQuery(draft, q)}`, { replace: true });
  };
  const reset = () => { setDraft(DEFAULT_FILTER); setCols(1); };

  const section = (title: string) => (
    <h2 className="t-caps" style={{ margin: '0 0 12px', color: 'var(--ink-faint)' }}>{title}</h2>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingBottom: '150px' }}>
      {/* ── Category ── */}
      <section>
        {section('Category')}
        <div role="radiogroup" aria-label="Category" style={{ background: 'var(--surface)', borderRadius: '24px', padding: '8px' }}>
          {categories.map(cat => {
            const on = draft.cat === cat.id;
            const count = cat.id === 'all' ? TOTAL_TOOLS : (toolCountByCategory[cat.id] ?? 0);
            const locked = !isPaid && cat.id !== 'all' && !FREE_CATEGORIES.has(cat.id);
            return (
              <button
                key={cat.id}
                role="radio"
                aria-checked={on}
                onClick={() => set({ cat: cat.id })}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', width: '100%', minHeight: '52px',
                  padding: '0 12px', border: 'none', borderRadius: '16px', textAlign: 'left', cursor: 'pointer',
                  background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                  color: 'var(--ink)', fontSize: '16px', fontWeight: on ? 700 : 500,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {cat.id === 'all' ? 'All tools' : cat.name}
                  {locked && <Lock size={14} aria-label="PRO" style={{ color: 'var(--ink-faint)' }} />}
                </span>
                <span style={{ fontSize: '14px', color: 'var(--ink-faint)', fontWeight: 500 }}>{count}</span>
                <span aria-hidden style={{
                  width: '24px', height: '24px', borderRadius: '9999px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: on ? 'var(--accent)' : 'var(--surface-high)', color: 'var(--on-accent)',
                }}>
                  {on && <Check size={14} strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Sort ── */}
      <section>
        {section('Sort by')}
        <div className="segmented" role="tablist" aria-label="Sort by">
          {SORT_OPTIONS.map(o => (
            <button key={o.id} role="tab" aria-selected={draft.sort === o.id} onClick={() => set({ sort: o.id })}>
              {o.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Layout ── */}
      <section>
        {section('Layout')}
        <div className="segmented" role="tablist" aria-label="Layout">
          {([1, 2] as const).map(n => {
            const Icon = n === 1 ? LayoutList : LayoutGrid;
            return (
              <button key={n} role="tab" aria-selected={cols === n} onClick={() => setCols(n)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Icon size={18} /> {n === 1 ? 'List' : 'Grid'}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Actions: pinned above the home indicator ── */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30,
        display: 'flex', flexWrap: 'wrap', gap: '12px',
        padding: '16px max(24px, env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left))',
        background: 'color-mix(in srgb, var(--canvas) 88%, transparent)',
        backdropFilter: 'blur(24px) saturate(190%)', WebkitBackdropFilter: 'blur(24px) saturate(190%)',
      }}>
        <p aria-live="polite" style={{ width: '100%', margin: 0, textAlign: 'center', fontSize: '14px', lineHeight: '20px', color: 'var(--ink-muted)' }}>
          {matches === 0 ? 'No tools match these filters' : `${matches} tool${matches !== 1 ? 's' : ''} match${matches === 1 ? 'es' : ''}`}
        </p>
        <button className="btn-secondary" onClick={reset} disabled={isDefault} style={{ flex: 1, opacity: isDefault ? 0.55 : 1 }}>
          Reset
        </button>
        <button className="btn-primary" onClick={done} disabled={matches === 0} style={{ flex: 2 }}>
          Done
        </button>
      </div>
    </div>
  );
};

export default ToolsFilter;
