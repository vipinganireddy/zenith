/* Drawing user-entered text into PDFs without crashing on non-Latin characters.

   pdf-lib's built-in fonts (Helvetica, Times, Courier) only encode WinAnsi —
   Western European text. Anything else (₹, Cyrillic, Greek, Vietnamese…) makes
   drawText throw. prepareText() picks, per string:

     1. the standard font, when it can encode the text (smallest output);
     2. embedded DejaVu Sans (subset to the glyphs used) for Latin, Greek,
        Cyrillic, ₹ and common symbols — still real, selectable text;
     3. a crisp rendered image for scripts that need OpenType shaping or
        right-to-left layout (Devanagari, Arabic, Thai…), CJK and emoji, which
        pdf-lib cannot lay out correctly. The browser shapes them properly. */
import { PDFDocument, StandardFonts, degrees, type PDFFont, type PDFPage, type Color } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import unicodeRegularUrl from '../assets/fonts/DejaVuSans.ttf?url';
import unicodeBoldUrl from '../assets/fonts/DejaVuSans-Bold.ttf?url';

export type FontFamily = 'sans' | 'serif' | 'mono';

const STANDARD: Record<FontFamily, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};
const CSS_FAMILY: Record<FontFamily, string> = {
  sans: 'Helvetica, Arial, "DejaVu Sans", sans-serif',
  serif: '"Times New Roman", Times, serif',
  mono: '"Courier New", Courier, monospace',
};

/** Scripts that need shaping or bidi: Hebrew → Myanmar blocks, Khmer, Arabic presentation forms. */
const COMPLEX_RANGES: [number, number][] = [[0x0590, 0x109f], [0x1780, 0x17ff], [0xfb1d, 0xfdff], [0xfe70, 0xfeff]];
const needsShaping = (s: string) => [...s].some(ch => {
  const cp = ch.codePointAt(0)!;
  return COMPLEX_RANGES.some(([a, b]) => cp >= a && cp <= b);
});

const fileCache = new Map<string, Promise<ArrayBuffer>>();
const loadFile = (url: string) => {
  let p = fileCache.get(url);
  if (!p) { p = fetch(url).then(r => r.arrayBuffer()); fileCache.set(url, p); }
  return p;
};

interface DocFonts { fonts: Map<string, Promise<PDFFont>>; sets: Map<string, Set<number>>; fontkit: boolean }
const perDoc = new WeakMap<PDFDocument, DocFonts>();
function docFonts(pdf: PDFDocument): DocFonts {
  let d = perDoc.get(pdf);
  if (!d) { d = { fonts: new Map(), sets: new Map(), fontkit: false }; perDoc.set(pdf, d); }
  return d;
}

async function getFont(pdf: PDFDocument, key: string, load: () => Promise<PDFFont>): Promise<{ font: PDFFont; set: Set<number> }> {
  const d = docFonts(pdf);
  let f = d.fonts.get(key);
  if (!f) { f = load(); d.fonts.set(key, f); }
  const font = await f;
  let set = d.sets.get(key);
  if (!set) { set = new Set(font.getCharacterSet()); d.sets.set(key, set); }
  return { font, set };
}

const covers = (set: Set<number>, text: string) => [...text].every(ch => set.has(ch.codePointAt(0)!) || ch === '\n');

/** A font from the chain above that can encode `text`, or null when it must be rendered as an image. */
export async function fontFor(pdf: PDFDocument, text: string, opts: { family?: FontFamily; bold?: boolean; italic?: boolean } = {}): Promise<PDFFont | null> {
  const family = opts.family ?? 'sans';
  const idx = (opts.bold ? 1 : 0) + (opts.italic ? 2 : 0);
  const std = await getFont(pdf, `std:${family}:${idx}`, () => pdf.embedFont(STANDARD[family][idx]));
  if (covers(std.set, text)) return std.font;
  if (needsShaping(text)) return null;
  const uni = await unicodeFont(pdf, !!opts.bold);
  return covers(uni.set, text) ? uni.font : null;
}

// DejaVu rather than Noto Sans: @pdf-lib/fontkit's subsetter drops glyph
// outlines from the (variable-derived) Noto static builds; DejaVu subsets
// cleanly, so an invoice with ₹ stays ~10 KB instead of ~600 KB.
async function unicodeFont(pdf: PDFDocument, bold: boolean) {
  const d = docFonts(pdf);
  if (!d.fontkit) { pdf.registerFontkit(fontkit); d.fontkit = true; }
  return getFont(pdf, `uni:${bold ? 1 : 0}`, async () => pdf.embedFont(await loadFile(bold ? unicodeBoldUrl : unicodeRegularUrl), { subset: true }));
}

/**
 * Drop-in fonts for tools that lay text out themselves (invoices, résumés…).
 * Looks at all the user's text up front: built-in Helvetica when it can encode
 * everything, otherwise DejaVu Sans. `safe()` turns newlines/tabs into spaces and
 * replaces any character the chosen font still lacks, so drawText never throws.
 */
export async function pickFonts(pdf: PDFDocument, texts: string[]) {
  const all = texts.join(' ').replace(/[\r\n\t]+/g, ' ');
  const std = await getFont(pdf, 'std:sans:0', () => pdf.embedFont(StandardFonts.Helvetica));
  const useStd = covers(std.set, all);
  const regular = useStd ? std : await unicodeFont(pdf, false);
  const bold = useStd ? await getFont(pdf, 'std:sans:1', () => pdf.embedFont(StandardFonts.HelveticaBold)) : await unicodeFont(pdf, true);
  const safe = (s: string) => [...String(s ?? '').replace(/[\r\n\t]+/g, ' ')]
    .map(ch => (regular.set.has(ch.codePointAt(0)!) ? ch : '?')).join('');
  return { regular: regular.font, bold: bold.font, safe };
}

export interface PreparedText {
  /** Advance width in points at the prepared size. */
  width: number;
  /** Draw with the baseline at (x, y). */
  draw(page: PDFPage, at: { x: number; y: number; color?: Color; opacity?: number; rotate?: number }): void;
}

/**
 * Measure and draw a single line of user text safely. Usage:
 *   const t = await prepareText(pdf, 'Total ₹1,250', { size: 12 });
 *   t.draw(page, { x: pageWidth - 40 - t.width, y: 30 });
 */
export async function prepareText(pdf: PDFDocument, text: string,
  opts: { size: number; family?: FontFamily; bold?: boolean; italic?: boolean; color?: Color }): Promise<PreparedText> {
  const line = text.replace(/[\r\n\t]+/g, ' ');
  const font = await fontFor(pdf, line, opts);
  if (font) {
    return {
      width: font.widthOfTextAtSize(line, opts.size),
      draw: (page, at) => page.drawText(line, {
        x: at.x, y: at.y, size: opts.size, font, color: at.color ?? opts.color, opacity: at.opacity,
        rotate: at.rotate ? degrees(at.rotate) : undefined,
      }),
    };
  }
  // Rendered fallback: the browser shapes the script; we embed it as a transparent PNG.
  const scale = 4;
  const cssFont = `${opts.italic ? 'italic ' : ''}${opts.bold ? 'bold ' : ''}${opts.size}px ${CSS_FAMILY[opts.family ?? 'sans']}`;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = cssFont;
  const m = measure.measureText(line);
  const ascent = Math.max(m.actualBoundingBoxAscent, opts.size * 0.8);
  const descent = Math.max(m.actualBoundingBoxDescent, opts.size * 0.2);
  const width = Math.max(m.width, 1);
  const render = async (color?: Color) => {
    const c = document.createElement('canvas');
    c.width = Math.ceil(width * scale) + 4;
    c.height = Math.ceil((ascent + descent) * scale) + 4;
    const g = c.getContext('2d')!;
    g.scale(scale, scale);
    g.font = cssFont;
    const rgbColor = color && 'red' in color ? color : undefined;
    g.fillStyle = rgbColor ? `rgb(${rgbColor.red * 255},${rgbColor.green * 255},${rgbColor.blue * 255})` : '#000';
    g.fillText(line, 0, ascent);
    const blob = await new Promise<Blob>(res => c.toBlob(b => res(b!), 'image/png'));
    return pdf.embedPng(await blob.arrayBuffer());
  };
  const img = await render(opts.color);
  return {
    width,
    draw: (page, at) => {
      const r = (at.rotate ?? 0) * Math.PI / 180;
      // Keep the baseline at (x, y): offset the image's bottom-left corner by -descent, rotated.
      page.drawImage(img, {
        x: at.x + descent * Math.sin(r), y: at.y - descent * Math.cos(r),
        width, height: ascent + descent, opacity: at.opacity,
        rotate: at.rotate ? degrees(at.rotate) : undefined,
      });
    },
  };
}

/**
 * The page as the reader sees it: CropBox size with /Rotate applied. Use
 * `toPage` to turn a visual position (from the visible bottom-left corner) into
 * PDF coordinates, and draw with `rotate` so text reads upright on screen.
 */
export function visualFrame(page: PDFPage) {
  const box = page.getCropBox();
  const R = ((page.getRotation().angle % 360) + 360) % 360;
  const W = box.width, H = box.height;
  const toPage = (vx: number, vy: number) => {
    switch (R) {
      case 90: return { x: box.x + W - vy, y: box.y + vx };
      case 180: return { x: box.x + W - vx, y: box.y + H - vy };
      case 270: return { x: box.x + vy, y: box.y + H - vx };
      default: return { x: box.x + vx, y: box.y + vy };
    }
  };
  return { width: R % 180 ? H : W, height: R % 180 ? W : H, rotate: R, toPage };
}

/** Draw prepared text with its baseline at a visual position (see visualFrame). */
export function drawVisual(page: PDFPage, t: PreparedText, vx: number, vy: number, at: { color?: Color; opacity?: number } = {}) {
  const f = visualFrame(page);
  const p = f.toPage(vx, vy);
  t.draw(page, { ...at, x: p.x, y: p.y, rotate: f.rotate || undefined });
}

/** Greedy word wrap to a width; very long words are broken by character. */
export function wrapText(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxW) { line = test; continue; }
      if (line) out.push(line);
      let chunk = '';
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxW && chunk) { out.push(chunk); chunk = ''; }
        chunk += ch;
      }
      line = chunk;
    }
    out.push(line);
  }
  return out;
}
