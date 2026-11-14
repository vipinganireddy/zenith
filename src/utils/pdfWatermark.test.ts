// Self-check for Remove Watermark / Add Watermark tagging.
//   node --test src/utils/pdfWatermark.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream } from 'pdf-lib';

const { asWatermark, removeWatermarks } = await import('./pdfWatermark.ts');

/** Saved-and-reloaded page content, decoded, so we test what a viewer would see. */
async function contentOf(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  let out = '';
  for (const ref of doc.getPage(0).node.normalizedEntries().Contents!.asArray()) {
    const s = doc.context.lookup(ref);
    out += Buffer.from(s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : new Uint8Array()).toString('latin1');
  }
  return out;
}
const hex = (s: string) => Buffer.from(s, 'latin1').toString('hex').toUpperCase();

test('our own tagged watermark is removed; body text stays', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage();
  page.drawText('Invoice 42', { x: 50, y: 700, font, size: 12 });
  asWatermark(doc, page, () => page.drawText('CONFIDENTIAL', { x: 100, y: 300, font, size: 60 }));
  page.drawText('Thank you', { x: 50, y: 100, font, size: 12 });
  const tagged = await doc.save();
  assert.match(await contentOf(tagged), /\/Artifact\s*<<[^>]*\/Subtype \/Watermark/);

  const reloaded = await PDFDocument.load(tagged);
  const r = removeWatermarks(reloaded);
  assert.equal(r.blocks, 1);
  const after = await contentOf(await reloaded.save());
  assert.ok(!after.includes(hex('CONFIDENTIAL')), 'watermark text gone');
  assert.ok(after.includes(hex('Invoice 42')) && after.includes(hex('Thank you')), 'body text kept');
  assert.equal((after.match(/\bq\b/g) ?? []).length, (after.match(/\bQ\b/g) ?? []).length, 'graphics state balanced');
});

test('Word-style named property, nested marked content and Acrobat XObject', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const ctx = doc.context;
  const xo = ctx.register(ctx.stream('0 0 m 10 10 l S', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 10, 10],
    PieceInfo: { ADBE_CompoundType: { Private: 'Watermark' } },
  }));
  page.node.set(PDFName.of('Resources'), ctx.obj({
    Properties: { MC0: { Type: 'Pagination', Subtype: 'Watermark' } },
    XObject: { Fm0: xo },
  }));
  const content = '/P <</MCID 0>> BDC (keep me) Tj EMC\n/Artifact /MC0 BDC /Span BMC (gone) Tj EMC (also gone) Tj EMC\nq /Fm0 Do Q\n(tail) Tj';
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.stream(content)));
  page.node.set(PDFName.of('Annots'), ctx.obj([ctx.obj({ Type: 'Annot', Subtype: 'Watermark', Rect: [0, 0, 1, 1] }), ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 1, 1] })]));

  const r = removeWatermarks(doc);
  assert.deepEqual({ ...r }, { annotations: 1, blocks: 1, xobjects: 1, pagesChanged: 1 });
  const after = await contentOf(await doc.save());
  assert.ok(!after.includes('gone') && !after.includes('/Fm0 Do'));
  assert.ok(after.includes('(keep me) Tj') && after.includes('(tail) Tj') && /q\s+Q/.test(after));
});

test('an untagged PDF is left untouched', async () => {
  const doc = await PDFDocument.create();
  doc.addPage().drawText('DRAFT', { x: 10, y: 10 });
  assert.deepEqual({ ...removeWatermarks(doc) }, { annotations: 0, blocks: 0, xobjects: 0, pagesChanged: 0 });
});
