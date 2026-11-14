import { useState, type CSSProperties } from 'react';
import { Link, CheckCircle, Copy, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import { formatCitation, citationHtml, citationPlain, sortKey, type Citation, type CitationStyle, type SourceType } from '../../../utils/citation';

/** Copy with italics intact for Word / Google Docs, plain text everywhere else. */
async function copyRich(texts: string[]) {
  const html = texts.map(t => `<p>${citationHtml(t)}</p>`).join('');
  const plain = texts.map(citationPlain).join('\n\n');
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    })]);
  } catch {
    await navigator.clipboard.writeText(plain);
  }
}

const STYLES: { value: CitationStyle; label: string }[] = [
  { value: 'apa', label: 'APA 7th' },
  { value: 'mla', label: 'MLA 9th' },
  { value: 'chicago', label: 'Chicago 17th' },
];

const TYPES: { value: SourceType; label: string }[] = [
  { value: 'book', label: 'Book' },
  { value: 'journal', label: 'Journal Article' },
  { value: 'website', label: 'Website' },
  { value: 'newspaper', label: 'Newspaper' },
  { value: 'thesis', label: 'Thesis / Dissertation' },
];

const empty = (): Citation => ({
  id: Math.random().toString(36).slice(2),
  style: 'apa',
  type: 'book',
  authors: '',
  year: new Date().getFullYear().toString(),
  title: '',
  journal: '',
  volume: '',
  issue: '',
  pages: '',
  doi: '',
  url: '',
  accessDate: '',
  publisher: '',
  city: '',
  edition: '',
  website: '',
  newspaper: '',
  university: '',
});

const fieldStyle: CSSProperties = { width: '100%', minHeight: '48px', padding: '0 16px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: '16px', lineHeight: '24px', boxSizing: 'border-box' };
const labelStyle: CSSProperties = { display: 'block', margin: '0 0 8px', fontSize: '12px', lineHeight: '16px', fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink-faint)' };
const rowStyle: CSSProperties = { display: 'flex', gap: '12px', flexWrap: 'wrap' };
const addBtnStyle: CSSProperties = { height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px' };

const inp = (val: string, onChange: (v: string) => void, placeholder = '') => (
  <input value={val} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={fieldStyle} />
);

const CitationGenerator = () => {
  const [citations, setCitations] = useState<Citation[]>([empty()]);
  const [activeId, setActiveId] = useState<string>(citations[0].id);
  const [copied, setCopied] = useState(false);

  const active = citations.find(c => c.id === activeId) ?? citations[0];

  const update = (key: keyof Citation, val: string) => {
    setCitations(prev => prev.map(c => c.id === activeId ? { ...c, [key]: val } : c));
  };

  const addCitation = () => {
    const n = empty();
    setCitations(prev => [...prev, n]);
    setActiveId(n.id);
  };

  const removeCitation = (id: string) => {
    if (citations.length === 1) return;
    const remaining = citations.filter(c => c.id !== id);
    setCitations(remaining);
    if (activeId === id) setActiveId(remaining[0].id);
  };

  const formatted = formatCitation(active);

  const flashCopied = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
  // A reference list is alphabetical by first author.
  const copyAll = () => copyRich([...citations].sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map(formatCitation)).then(flashCopied);

  return (
    <ToolWorkspaceLayout title="Citation Generator" description="Generate APA, MLA, and Chicago citations for books, journals, websites, and more.">
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        {/* Left panel */}
        <div style={{ flex: 2, padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px', borderRight: '1px solid var(--hairline)', background: 'var(--card-bg)', overflowY: 'auto' }}>
          {/* Style + Type row */}
          <div style={rowStyle}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <label style={labelStyle}>Citation Style</label>
              <div className="segmented" role="tablist" aria-label="Citation style">
                {STYLES.map(s => (
                  <button key={s.value} role="tab" aria-selected={active.style === s.value} onClick={() => update('style', s.value)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <label style={labelStyle}>Source Type</label>
              <select value={active.type} onChange={e => update('type', e.target.value)}
                style={fieldStyle}>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* Common fields */}
          <div>
            <label style={labelStyle}>Author(s) <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(separate people with ;)</span></label>
            {inp(active.authors, v => update('authors', v), 'Smith, John; Doe, Jane')}
          </div>
          <div style={rowStyle}>
            <div style={{ flex: '2 1 160px', minWidth: 0 }}>
              <label style={labelStyle}>Title</label>
              {inp(active.title, v => update('title', v), 'The Title of the Work')}
            </div>
            <div style={{ flex: '1 1 90px', minWidth: 0 }}>
              <label style={labelStyle}>Year</label>
              {inp(active.year, v => update('year', v), '2024')}
            </div>
          </div>

          {/* Type-specific fields */}
          {active.type === 'book' && (
            <div style={rowStyle}>
              <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                <label style={labelStyle}>Publisher</label>
                {inp(active.publisher ?? '', v => update('publisher', v), 'Penguin Books')}
              </div>
              <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                <label style={labelStyle}>City</label>
                {inp(active.city ?? '', v => update('city', v), 'New York')}
              </div>
              <div style={{ flex: '1 1 100px', minWidth: 0 }}>
                <label style={labelStyle}>Edition</label>
                {inp(active.edition ?? '', v => update('edition', v), '3rd')}
              </div>
            </div>
          )}
          {active.type === 'journal' && (
            <>
              <div>
                <label style={labelStyle}>Journal Name</label>
                {inp(active.journal ?? '', v => update('journal', v), 'Nature, Science, JAMA…')}
              </div>
              <div style={rowStyle}>
                <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                  <label style={labelStyle}>Volume</label>
                  {inp(active.volume ?? '', v => update('volume', v), '42')}
                </div>
                <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                  <label style={labelStyle}>Issue</label>
                  {inp(active.issue ?? '', v => update('issue', v), '3')}
                </div>
                <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                  <label style={labelStyle}>Pages</label>
                  {inp(active.pages ?? '', v => update('pages', v), '100–115')}
                </div>
              </div>
              <div>
                <label style={labelStyle}>DOI (optional)</label>
                {inp(active.doi ?? '', v => update('doi', v), '10.1000/xyz123')}
              </div>
            </>
          )}
          {active.type === 'website' && (
            <>
              <div>
                <label style={labelStyle}>Website / Organization Name</label>
                {inp(active.website ?? '', v => update('website', v), 'CDC, WHO, BBC…')}
              </div>
              <div>
                <label style={labelStyle}>URL</label>
                {inp(active.url ?? '', v => update('url', v), 'https://example.com/page')}
              </div>
              <div>
                <label style={labelStyle}>Access Date</label>
                {inp(active.accessDate ?? '', v => update('accessDate', v), 'May 23, 2024')}
              </div>
            </>
          )}
          {active.type === 'newspaper' && (
            <>
              <div>
                <label style={labelStyle}>Newspaper Name</label>
                {inp(active.newspaper ?? '', v => update('newspaper', v), 'The New York Times')}
              </div>
              <div style={rowStyle}>
                <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                  <label style={labelStyle}>Publication Date</label>
                  {inp(active.accessDate ?? '', v => update('accessDate', v), 'May 23, 2024')}
                </div>
                <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                  <label style={labelStyle}>Page(s)</label>
                  {inp(active.pages ?? '', v => update('pages', v), 'A1')}
                </div>
              </div>
            </>
          )}
          {active.type === 'thesis' && (
            <div>
              <label style={labelStyle}>University / Institution</label>
              {inp(active.university ?? '', v => update('university', v), 'Harvard University')}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, minWidth: 0, padding: '28px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Link size={18} color="var(--accent)" /> Citations
            </h3>
            <button onClick={addCitation} className="btn-secondary" style={addBtnStyle}>
              <Plus size={14} /> Add
            </button>
          </div>

          {/* Citation list tabs */}
          {citations.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {citations.map((c, i) => (
                <div key={c.id} onClick={() => setActiveId(c.id)}
                  aria-current={activeId === c.id ? 'true' : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '48px', padding: '0 4px 0 16px', borderRadius: '16px', background: activeId === c.id ? 'color-mix(in srgb, var(--accent) 14%, var(--surface))' : 'var(--surface)', boxShadow: activeId === c.id ? 'inset 0 0 0 2px var(--accent)' : 'none', cursor: 'pointer' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: '14px', lineHeight: '20px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i + 1}. {c.title || 'Untitled'}
                  </span>
                  <button onClick={e => { e.stopPropagation(); removeCitation(c.id); }}
                    aria-label={`Remove citation ${i + 1}`}
                    style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Formatted output */}
          <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '24px', fontSize: '14px', lineHeight: 1.7, color: 'var(--ink)', minHeight: '80px', fontFamily: 'Georgia, serif' }}>
            {active.title ? <span dangerouslySetInnerHTML={{ __html: citationHtml(formatted) }} /> : <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontFamily: 'inherit' }}>Fill in the fields to see your citation…</span>}
          </div>

          <AnimatePresence>
            {copied && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--good)', fontSize: '14px' }}>
                <CheckCircle size={14} /> Copied to clipboard!
              </motion.div>
            )}
          </AnimatePresence>

          <button onClick={() => copyRich([formatted]).then(flashCopied)}
            disabled={!active.title}
            className="btn-primary" style={{ width: '100%' }}>
            <Copy size={15} /> Copy This Citation
          </button>

          {citations.length > 1 && (
            <button onClick={copyAll}
              className="btn-secondary" style={{ width: '100%' }}>
              Copy reference list ({citations.length}, A–Z)
            </button>
          )}

          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '20px' }}>
            Formatting follows APA 7th, MLA 9th, and Chicago 17th edition guidelines. Always verify against your institution's style guide.
          </p>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default CitationGenerator;
