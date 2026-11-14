/* Page-range input shared by the page tools ("1-3, 5, 8-").

   Accepted parts, comma-separated, 1-based:
     5        a single page
     2-4      an inclusive range (4-2 is read as 2-4)
     8-       page 8 to the last page
     -3       first page to page 3
     all      every page
   Invalid or out-of-range parts are reported, never silently dropped. */

export interface PageRanges {
  /** Each part as its own list of pages, in input order (for "one file per range"). */
  groups: number[][];
  /** All selected pages, ascending, without duplicates. */
  pages: number[];
  /** Human-readable problems; empty when the input is fully valid. */
  errors: string[];
}

export function parsePageRanges(input: string, pageCount: number): PageRanges {
  const groups: number[][] = [];
  const errors: string[] = [];
  const parts = input.split(/[,;]/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) errors.push('Enter at least one page number or range.');

  for (const part of parts) {
    if (/^all$/i.test(part)) {
      groups.push(Array.from({ length: pageCount }, (_, i) => i + 1));
      continue;
    }
    const m = part.match(/^(\d*)\s*[-–—]\s*(\d*)$/);
    if (m && (m[1] || m[2])) {
      let a = m[1] ? Number(m[1]) : 1;
      let b = m[2] ? Number(m[2]) : pageCount;
      if (a > b) [a, b] = [b, a];
      if (a < 1 || b > pageCount) {
        errors.push(`"${part}" is outside the document (pages 1–${pageCount}).`);
        continue;
      }
      groups.push(Array.from({ length: b - a + 1 }, (_, i) => a + i));
      continue;
    }
    if (/^\d+$/.test(part)) {
      const n = Number(part);
      if (n < 1 || n > pageCount) errors.push(`Page ${n} doesn't exist (pages 1–${pageCount}).`);
      else groups.push([n]);
      continue;
    }
    errors.push(`"${part}" is not a page number or range.`);
  }

  const pages = [...new Set(groups.flat())].sort((x, y) => x - y);
  return { groups, pages, errors };
}
