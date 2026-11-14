/* ─────────────────────────────────────────────────────────────────────────────
   HTML → vector PDF.

   The browser does the layout; pdf-lib paints the result. The HTML is mounted
   in an off-screen, script-less sandboxed iframe, every word / image / box is
   measured, and each one is drawn at its measured position as real PDF content:

   • selectable, searchable text (standard fonts, horizontally fitted to the
     measured width so lines never drift, whatever font did the layout)
   • embedded images at full resolution — unsupported formats (EMF/WMF) get a
     visible placeholder and a warning instead of silently disappearing
   • table borders, cell/heading backgrounds, highlights, list markers, links
   • page breaks between lines / images / table rows, never through them

   Replaces html2pdf.js, which screenshotted the whole document into ONE canvas:
   no selectable text, multi-MB files, lines sliced at page edges, and blank
   output once a long document exceeded the browser's maximum canvas size.

   The iframe is sandboxed without `allow-scripts`, so HTML from an uploaded
   file (an .html page, CSV cell text, EPUB chapter) can never run code in the
   app, where API keys live in localStorage.
   ───────────────────────────────────────────────────────────────────────────── */
import { fontFor } from './pdfText';
import {
  PDFDocument, StandardFonts, rgb, PDFName, PDFString,
  pushGraphicsState, popGraphicsState, setCharacterSqueeze,
  type PDFFont, type PDFImage, type PDFPage,
} from 'pdf-lib';

export const A4: [number, number] = [595.28, 841.89];
export const A4_LANDSCAPE: [number, number] = [841.89, 595.28];

export interface HtmlToPdfOptions {
  /** Page size in PDF points (flow mode). Default A4 portrait. */
  pageSize?: [number, number];
  /** Page margin in points (flow mode). Default 50pt ≈ 17.6mm. */
  margin?: number;
  /** Extra CSS for the document, applied after the base stylesheet. */
  css?: string;
  /**
   * CSS selector for elements that are each a pre-laid-out page (e.g. a Word
   * section from docx-preview). Their own size becomes the PDF page size and
   * their padding the margins; overflow continues on extra pages.
   */
  pageSelector?: string;
  /** Shrink content wider than the page to fit, instead of clipping it. Default true. */
  fitWidth?: boolean;
  /** Document title written into the PDF metadata. */
  title?: string;
  onProgress?: (fraction: number) => void;
}

export interface HtmlToPdfResult {
  bytes: Uint8Array;
  pageCount: number;
  /** Human-readable notes about content that could not be reproduced exactly. */
  warnings: string[];
}

const PX = 0.75; // 1 CSS px = 0.75 pt

/** Document defaults — a clean, print-like look. User/document CSS overrides these. */
const BASE_CSS = `
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.45;
       overflow-wrap: break-word; -webkit-text-size-adjust: none; }
img, svg, video, canvas { max-width: 100%; height: auto; }
table { border-collapse: collapse; }
pre, code, kbd, samp { font-family: "Courier New", Courier, monospace; }
pre { white-space: pre-wrap; }
`;

// ── Small helpers ─────────────────────────────────────────────────────────────
type RGBA = { r: number; g: number; b: number; a: number };
const ctx2d = document.createElement('canvas').getContext('2d')!;

function parseColor(css: string): RGBA | null {
  if (!css || css === 'transparent') return null;
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    const a = p.length > 3 ? p[3] : 1;
    return a > 0.01 ? { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a } : null;
  }
  // color(srgb r g b / a) — returned by getComputedStyle for color-mix() etc. (0–1 floats)
  const c = css.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
  if (c) {
    const a = c[4] !== undefined ? Number(c[4]) : 1;
    return a > 0.01 ? { r: +c[1], g: +c[2], b: +c[3], a } : null;
  }
  // Anything else (named colours, oklch…): resolve through a 1×1 canvas fill.
  ctx2d.clearRect(0, 0, 1, 1);
  ctx2d.fillStyle = '#000';
  ctx2d.fillStyle = css;
  ctx2d.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx2d.getImageData(0, 0, 1, 1).data;
  return a > 3 ? { r: r / 255, g: g / 255, b: b / 255, a: a / 255 } : null;
}

type Family = 'sans' | 'serif' | 'mono';
function classifyFamily(fontFamily: string): Family {
  const first = fontFamily.split(',')[0].trim().replace(/['"]/g, '').toLowerCase();
  if (/mono|courier|consol|menlo|monaco|code/.test(first)) return 'mono';
  if (/sans/.test(first)) return 'sans';
  if (/serif|times|georgia|garamond|cambria|palatino|baskerville|book|minion|didot|caslon/.test(first)) return 'serif';
  return 'sans';
}

const FONT_NAMES: Record<Family, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

/** Text the standard fonts render identically but can't encode as-is. */
const charClass = (...cps: number[]) => new RegExp(`[${String.fromCodePoint(...cps)}]`, 'gu');
const SPACES = charClass(0xa0, 0x2007, 0x202f);
const INVISIBLE = charClass(0xad, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff);
const HYPHENS = charClass(0x2010, 0x2011);
function normalizeText(s: string): string {
  return s.replace(SPACES, ' ').replace(INVISIBLE, '').replace(HYPHENS, '-').replace(/\t/g, ' ');
}

function applyTextTransform(s: string, t: string, atWordStart: boolean): string {
  if (t === 'uppercase') return s.toUpperCase();
  if (t === 'lowercase') return s.toLowerCase();
  if (t === 'capitalize' && atWordStart) return s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

const metricsCache = new Map<string, { ascent: number; descent: number; space: number }>();
function fontMetrics(cssFont: string) {
  let m = metricsCache.get(cssFont);
  if (!m) {
    ctx2d.font = cssFont;
    const t = ctx2d.measureText('Hgjy');
    const ascent = t.fontBoundingBoxAscent ?? t.actualBoundingBoxAscent;
    const descent = t.fontBoundingBoxDescent ?? t.actualBoundingBoxDescent;
    m = { ascent, descent, space: ctx2d.measureText(' ').width };
    metricsCache.set(cssFont, m);
  }
  return m;
}

const nextFrame = () => new Promise<void>(r => setTimeout(r, 0));

// ── Collected items (layout px, document coordinates) ────────────────────────
interface Box { x: number; top: number; w: number; h: number }
interface TextItem extends Box {
  kind: 'text'; text: string; family: Family; bold: boolean; italic: boolean;
  /** The run's words with their measured x/width, for per-word fallback drawing. */
  words: { text: string; x: number; w: number }[];
  sizePx: number; baseline: number; color: RGBA; underline: boolean; strike: boolean; cssFont: string;
}
interface ImageItem extends Box { kind: 'image'; key: string; source: HTMLImageElement | HTMLCanvasElement | SVGSVGElement; broken?: string }
interface RectItem extends Box {
  kind: 'rect'; fill: RGBA | null;
  borders: { top?: [number, RGBA]; right?: [number, RGBA]; bottom?: [number, RGBA]; left?: [number, RGBA] };
}
interface LinkItem extends Box { kind: 'link'; url: string }
type Item = TextItem | ImageItem | RectItem | LinkItem;

// ── Mount ─────────────────────────────────────────────────────────────────────
async function mountFrame(html: string, css: string, widthPx: number): Promise<HTMLIFrameElement> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin'); // measurable, but scripts never run
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  iframe.style.cssText = `position:fixed;left:-100000px;top:0;width:${widthPx}px;height:2000px;border:0;opacity:0;pointer-events:none;`;
  const styles = `<style>${BASE_CSS}</style><style>${css}</style>`;
  // A full HTML document keeps its own <head>; our base styles go first so its CSS wins.
  const srcdoc = /<html[\s>]|<head[\s>]|<body[\s>]/i.test(html)
    ? (/<head[^>]*>/i.test(html)
        ? html.replace(/<head[^>]*>/i, m => `${m}<meta charset="utf-8">${styles}`)
        : `<!doctype html><html><head><meta charset="utf-8">${styles}</head>${html}</html>`)
    : `<!doctype html><html><head><meta charset="utf-8">${styles}</head><body>${html}</body></html>`;
  const loaded = new Promise<void>(res => { iframe.onload = () => res(); });
  iframe.srcdoc = srcdoc;
  document.body.appendChild(iframe);
  await loaded;
  const doc = iframe.contentDocument!;
  await Promise.all([...doc.images].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
  await doc.fonts?.ready;
  return iframe;
}

// ── List markers (::marker is not in the DOM, so make real text for them) ────
function toRoman(n: number): string {
  const map: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}
function toAlpha(n: number): string {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

function formatCounter(n: number, style: string): string {
  switch (style) {
    case 'none': return '';
    case 'disc': return '•';
    case 'circle': return '–';
    case 'square': return '▪';
    case 'decimal-leading-zero': return (n < 10 && n >= 0 ? '0' : '') + n;
    case 'lower-alpha': case 'lower-latin': return toAlpha(n);
    case 'upper-alpha': case 'upper-latin': return toAlpha(n).toUpperCase();
    case 'lower-roman': return toRoman(n);
    case 'upper-roman': return toRoman(n).toUpperCase();
    default: return String(n);
  }
}

/** Word bullets use private-use glyphs from Symbol/Wingdings, which browsers can't draw. */
const SYMBOL_FONT_GLYPHS: Record<number, string> = {
  0xb7: '•', 0xa7: '▪', 0xd8: '➢', 0xfc: '✓', 0x76: '❖',
  0x6f: '○', 0x6e: '■', 0xa8: '□', 0x71: '❑', 0xe0: '→', 0xe8: '→',
};
function mapSymbolFont(text: string, fontFamily: string): string {
  const symbolic = /symbol|wingdings|webdings/i.test(fontFamily);
  return [...text].map(ch => {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0xf000 && cp <= 0xf0ff) return SYMBOL_FONT_GLYPHS[cp - 0xf000] ?? '•';
    if (symbolic && SYMBOL_FONT_GLYPHS[cp]) return SYMBOL_FONT_GLYPHS[cp];
    return ch;
  }).join('');
}

/** Evaluate a computed `content` value. Returns null for content we can't turn into text (images). */
function resolveContent(content: string, el: Element, counters: Map<string, number>): string | null {
  let out = '';
  let i = 0;
  while (i < content.length) {
    const c = content[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'") {
      i++;
      while (i < content.length && content[i] !== c) {
        if (content[i] === '\\') {
          const hex = content.slice(i + 1).match(/^[0-9a-fA-F]{1,6}\s?/);
          if (hex) { out += String.fromCodePoint(parseInt(hex[0], 16)); i += 1 + hex[0].length; }
          else { out += content[i + 1] ?? ''; i += 2; }
        } else out += content[i++];
      }
      i++;
      continue;
    }
    const fn = content.slice(i).match(/^([a-z-]+)\(([^)]*)\)/i);
    if (fn) {
      const args = fn[2].split(',').map(a => a.trim().replace(/^["']|["']$/g, ''));
      const name = fn[1].toLowerCase();
      if (name === 'counter') out += formatCounter(counters.get(args[0]) ?? 0, args[1] || 'decimal');
      else if (name === 'counters') out += formatCounter(counters.get(args[0]) ?? 0, args[2] || 'decimal');
      else if (name === 'attr') out += el.getAttribute(args[0]) ?? '';
      else if (name === 'url' || name.endsWith('gradient') || name === 'image-set') return null;
      i += fn[0].length;
      continue;
    }
    const kw = content.slice(i).match(/^[a-z-]+/i);
    if (kw) {
      if (kw[0] === 'open-quote') out += '“';
      else if (kw[0] === 'close-quote') out += '”';
      i += kw[0].length;
      continue;
    }
    i++;
  }
  return out;
}

function applyCounterOps(counters: Map<string, number>, value: string, mode: 'reset' | 'set' | 'increment') {
  if (!value || value === 'none') return;
  const toks = value.trim().split(/\s+/);
  for (let i = 0; i < toks.length; i++) {
    const name = toks[i];
    let n = mode === 'increment' ? 1 : 0;
    if (i + 1 < toks.length && /^-?\d+$/.test(toks[i + 1])) n = Number(toks[++i]);
    counters.set(name, mode === 'increment' ? (counters.get(name) ?? 0) + n : n);
  }
}

const SKIP_COPY = new Set(['content', 'counter-reset', 'counter-increment', 'counter-set', 'quotes']);

/**
 * List markers and ::before/::after text are painted by the browser but are not
 * in the DOM, so they can't be measured. Turn each into a real <span> with the
 * same computed style, then switch the pseudo-element off.
 */
function materializeGeneratedContent(doc: Document) {
  const view = doc.defaultView!;
  const counters = new Map<string, number>();
  const listCounts = new Map<Element, number>();
  type Job = { el: Element; where: 'before' | 'after' | 'marker'; text: string; style: CSSStyleDeclaration | null; inside: boolean };
  const jobs: Job[] = [];

  // Read phase (document order) — no DOM writes, so styles are computed once.
  for (const el of doc.body.querySelectorAll('*')) {
    const s = view.getComputedStyle(el);
    if (s.display === 'none') continue;
    applyCounterOps(counters, s.counterReset, 'reset');
    applyCounterOps(counters, s.counterSet, 'set');
    applyCounterOps(counters, s.counterIncrement, 'increment');

    for (const where of ['before', 'after'] as const) {
      const ps = view.getComputedStyle(el, `::${where}`);
      const content = ps.content;
      if (!content || content === 'none' || content === 'normal') continue;
      if (ps.display === 'none') continue;
      applyCounterOps(counters, ps.counterReset, 'reset');
      applyCounterOps(counters, ps.counterSet, 'set');
      applyCounterOps(counters, ps.counterIncrement, 'increment');
      const text = resolveContent(content, el, counters);
      if (text === null) continue;
      jobs.push({ el, where, text: mapSymbolFont(text, ps.fontFamily), style: ps, inside: true });
    }

    if (s.display === 'list-item' && s.listStyleType !== 'none') {
      const list = el.parentElement;
      let n: number;
      if (el.tagName === 'LI' && list?.tagName === 'OL') {
        const siblings = [...list.children].filter(c => c.tagName === 'LI');
        const start = Number(list.getAttribute('start') || 1);
        const idx = siblings.indexOf(el);
        n = el.hasAttribute('value') ? Number(el.getAttribute('value'))
          : list.hasAttribute('reversed') ? siblings.length - idx : start + idx;
      } else {
        n = (list ? (listCounts.get(list) ?? 0) : 0) + 1;
        if (list) listCounts.set(list, n);
      }
      const type = s.listStyleType;
      const isBullet = ['disc', 'circle', 'square'].includes(type) || type.startsWith('"');
      const marker = type.startsWith('"') ? type.slice(1, -1) : formatCounter(n, type) + (isBullet ? '' : '.');
      jobs.push({ el, where: 'marker', text: marker, style: null, inside: s.listStylePosition === 'inside' });
    }
  }

  // Write phase.
  const hide = doc.createElement('style');
  hide.textContent = '[data-pdf-before]::before, [data-pdf-after]::after { content: none !important; }';
  doc.head.appendChild(hide);
  for (const { el, where, text, style, inside } of jobs) {
    const span = doc.createElement('span');
    span.textContent = text;
    if (style) {
      for (let i = 0; i < style.length; i++) {
        const prop = style[i];
        if (!SKIP_COPY.has(prop)) span.style.setProperty(prop, style.getPropertyValue(prop));
      }
      if (/symbol|wingdings|webdings/i.test(style.fontFamily)) span.style.fontFamily = 'Arial, sans-serif';
      el.setAttribute(`data-pdf-${where}`, '');
      if (where === 'before') el.insertBefore(span, el.firstChild); else el.appendChild(span);
    } else {
      (el as HTMLElement).style.listStyleType = 'none';
      if (inside) {
        span.style.cssText = 'margin-right:0.5em;';
      } else {
        span.style.cssText = 'position:absolute;right:100%;margin-right:0.5em;white-space:nowrap;text-indent:0;font-style:normal;text-decoration:none;';
        if (view.getComputedStyle(el).position === 'static') (el as HTMLElement).style.position = 'relative';
      }
      el.insertBefore(span, el.firstChild);
    }
  }
}

// ── Collect ───────────────────────────────────────────────────────────────────
interface Collected {
  items: Item[];
  /** Spans that must not be split across pages: text lines, images, table rows. */
  atoms: { top: number; bottom: number }[];
  breaksBefore: number[];
  /** Tables whose <thead> repeats on continuation pages. */
  tableHeads: { top: number; bottom: number; headTop: number; headBottom: number }[];
  docWidth: number;
  docHeight: number;
}

function collect(doc: Document): Collected {
  const view = doc.defaultView!;
  const items: Item[] = [];
  const atoms: { top: number; bottom: number }[] = [];
  const breaksBefore: number[] = [];
  const sy = view.scrollY, sx = view.scrollX;
  const styleCache = new Map<Element, CSSStyleDeclaration>();
  const style = (el: Element) => {
    let s = styleCache.get(el);
    if (!s) { s = view.getComputedStyle(el); styleCache.set(el, s); }
    return s;
  };
  const visible = (el: Element) => {
    const c = (el as HTMLElement).checkVisibility;
    if (c) return c.call(el, { opacityProperty: true, visibilityProperty: true } as CheckVisibilityOptions);
    const s = style(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  const box = (r: DOMRect): Box => ({ x: r.left + sx, top: r.top + sy, w: r.width, h: r.height });

  // Elements: backgrounds, borders, images, links, page-break hints
  const root = doc.body;
  for (const el of root.querySelectorAll('*')) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    if (!visible(el)) continue;
    const s = style(el);
    const tag = el.tagName.toLowerCase();

    if (s.breakBefore === 'page' || s.pageBreakBefore === 'always' || s.breakBefore === 'always') {
      breaksBefore.push(el.getBoundingClientRect().top + sy);
    }
    if (s.breakAfter === 'page' || s.pageBreakAfter === 'always' || s.breakAfter === 'always') {
      breaksBefore.push(el.getBoundingClientRect().bottom + sy);
    }

    if (tag === 'img' || tag === 'svg' || tag === 'canvas') {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      let broken: string | undefined;
      let key: string;
      if (tag === 'img') {
        const img = el as HTMLImageElement;
        key = img.currentSrc || img.src;
        if (!img.complete || img.naturalWidth === 0) {
          const fmt = key.match(/^data:image\/(?:x-)?([a-z0-9.+-]+)/i)?.[1]?.toUpperCase();
          broken = fmt && fmt !== 'PNG' && fmt !== 'JPEG' ? `${fmt} format` : 'could not be loaded';
        }
      } else {
        key = `${tag}:${items.length}`;
      }
      items.push({ kind: 'image', ...box(r), key, source: el as HTMLImageElement, broken });
      atoms.push({ top: r.top + sy, bottom: r.bottom + sy });
      continue;
    }

    if (tag === 'tr') {
      const r = el.getBoundingClientRect();
      atoms.push({ top: r.top + sy, bottom: r.bottom + sy });
    }
    if (s.breakInside === 'avoid' || s.pageBreakInside === 'avoid') {
      const r = el.getBoundingClientRect();
      atoms.push({ top: r.top + sy, bottom: r.bottom + sy });
    }

    if (tag === 'a') {
      const href = (el as HTMLAnchorElement).getAttribute('href') || '';
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        for (const r of el.getClientRects()) items.push({ kind: 'link', ...box(r), url: href });
      }
    }

    const fill = parseColor(s.backgroundColor);
    const borders: RectItem['borders'] = {};
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const w = parseFloat(s.getPropertyValue(`border-${side}-width`));
      const st = s.getPropertyValue(`border-${side}-style`);
      const col = parseColor(s.getPropertyValue(`border-${side}-color`));
      if (w > 0 && col && st !== 'none' && st !== 'hidden') borders[side] = [w, col];
    }
    const hasBorder = Object.keys(borders).length > 0;
    if (!fill && !hasBorder) continue;
    if (fill && !hasBorder && fill.r > 0.995 && fill.g > 0.995 && fill.b > 0.995) continue; // white on white
    const rects = s.display === 'inline' ? [...el.getClientRects()] : [el.getBoundingClientRect()];
    for (const r of rects) {
      if (r.width < 0.5 || r.height < 0.5) continue;
      items.push({ kind: 'rect', ...box(r), fill, borders });
    }
  }

  // Text: one item per word, merged into runs where the spacing is natural.
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement;
    if (!parent || !node.data.trim()) continue;
    if (parent.closest('svg, script, style, noscript, template, title')) continue;
    if (!visible(parent)) continue;
    const s = style(parent);
    const color = parseColor(s.color);
    if (!color) continue;
    const sizePx = parseFloat(s.fontSize);
    if (!(sizePx > 0)) continue;
    const weight = parseInt(s.fontWeight, 10) || (s.fontWeight === 'bold' ? 700 : 400);
    const italic = s.fontStyle === 'italic' || s.fontStyle.startsWith('oblique');
    const cssFont = `${italic ? 'italic ' : ''}${weight} ${sizePx}px ${s.fontFamily}`;
    const metrics = fontMetrics(cssFont);
    const deco = s.textDecorationLine || s.textDecoration;
    const base = {
      family: classifyFamily(s.fontFamily), bold: weight >= 600, italic, sizePx, color, cssFont,
      underline: /underline/.test(deco), strike: /line-through/.test(deco),
    };

    let run: TextItem | null = null;
    const flush = () => { if (run) { items.push(run); atoms.push({ top: run.top, bottom: run.top + run.h }); run = null; } };
    const data = node.data;
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(data))) {
      const word = applyTextTransform(normalizeText(m[0]), s.textTransform, m.index === 0 || /\s/.test(data[m.index - 1]));
      if (!word) continue;
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rects = [...range.getClientRects()].filter(r => r.width > 0);
      if (rects.length === 0) continue;
      // A word broken across lines (overflow-wrap) yields several rects: place each piece.
      const pieces: { r: DOMRect; text: string }[] = [];
      if (rects.length === 1) pieces.push({ r: rects[0], text: word });
      else {
        let cur: { r: DOMRect; text: string } | null = null;
        for (let i = 0; i < m[0].length; i++) {
          range.setStart(node, m.index + i); range.setEnd(node, m.index + i + 1);
          const cr = range.getClientRects()[0];
          if (!cr) continue;
          const ch = applyTextTransform(normalizeText(m[0][i]), s.textTransform, false);
          if (cur && Math.abs(cr.top - cur.r.top) < 1) {
            cur = { r: new DOMRect(cur.r.left, cur.r.top, cr.right - cur.r.left, Math.max(cur.r.height, cr.height)), text: cur.text + ch };
          } else { if (cur) pieces.push(cur); cur = { r: cr, text: ch }; }
        }
        if (cur) pieces.push(cur);
      }
      for (const { r, text } of pieces) {
        const contentH = metrics.ascent + metrics.descent;
        const baseline = r.top + sy + (contentH > 0 ? metrics.ascent * (r.height / contentH) : r.height * 0.8);
        const cur = run as TextItem | null;
        const gap = cur ? r.left + sx - (cur.x + cur.w) : 0;
        if (cur && Math.abs(baseline - cur.baseline) < 0.5 && gap >= 0 && gap <= metrics.space * 1.6 + 0.5) {
          cur.text += ' ' + text;
          cur.words.push({ text, x: r.left + sx, w: r.width });
          cur.w = r.right + sx - cur.x;
          cur.h = Math.max(cur.h, r.height);
        } else {
          flush();
          run = { kind: 'text', ...base, x: r.left + sx, top: r.top + sy, w: r.width, h: r.height, baseline, text, words: [{ text, x: r.left + sx, w: r.width }] };
        }
      }
    }
    flush();
  }
  range.detach();

  return {
    items, atoms, breaksBefore,
    tableHeads: [...root.querySelectorAll('table')].flatMap(t => {
      const head = (t as HTMLTableElement).tHead;
      if (!head || !visible(head)) return [];
      const tr = t.getBoundingClientRect(), hr = head.getBoundingClientRect();
      return hr.height > 0 ? [{ top: tr.top + sy, bottom: tr.bottom + sy, headTop: hr.top + sy, headBottom: hr.bottom + sy }] : [];
    }),
    docWidth: Math.max(doc.documentElement.scrollWidth, doc.body.scrollWidth),
    docHeight: Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight),
  };
}

// ── Pagination ────────────────────────────────────────────────────────────────
/**
 * Cut [from, to) into pages. The first page holds content up to `firstLimit`,
 * later pages `contentH` each. A cut never falls inside an atom that would fit
 * on a page; forced breaks are honoured.
 */
function paginate(atoms: { top: number; bottom: number }[], forced: number[], from: number, to: number, firstLimit: number, contentH: number,
  contentHAt: (start: number) => number = () => contentH): number[] {
  const starts = [from];
  let start = from;
  let limit = firstLimit;
  const forcedSorted = [...forced].sort((a, b) => a - b);
  for (let guard = 0; guard < 5000; guard++) {
    const f = forcedSorted.find(y => y > start + 2 && y < Math.min(limit, to) - 2);
    let cut: number;
    if (f !== undefined) cut = f;
    else {
      if (limit >= to) break;
      cut = limit;
      for (let moved = true; moved;) {
        moved = false;
        for (const a of atoms) {
          if (a.top < cut - 0.5 && a.bottom > cut + 0.5 && a.top > start + 0.5 && a.bottom - a.top <= contentH) {
            cut = a.top; moved = true;
          }
        }
      }
      // Never emit a nearly empty page just to keep one tall block together.
      if (cut - start < (limit - start) * 0.15) cut = limit;
    }
    starts.push(cut);
    start = cut;
    limit = cut + contentHAt(cut);
  }
  return starts;
}

// ── Drawing ───────────────────────────────────────────────────────────────────
interface PagePlan {
  size: [number, number];         // pt
  srcTop: number; srcBottom: number; // layout px window
  originX: number;                // layout px that maps to page x = 0
  dstTop: number;                 // px offset from page top where srcTop lands
  scale: number;                  // layout px → page px
  clipTop: number; clipBottom: number; // px band on the page that content may occupy
  /** Items drawn on this page regardless of the window (repeated headers/footers), pre-shifted. */
  extra?: Item[];
}

/** Clone an item moved vertically by dy layout px. */
function shifted(it: Item, dy: number): Item {
  const c = { ...it, top: it.top + dy };
  if (c.kind === 'text') c.baseline = (it as TextItem).baseline + dy;
  return c;
}

export async function htmlToPdf(html: string, opts: HtmlToPdfOptions = {}): Promise<HtmlToPdfResult> {
  const pageSize = opts.pageSize ?? A4;
  const margin = opts.margin ?? 50;
  const onProgress = opts.onProgress ?? (() => {});
  const warnings = new Map<string, number>();
  const warn = (w: string) => warnings.set(w, (warnings.get(w) ?? 0) + 1);

  const flowWidthPx = (pageSize[0] - 2 * margin) / PX;
  const flowContentHPx = (pageSize[1] - 2 * margin) / PX;
  // Keep images inside one page so they never need splitting.
  const css = `img, svg, canvas { max-height: ${Math.floor(flowContentHPx)}px; object-fit: contain; }\n${opts.css ?? ''}`;

  onProgress(0.02);
  const sectionCss = opts.css ?? '';
  const iframe = await mountFrame(html, opts.pageSelector ? sectionCss : css, opts.pageSelector ? Math.ceil(pageSize[0] / PX) : Math.floor(flowWidthPx));
  try {
    const doc = iframe.contentDocument!;
    if (opts.pageSelector) {
      // Pre-laid-out pages: widen the frame to the widest page so nothing wraps differently.
      const widest = Math.max(...[...doc.querySelectorAll(opts.pageSelector)].map(e => (e as HTMLElement).scrollWidth), 0);
      if (widest > 0) iframe.style.width = `${Math.ceil(widest) + 2}px`;
    }
    materializeGeneratedContent(doc);
    iframe.style.height = `${Math.max(doc.documentElement.scrollHeight, 100) + 10}px`;
    await nextFrame();
    onProgress(0.1);
    const col = collect(doc);
    onProgress(0.35);

    // ── Plan pages ──
    const plans: PagePlan[] = [];
    const pinned = new Set<Item>(); // header/footer items, placed per page instead of in the flow
    const sections = opts.pageSelector ? [...doc.querySelectorAll(opts.pageSelector)] as HTMLElement[] : [];
    if (sections.length) {
      const view = doc.defaultView!;
      for (const sec of sections) {
        const r = sec.getBoundingClientRect();
        const s = view.getComputedStyle(sec);
        const top = r.top + view.scrollY;
        const padT = parseFloat(s.paddingTop) || 0, padB = parseFloat(s.paddingBottom) || 0;
        const minH = parseFloat(s.minHeight);
        const pageHPx = minH > 0 ? minH + (s.boxSizing === 'border-box' ? 0 : padT + padB) : r.height;
        const size: [number, number] = [r.width * PX, pageHPx * PX];
        const contentH = pageHPx - padT - padB;
        const bottom = top + r.height;

        // Word headers/footers repeat on every page of the section; the footer
        // sits at the page bottom even when the last page is only half full.
        const within = (el: Element | null) => {
          if (!el) return [];
          const er = el.getBoundingClientRect();
          const t = er.top + view.scrollY, b = er.bottom + view.scrollY;
          return col.items.filter(it => it.top >= t - 0.5 && it.top + it.h <= b + 0.5 && it.x >= r.left - 1 && it.x <= r.right);
        };
        const headerItems = within(sec.querySelector(':scope > header'));
        const footerItems = within(sec.querySelector(':scope > footer'));
        headerItems.forEach(it => pinned.add(it));
        footerItems.forEach(it => pinned.add(it));
        const footerEl = sec.querySelector(':scope > footer');
        // A clipped section (e.g. a slide) is exactly one page: nothing overflows onto more.
        const clipped = s.overflowY === 'hidden' || s.overflow === 'hidden';
        const flowEnd = clipped ? Math.min(bottom, top + pageHPx) : footerEl ? footerEl.getBoundingClientRect().top + view.scrollY : bottom;

        const forced = col.breaksBefore.filter(y => y > top && y < flowEnd);
        const starts = paginate(col.atoms, forced, top, flowEnd, top + pageHPx - padB, contentH);
        starts.forEach((st, i) => {
          const end = i + 1 < starts.length ? starts[i + 1] : flowEnd;
          const plan: PagePlan = i === 0
            ? { size, srcTop: st, srcBottom: end, originX: r.left, dstTop: 0, scale: 1, clipTop: 0, clipBottom: pageHPx }
            : { size, srcTop: st, srcBottom: end, originX: r.left, dstTop: padT, scale: 1, clipTop: padT, clipBottom: pageHPx - padB };
          // Shift pinned items so this plan's mapping lands them at their page position.
          const toPage = (pagePx: number, it: Item) => pagePx - plan.dstTop + plan.srcTop - it.top;
          plan.extra = [
            ...headerItems.map(it => shifted(it, toPage(it.top - top, it))),
            ...footerItems.map(it => shifted(it, toPage(pageHPx - (bottom - it.top), it))),
          ];
          // An overflow page holding nothing but empty paragraphs is not a page.
          const hasContent = col.items.some(it => (it.kind === 'text' || it.kind === 'image') && !pinned.has(it)
            && it.top >= plan.srcTop - 0.5 && it.top < plan.srcBottom - 0.5);
          if (i === 0 || hasContent) plans.push(plan);
        });
      }
    } else {
      const scale = opts.fitWidth === false ? 1 : Math.min(1, flowWidthPx / Math.max(col.docWidth, 1));
      if (scale < 0.999) warn(`Wide content was scaled to ${Math.round(scale * 100)}% to fit the page width`);
      const contentH = flowContentHPx / scale;
      // A page that starts inside a table body repeats that table's header row(s).
      const headAt = (start: number) => col.tableHeads.find(t => start > t.headBottom - 0.5 && start < t.bottom - 0.5
        && t.headBottom - t.headTop < contentH * 0.3);
      const starts = paginate(col.atoms, col.breaksBefore, 0, col.docHeight, contentH, contentH,
        st => contentH - (headAt(st) ? headAt(st)!.headBottom - headAt(st)!.headTop : 0));
      const marginPx = margin / PX;
      starts.forEach((st, i) => {
        const end = i + 1 < starts.length ? starts[i + 1] : col.docHeight;
        const head = i > 0 ? headAt(st) : undefined;
        const headH = head ? (head.headBottom - head.headTop) * scale : 0;
        const plan: PagePlan = { size: pageSize, srcTop: st, srcBottom: end, originX: -marginPx / scale, dstTop: marginPx + headH, scale, clipTop: 0, clipBottom: pageSize[1] / PX };
        if (head) {
          plan.extra = col.items
            .filter(it => it.kind !== 'link' && it.top >= head.headTop - 0.5 && it.top + it.h <= head.headBottom + 0.5)
            .map(it => shifted(it, st + (marginPx + (it.top - head.headTop) * scale - plan.dstTop) / scale - it.top));
        }
        plans.push(plan);
      });
    }
    // Drop trailing pages with nothing on them (e.g. a final forced break). Pre-laid-out
    // pages (slides, Word pages) are intentional even when blank, so only in flow mode.
    while (!sections.length && plans.length > 1) {
      const last = plans[plans.length - 1];
      if (col.items.some(it => it.kind !== 'link' && !pinned.has(it) && it.top + it.h > last.srcTop + 0.5 && it.top < last.srcBottom)) break;
      plans.pop();
    }

    // ── Draw ──
    const pdf = await PDFDocument.create();
    if (opts.title) pdf.setTitle(opts.title);
    pdf.setCreator('O-Zenith');
    pdf.setProducer('O-Zenith (pdf-lib)');

    const fontCache = new Map<string, PDFFont>();
    const charsets = new Map<Family, Set<number>>();
    const getFont = async (fam: Family, bold: boolean, italic: boolean) => {
      const name = FONT_NAMES[fam][(bold ? 1 : 0) + (italic ? 2 : 0)];
      let f = fontCache.get(name);
      if (!f) {
        f = await pdf.embedFont(name);
        fontCache.set(name, f);
        if (!charsets.has(fam)) charsets.set(fam, new Set(f.getCharacterSet()));
      }
      return f;
    };
    const imageCache = new Map<string, PDFImage | null>();

    const textByPage = (plan: PagePlan) => [...(plan.extra ?? []), ...col.items.filter(it => {
      if (pinned.has(it)) return false;
      if (it.kind === 'rect') return it.top < plan.srcBottom && it.top + it.h > plan.srcTop;
      return it.top >= plan.srcTop - 0.5 && it.top < plan.srcBottom - 0.5;
    })];

    for (let p = 0; p < plans.length; p++) {
      const plan = plans[p];
      const page = pdf.addPage(plan.size);
      const H = plan.size[1];
      const k = plan.scale * PX;
      const X = (x: number) => (x - plan.originX) * k;
      // Page-px y (from top) for a layout y, then PDF y (from bottom).
      const pyTop = (y: number) => plan.dstTop + (y - plan.srcTop) * plan.scale;
      const Y = (y: number) => H - pyTop(y) * PX;
      const clipT = plan.clipTop, clipB = plan.clipBottom;

      const pageItems = textByPage(plan);
      // Paint order: fills, borders, images, text, links.
      for (const it of pageItems) {
        if (it.kind !== 'rect' || !it.fill) continue;
        const t = Math.max(pyTop(it.top), clipT), b = Math.min(pyTop(it.top + it.h), clipB);
        if (b - t < 0.3) continue;
        page.drawRectangle({ x: X(it.x), y: H - b * PX, width: it.w * k, height: (b - t) * PX, color: rgb(it.fill.r, it.fill.g, it.fill.b), opacity: it.fill.a });
      }
      for (const it of pageItems) {
        if (it.kind !== 'rect') continue;
        const tPx = pyTop(it.top), bPx = pyTop(it.top + it.h);
        const t = Math.max(tPx, clipT), b = Math.min(bPx, clipB);
        const x0 = X(it.x), x1 = X(it.x + it.w);
        const line = (sx: number, sy: number, ex: number, ey: number, [w, c]: [number, RGBA]) =>
          page.drawLine({ start: { x: sx, y: sy }, end: { x: ex, y: ey }, thickness: Math.max(w * k, 0.25), color: rgb(c.r, c.g, c.b), opacity: c.a });
        const { top, right, bottom, left } = it.borders;
        if (top && tPx >= clipT - 0.5 && it.top >= plan.srcTop - 0.5) line(x0, H - tPx * PX, x1, H - tPx * PX, top);
        if (bottom && bPx <= clipB + 0.5 && it.top + it.h <= plan.srcBottom + 0.5) line(x0, H - bPx * PX, x1, H - bPx * PX, bottom);
        if (b > t) {
          if (left) line(x0, H - t * PX, x0, H - b * PX, left);
          if (right) line(x1, H - t * PX, x1, H - b * PX, right);
        }
      }
      for (const it of pageItems) {
        if (it.kind !== 'image') continue;
        const x = X(it.x), y = Y(it.top + it.h), w = it.w * k, h = it.h * k;
        if (it.broken) {
          warn(`An image was not included (${it.broken})`);
          page.drawRectangle({ x, y, width: w, height: h, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.75 });
          const f = await getFont('sans', false, true);
          const label = `Image not shown (${it.broken})`;
          const size = Math.min(9, Math.max(5, (w - 8) / Math.max(f.widthOfTextAtSize(label, 1), 1)));
          if (h > size + 4) page.drawText(label, { x: x + 4, y: y + h / 2 - size / 2, size, font: f, color: rgb(0.45, 0.45, 0.45) });
          continue;
        }
        let img = imageCache.get(it.key);
        if (img === undefined) {
          img = await embedImage(pdf, it.source);
          imageCache.set(it.key, img);
        }
        if (!img) { warn('An image could not be embedded'); continue; }
        // object-fit: contain — keep the aspect ratio inside the measured box.
        const ratio = img.width / img.height;
        let dw = w, dh = h;
        if (dw / dh > ratio) dw = dh * ratio; else dh = dw / ratio;
        page.drawImage(img, { x: x + (w - dw) / 2, y: y + (h - dh) / 2, width: dw, height: dh });
      }
      for (const it of pageItems) {
        if (it.kind !== 'text') continue;
        // Standard font → embedded DejaVu Sans → rendered image (see utils/pdfText).
        const font = await fontFor(pdf, it.text, { family: it.family, bold: it.bold, italic: it.italic });
        const size = it.sizePx * k;
        const x = X(it.x), baseline = Y(it.baseline), width = it.w * k;
        const color = rgb(it.color.r, it.color.g, it.color.b);
        const drawFitted = (f: PDFFont, text: string, dx: number, w: number) => {
          const natural = f.widthOfTextAtSize(text, size);
          const squeeze = natural > 0 ? (w / natural) * 100 : 100;
          const fit = Math.abs(squeeze - 100) > 1 && squeeze > 40 && squeeze < 250;
          if (fit) page.pushOperators(pushGraphicsState(), setCharacterSqueeze(squeeze));
          page.drawText(text, { x: dx, y: baseline, size, font: f, color, opacity: it.color.a });
          if (fit) page.pushOperators(popGraphicsState());
        };
        if (font) drawFitted(font, it.text, x, width);
        else {
          // Mixed line: keep every word we can as text; only words no font can
          // encode (CJK, emoji, shaped scripts) become images.
          for (const word of it.words) {
            const wf = await fontFor(pdf, word.text, { family: it.family, bold: it.bold, italic: it.italic });
            if (wf) { drawFitted(wf, word.text, X(word.x), word.w * k); continue; }
            const png = await rasterizeText(pdf, { ...it, text: word.text, x: word.x, w: word.w }, k);
            if (png) page.drawImage(png, { x: X(word.x), y: Y(it.top + it.h), width: word.w * k, height: it.h * k });
            warn('Some characters were drawn as images (not selectable)');
          }
        }
        const deco = (yOff: number) => page.drawLine({
          start: { x, y: baseline + yOff }, end: { x: x + width, y: baseline + yOff },
          thickness: Math.max(size * 0.06, 0.4), color, opacity: it.color.a,
        });
        if (it.underline) deco(-size * 0.12);
        if (it.strike) deco(size * 0.3);
      }
      for (const it of pageItems) {
        if (it.kind !== 'link') continue;
        addLink(pdf, page, [X(it.x), Y(it.top + it.h), X(it.x + it.w), Y(it.top)], it.url);
      }
      onProgress(0.35 + 0.6 * ((p + 1) / plans.length));
      if (p % 3 === 2) await nextFrame();
    }

    const bytes = await pdf.save();
    onProgress(1);
    return {
      bytes,
      pageCount: plans.length,
      warnings: [...warnings].map(([w, n]) => (n > 1 && !/^Wide|^Some/.test(w) ? `${w} ×${n}` : w)),
    };
  } finally {
    iframe.remove();
  }
}

// ── Images ────────────────────────────────────────────────────────────────────
function dataUrlBytes(url: string): Uint8Array | null {
  const m = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!m) return null;
  if (m[2]) {
    const bin = atob(m[3]);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new TextEncoder().encode(decodeURIComponent(m[3]));
}

async function embedImage(pdf: PDFDocument, source: HTMLImageElement | HTMLCanvasElement | SVGSVGElement): Promise<PDFImage | null> {
  try {
    if (source instanceof HTMLImageElement || source.tagName === 'IMG') {
      const img = source as HTMLImageElement;
      const src = img.currentSrc || img.src;
      // PNG / JPEG straight through: original quality, no re-encoding.
      if (/^data:image\/png/i.test(src)) { const b = dataUrlBytes(src); if (b) return await pdf.embedPng(b); }
      if (/^data:image\/jpe?g/i.test(src)) { const b = dataUrlBytes(src); if (b) return await pdf.embedJpg(b); }
      if (/^blob:/i.test(src)) {
        const blob = await (await fetch(src)).blob();
        const b = new Uint8Array(await blob.arrayBuffer());
        if (blob.type === 'image/png') return await pdf.embedPng(b);
        if (blob.type === 'image/jpeg') return await pdf.embedJpg(b);
      }
      return await rasterize(pdf, img, img.naturalWidth, img.naturalHeight, !/jpe?g/i.test(src));
    }
    if (source.tagName === 'CANVAS') {
      const c = source as HTMLCanvasElement;
      return await pdf.embedPng(dataUrlBytes(c.toDataURL('image/png'))!);
    }
    // Inline <svg>: serialize and rasterize at 2× its displayed size.
    const svg = source as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(r.width));
    clone.setAttribute('height', String(r.height));
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    await img.decode();
    return await rasterize(pdf, img, r.width * 2, r.height * 2, true);
  } catch {
    return null;
  }
}

async function rasterize(pdf: PDFDocument, img: CanvasImageSource, w: number, h: number, alpha: boolean): Promise<PDFImage> {
  const MAX = 3000;
  const s = Math.min(1, MAX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const g = c.getContext('2d')!;
  if (!alpha) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
  g.drawImage(img, 0, 0, c.width, c.height);
  return alpha
    ? pdf.embedPng(dataUrlBytes(c.toDataURL('image/png'))!)
    : pdf.embedJpg(dataUrlBytes(c.toDataURL('image/jpeg', 0.92))!);
}

async function rasterizeText(pdf: PDFDocument, it: TextItem, k: number): Promise<PDFImage | null> {
  const scale = Math.max(3, 3 / k);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(it.w * scale));
  c.height = Math.max(1, Math.ceil(it.h * scale));
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  g.font = it.cssFont;
  g.fillStyle = `rgba(${it.color.r * 255},${it.color.g * 255},${it.color.b * 255},${it.color.a})`;
  g.textBaseline = 'alphabetic';
  g.fillText(it.text, 0, it.baseline - it.top, it.w + 2);
  try { return await pdf.embedPng(dataUrlBytes(c.toDataURL('image/png'))!); } catch { return null; }
}

function addLink(pdf: PDFDocument, page: PDFPage, [x1, y1, x2, y2]: number[], url: string) {
  const annot = pdf.context.obj({
    Type: 'Annot', Subtype: 'Link',
    Rect: [x1, y1, x2, y2],
    Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
  });
  const ref = pdf.context.register(annot);
  const annots = page.node.lookup(PDFName.of('Annots'));
  if (annots && 'push' in annots) (annots as unknown as { push: (r: unknown) => void }).push(ref);
  else page.node.set(PDFName.of('Annots'), pdf.context.obj([ref]));
}

/** Escape text for safe interpolation into HTML built from file contents (CSV cells, etc.). */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
