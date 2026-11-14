/* DOCX → paginated HTML via docx-preview, which keeps what mammoth discards:
   page size and margins, alignment, fonts and colours, floating images, headers
   and footers, footnotes, and Word's own page breaks. Each Word page comes out
   as a `section.docx` element — feed the HTML to htmlToPdf() with
   `pageSelector: DOCX_PAGE_SELECTOR` to keep that pagination. */
import { parseAsync, renderDocument, type Options } from 'docx-preview';

export const DOCX_PAGE_SELECTOR = 'section.docx';

/** Word lets an image overhang the margins; on paper that's clipped content, so keep
 *  images (and the fixed-size boxes docx-preview wraps them in) inside the page. */
export const DOCX_PDF_CSS = `section.docx img, section.docx :has(> img):not(section) { max-width: 100% !important; height: auto !important; }`;

const OPTIONS: Partial<Options> = {
  className: 'docx',
  inWrapper: false,
  breakPages: true,
  // Break where Word last laid out a page, so page N in the PDF matches page N in Word.
  ignoreLastRenderedPageBreak: false,
  ignoreWidth: false,
  ignoreHeight: false,
  ignoreFonts: false,
  renderHeaders: true,
  renderFooters: true,
  renderFootnotes: true,
  renderEndnotes: true,
  renderComments: false,
  renderChanges: false,
  useBase64URL: true, // images inline as data: URLs, so the HTML is self-contained
  experimental: true,  // tab stops
};

// Minimal view of docx-preview's parsed model — only what fixSections touches.
interface SectProps { type?: string; headerRefs?: { type: string }[]; footerRefs?: { type: string }[]; titlePage?: boolean }
interface ParsedElement { type: string; sectionProps?: SectProps; children?: ParsedElement[]; break?: string }
interface ParsedBody { children: ParsedElement[]; props: SectProps }

/**
 * Correct two gaps in docx-preview's section handling (v0.4):
 * 1. Headers/footers are inherited from the previous section in Word ("Link to
 *    Previous", the default) — docx-preview drops them on later sections.
 * 2. A "Next Page" section break (Word's default) starts a new page — docx-preview
 *    only breaks on an orientation change, and one section too late.
 */
function fixSections(body: ParsedBody | undefined) {
  if (!body?.children) return;
  const sections: { para: ParsedElement | null; props: SectProps }[] = [];
  for (const el of body.children) if (el.sectionProps) sections.push({ para: el, props: el.sectionProps });
  sections.push({ para: null, props: body.props ?? {} });

  for (let i = 1; i < sections.length; i++) {
    const prev = sections[i - 1].props, cur = sections[i].props;
    for (const kind of ['headerRefs', 'footerRefs'] as const) {
      const own = cur[kind] ?? [];
      const inherited = (prev[kind] ?? []).filter(r => !own.some(o => o.type === r.type));
      if (inherited.length) cur[kind] = [...own, ...inherited];
    }
    if (cur.titlePage === undefined && prev.titlePage !== undefined) cur.titlePage = prev.titlePage;
  }

  for (let i = 0; i < sections.length - 1; i++) {
    const nextType = sections[i + 1].props.type ?? 'nextPage';
    const para = sections[i].para;
    if (para && nextType !== 'continuous' && nextType !== 'nextColumn') {
      (para.children ??= []).push({ type: 'run', children: [{ type: 'break', break: 'page' }] });
    }
  }
}

/**
 * Word places "in front of / behind text" and absolutely-positioned pictures in
 * a 0×0 anchor box (docx-preview mirrors that), which DOCX_PDF_CSS's
 * `max-width: 100%` then collapsed to nothing — those photos vanished from the
 * PDF. Give each anchor box its image's own size so the picture keeps its
 * dimensions and still sits at Word's offset.
 */
function sizeAnchorBoxes(nodes: Node[]) {
  for (const n of nodes) {
    if (n.nodeType !== Node.ELEMENT_NODE) continue;
    (n as Element).querySelectorAll<HTMLElement>('img').forEach(img => {
      const box = img.parentElement;
      if (!box || box.tagName === 'SECTION') return;
      const zero = (v: string) => /^0(px|pt)?$/.test(v.trim());
      if (zero(box.style.width) || zero(box.style.height)) {
        if (img.style.width) box.style.width = img.style.width;
        if (img.style.height) box.style.height = img.style.height;
      }
    });
  }
}

export async function docxToHtml(data: ArrayBuffer): Promise<string> {
  const doc = await parseAsync(new Blob([data]), OPTIONS);
  fixSections(doc?.documentPart?.body);
  const nodes = await renderDocument(doc, OPTIONS);
  sizeAnchorBoxes(nodes);
  return nodes.map(n => {
    if (n.nodeType === Node.ELEMENT_NODE) return (n as Element).outerHTML;
    if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? '';
    return ''; // comments
  }).join('');
}
