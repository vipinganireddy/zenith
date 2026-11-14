/* Does a file match an <input accept="…"> string?
   Same rules the browser uses: comma-separated MIME types ("application/pdf"),
   wildcards ("image/*") and extensions (".docx"). An empty accept takes anything. */

export function matchesAccept(name: string, mimeType: string, accept: string | null | undefined): boolean {
  const rules = (accept ?? '').split(',').map(r => r.trim().toLowerCase()).filter(Boolean);
  if (rules.length === 0) return true;
  const lowerName = name.toLowerCase();
  const type = (mimeType || '').toLowerCase();
  return rules.some(rule => {
    if (rule.startsWith('.')) return lowerName.endsWith(rule);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}
