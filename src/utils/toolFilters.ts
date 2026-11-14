/* Tools-list filter state, shared by the Tools screen and its filter page.
   Category and sort live in the URL (?cat=&sort=), so the filter page can hand
   its result back with a plain navigation and the back button behaves. The
   list layout is a device preference, persisted under its existing key. */

export type ToolSort = 'recommended' | 'az';
export type ToolCols = 1 | 2;

export interface ToolFilter {
  cat: string;      // a `categories` id; 'all' = no category filter
  sort: ToolSort;
}

export const DEFAULT_FILTER: ToolFilter = { cat: 'all', sort: 'recommended' };

export const SORT_OPTIONS: { id: ToolSort; label: string }[] = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'az', label: 'A–Z' },
];

export const readFilter = (params: URLSearchParams): ToolFilter => ({
  cat: params.get('cat') || DEFAULT_FILTER.cat,
  sort: params.get('sort') === 'az' ? 'az' : 'recommended',
});

/** Query string for a filter (+ an optional search query); defaults are omitted. */
export const filterQuery = (f: ToolFilter, q = ''): string => {
  const p = new URLSearchParams();
  if (q.trim()) p.set('q', q.trim());
  if (f.cat !== DEFAULT_FILTER.cat) p.set('cat', f.cat);
  if (f.sort !== DEFAULT_FILTER.sort) p.set('sort', f.sort);
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** How many settings differ from the defaults — drives the filter button's badge. */
export const activeFilterCount = (f: ToolFilter): number =>
  (f.cat !== DEFAULT_FILTER.cat ? 1 : 0) + (f.sort !== DEFAULT_FILTER.sort ? 1 : 0);

export function applyFilter<T extends { name: string; desc: string; category: string }>(
  tools: T[], f: ToolFilter, q = '',
): T[] {
  const query = q.trim().toLowerCase();
  const out = tools.filter(t =>
    (f.cat === 'all' || t.category === f.cat) &&
    (!query || t.name.toLowerCase().includes(query) || t.desc.toLowerCase().includes(query)));
  return f.sort === 'az' ? [...out].sort((a, b) => a.name.localeCompare(b.name)) : out;
}

const COLS_KEY = 'zenith_tools_cols';   // existing key — do not rename (CLAUDE.md rule 1)

export const readCols = (): ToolCols => {
  // Grid (2 columns) by default; list only when the user picked it
  try { return localStorage.getItem(COLS_KEY) === '1' ? 1 : 2; } catch { return 2; }
};
export const writeCols = (n: ToolCols) => {
  try { localStorage.setItem(COLS_KEY, String(n)); } catch { /* private mode */ }
};
