/* Reference formatting for the Citation Generator: APA 7, MLA 9, Chicago 17 (bibliography).
   Output marks italics as *text*; use citationHtml / citationPlain to render or copy it. */

export type CitationStyle = 'apa' | 'mla' | 'chicago';
export type SourceType = 'book' | 'journal' | 'website' | 'newspaper' | 'thesis';

export interface Citation {
  id: string;
  style: CitationStyle;
  type: SourceType;
  authors: string;
  year: string;
  title: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  /** Access date for websites; publication date ("May 23, 2024") for newspapers. */
  accessDate?: string;
  publisher?: string;
  city?: string;
  edition?: string;
  website?: string;
  newspaper?: string;
  university?: string;
}

export interface Person { family: string; given: string }

/** "Smith, John; Doe, Jane" · "John Smith and Jane Doe" · "John Smith, Jane Doe" · "WHO" */
export function parseAuthors(input: string): Person[] {
  const s = input.trim();
  if (!s) return [];
  let parts = s.split(/\s*(?:;|\n|\s&\s|\sand\s)\s*/i).filter(Boolean);
  if (parts.length === 1 && s.includes(',')) {
    const bits = s.split(/\s*,\s*/).filter(Boolean);
    // "John Smith, Jane Doe" (every piece is a full name) vs "Smith, John, Doe, Jane" (pairs).
    parts = bits.every(b => b.includes(' ')) ? bits
      : bits.reduce<string[]>((acc, b, i) => (i % 2 ? (acc[acc.length - 1] += `, ${b}`, acc) : [...acc, b]), []);
  }
  return parts.map(p => {
    const comma = p.indexOf(',');
    if (comma >= 0) return { family: p.slice(0, comma).trim(), given: p.slice(comma + 1).trim() };
    const words = p.split(/\s+/);
    // Keep lowercase particles with the family name: "Ludwig van Beethoven" → "van Beethoven".
    let k = words.length - 1;
    while (k > 1 && /^(van|von|de|der|den|da|di|du|la|le|del|della|dos|das|bin|al)$/i.test(words[k - 1])) k--;
    return words.length === 1 ? { family: p, given: '' } : { family: words.slice(k).join(' '), given: words.slice(0, k).join(' ') };
  });
}

/** "John Alan" → "J. A."; "Jean-Paul" → "J.-P."; "J.A." → "J. A." */
export function initials(given: string): string {
  return given.replace(/\./g, ' ').split(/\s+/).filter(Boolean)
    .map(w => w.split('-').map(h => `${h[0].toUpperCase()}.`).join('-')).join(' ');
}

const apaName = (p: Person) => (p.given ? `${p.family}, ${initials(p.given)}` : p.family);
const invName = (p: Person) => (p.given ? `${p.family}, ${p.given}` : p.family);
const fullName = (p: Person) => (p.given ? `${p.given} ${p.family}` : p.family);

function apaAuthors(a: Person[]): string {
  const n = a.map(apaName);
  if (n.length <= 1) return n[0] ?? '';
  if (n.length === 2) return `${n[0]}, & ${n[1]}`;
  if (n.length <= 20) return `${n.slice(0, -1).join(', ')}, & ${n[n.length - 1]}`;
  return `${n.slice(0, 19).join(', ')}, . . . ${n[n.length - 1]}`;
}
function mlaAuthors(a: Person[]): string {
  if (a.length <= 1) return a[0] ? invName(a[0]) : '';
  if (a.length === 2) return `${invName(a[0])}, and ${fullName(a[1])}`;
  return `${invName(a[0])}, et al.`;
}
function chicagoAuthors(a: Person[]): string {
  if (a.length <= 1) return a[0] ? invName(a[0]) : '';
  const list = a.length > 10 ? a.slice(0, 7) : a;
  const rest = list.slice(1).map(fullName);
  if (a.length > 10) return `${[invName(a[0]), ...rest].join(', ')}, et al.`;
  return a.length === 2 ? `${invName(a[0])}, and ${rest[0]}` : `${[invName(a[0]), ...rest.slice(0, -1)].join(', ')}, and ${rest[rest.length - 1]}`;
}

/** Append a full stop unless the text already ends a sentence. */
const end = (s: string) => (/[.?!]["*]?$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const doiUrl = (doi?: string) => {
  const d = doi?.trim().replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  return d ? `https://doi.org/${d}` : '';
};
const pageRange = (p?: string) => (p ?? '').trim().replace(/\s*[-–—]\s*/, '–');
/** "May 23, 2024" → "2024, May 23" (APA's date order); falls back to the year. */
const apaDate = (date: string | undefined, year: string) => {
  const d = (date ?? '').trim();
  const m = d.match(/^(.*?)[,\s]+(\d{4})$/);
  return m ? `${m[2]}, ${m[1].trim()}` : (year.trim() || 'n.d.');
};
const sentence = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).map(p => end(p as string)).join(' ');

function apa(c: Citation): string {
  const who = apaAuthors(parseAuthors(c.authors));
  const date = `(${c.type === 'newspaper' ? apaDate(c.accessDate, c.year) : c.year.trim() || 'n.d.'})`;
  const title = c.title.trim() || 'Untitled';
  // No author: the title moves into the author position.
  const head = (t: string) => (who ? `${end(who)} ${date}.` : `${end(t)} ${date}.`);
  const doi = doiUrl(c.doi);
  switch (c.type) {
    case 'book': {
      const t = `*${title}*${c.edition ? ` (${c.edition} ed.)` : ''}`;
      return [head(t), who && end(t), c.publisher && end(c.publisher), doi || c.url].filter(Boolean).join(' ');
    }
    case 'journal': {
      const src = `*${c.journal || 'Journal'}*${c.volume ? `, *${c.volume}*` : ''}${c.issue ? `(${c.issue})` : ''}${c.pages ? `, ${pageRange(c.pages)}` : ''}`;
      return [head(title), who && end(title), end(src), doi || c.url].filter(Boolean).join(' ');
    }
    case 'website': {
      const t = `*${title}*`;
      const site = c.website && c.website !== who ? end(c.website) : '';
      const link = c.url ? (c.accessDate ? `Retrieved ${c.accessDate}, from ${c.url}` : c.url) : '';
      return [head(t), who && end(t), site, link].filter(Boolean).join(' ');
    }
    case 'newspaper':
      return [head(title), who && end(title), end(`*${c.newspaper || 'Newspaper'}*${c.pages ? `, ${c.pages}` : ''}`), c.url].filter(Boolean).join(' ');
    case 'thesis':
      return [head(`*${title}*`), who && `*${title}* [Doctoral dissertation, ${c.university || 'University'}].`].filter(Boolean).join(' ');
  }
}

function mla(c: Citation): string {
  const who = mlaAuthors(parseAuthors(c.authors));
  const title = c.title.trim() || 'Untitled';
  const q = (t: string) => `"${end(t)}"`;
  const tail = (...p: (string | undefined | false)[]) => end(p.filter(Boolean).join(', '));
  switch (c.type) {
    case 'book':
      return sentence(who, `*${title}*`) + ' ' + tail(c.edition && `${c.edition} ed.`, c.publisher, c.year);
    case 'journal':
      return [who && end(who), q(title), tail(`*${c.journal || 'Journal'}*`, c.volume && `vol. ${c.volume}`, c.issue && `no. ${c.issue}`, c.year,
        c.pages && `${/[-–]/.test(c.pages) ? 'pp.' : 'p.'} ${pageRange(c.pages)}`, doiUrl(c.doi) || c.url)].filter(Boolean).join(' ');
    case 'website':
      return [who && end(who), q(title), tail(c.website && `*${c.website}*`, c.year, c.url), c.accessDate && `Accessed ${end(c.accessDate)}`].filter(Boolean).join(' ');
    case 'newspaper':
      return [who && end(who), q(title), tail(`*${c.newspaper || 'Newspaper'}*`, c.accessDate || c.year, c.pages && `p. ${c.pages}`, c.url)].filter(Boolean).join(' ');
    case 'thesis':
      return [who && end(who), `*${end(title)}*`, tail(c.year, `${c.university || 'University'}`, 'PhD dissertation')].filter(Boolean).join(' ');
  }
}

function chicago(c: Citation): string {
  const who = chicagoAuthors(parseAuthors(c.authors));
  const title = c.title.trim() || 'Untitled';
  const q = (t: string) => `"${end(t)}"`;
  switch (c.type) {
    case 'book':
      return sentence(who, `*${title}*`, c.edition && `${c.edition} ed`, [c.city && c.publisher ? `${c.city}: ${c.publisher}` : c.publisher || c.city, c.year].filter(Boolean).join(', '));
    case 'journal':
      return [who && end(who), q(title),
        end(`*${c.journal || 'Journal'}*${c.volume ? ` ${c.volume}` : ''}${c.issue ? `, no. ${c.issue}` : ''}${c.year ? ` (${c.year})` : ''}${c.pages ? `: ${pageRange(c.pages)}` : ''}`),
        doiUrl(c.doi) || c.url].filter(Boolean).map(s => end(s as string)).join(' ');
    case 'website':
      return [who && end(who), q(title), c.website && end(c.website), c.year && end(c.year), c.accessDate && `Accessed ${end(c.accessDate)}`, c.url && end(c.url)].filter(Boolean).join(' ');
    case 'newspaper':
      return [who && end(who), q(title), end(`*${c.newspaper || 'Newspaper'}*, ${c.accessDate || c.year}`), c.url && end(c.url)].filter(Boolean).join(' ');
    case 'thesis':
      return [who && end(who), q(title), end(`PhD diss., ${c.university || 'University'}, ${c.year}`)].filter(Boolean).join(' ');
  }
}

export function formatCitation(c: Citation): string {
  return c.style === 'mla' ? mla(c) : c.style === 'chicago' ? chicago(c) : apa(c);
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
/** Italics as <i> — for display and for pasting into Word / Google Docs. */
export const citationHtml = (s: string) => escapeHtml(s).replace(/\*([^*]+)\*/g, '<i>$1</i>');
/** Plain text without the italic markers. */
export const citationPlain = (s: string) => s.replace(/\*([^*]+)\*/g, '$1');

/** Reference lists are alphabetical by first author (or title when there is none). */
export const sortKey = (c: Citation) => citationPlain(formatCitation(c)).replace(/^["“]/, '').toLowerCase();
