/** "example.com" → https://…, "a@b.co" → mailto:… ; anything that isn't web, mail or phone is refused (no javascript: URIs). */
export function normaliseLink(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (/^[^\s@/]+@[^\s@/]+\.[a-z]{2,}$/i.test(v)) return `mailto:${v}`;
  if (/^\+?[\d\s()-]{6,}$/.test(v)) return `tel:${v.replace(/[\s()-]/g, '')}`;
  if (/^[a-z][a-z\d+.-]*:/i.test(v)) return null;
  return /^[^\s]+\.[^\s]{2,}/.test(v) ? `https://${v}` : null;
}
