/* Word-level diff (longest common subsequence), for Compare PDFs. */

export type DiffOp = { type: 'same' | 'add' | 'del'; text: string };

const MAX_CELLS = 4_000_000; // ~2000×2000 words; beyond that, diff line by line

function lcsDiff(a: string[], b: string[], join: string): DiffOp[] {
  const n = a.length, m = b.length;
  // Trim the common prefix/suffix first — typical revisions differ in a few places.
  let start = 0;
  while (start < n && start < m && a[start] === b[start]) start++;
  let endA = n, endB = m;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const A = a.slice(start, endA), B = b.slice(start, endB);
  const ops: DiffOp[] = [];
  if (start) ops.push({ type: 'same', text: a.slice(0, start).join(join) });

  const rows = A.length, cols = B.length;
  const table = new Uint32Array((rows + 1) * (cols + 1));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i * (cols + 1) + j] = A[i] === B[j]
        ? table[(i + 1) * (cols + 1) + j + 1] + 1
        : Math.max(table[(i + 1) * (cols + 1) + j], table[i * (cols + 1) + j + 1]);
    }
  }
  const push = (type: DiffOp['type'], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text += join + text; else ops.push({ type, text });
  };
  let i = 0, j = 0;
  while (i < rows && j < cols) {
    if (A[i] === B[j]) { push('same', A[i]); i++; j++; }
    else if (table[(i + 1) * (cols + 1) + j] >= table[i * (cols + 1) + j + 1]) push('del', A[i++]);
    else push('add', B[j++]);
  }
  while (i < rows) push('del', A[i++]);
  while (j < cols) push('add', B[j++]);

  if (endA < n) push('same', a.slice(endA).join(join));
  return ops;
}

/** Differences from `a` to `b`, word by word (line by line for very long texts). */
export function diffWords(a: string, b: string): DiffOp[] {
  const wa = a.split(/\s+/).filter(Boolean), wb = b.split(/\s+/).filter(Boolean);
  if (wa.length * wb.length <= MAX_CELLS) return lcsDiff(wa, wb, ' ');
  return lcsDiff(a.split('\n'), b.split('\n'), '\n');
}

/** Number of changed regions (each run of additions/deletions counts once). */
export function changeCount(ops: DiffOp[]): number {
  let n = 0, inChange = false;
  for (const op of ops) {
    if (op.type === 'same') inChange = false;
    else if (!inChange) { n++; inChange = true; }
  }
  return n;
}
