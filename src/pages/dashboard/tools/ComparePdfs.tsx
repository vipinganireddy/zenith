import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, ArrowRight } from 'lucide-react';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import * as pdfjsLib from 'pdfjs-dist';
import '../../../utils/pdfWorker';
import { pageTextLines } from '../../../utils/pdfToDocx';
import { diffWords, changeCount, type DiffOp } from '../../../utils/textDiff';

type PDFDoc = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;
interface Rendered { canvas: HTMLCanvasElement; text: string; url: string }

const SCALE = 1.4;

async function renderPage(pdf: PDFDoc, pageNum: number): Promise<Rendered> {
  const page = await pdf.getPage(pageNum);
  const vp = page.getViewport({ scale: SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ intent: 'print', canvasContext: ctx, viewport: vp }).promise;
  return { canvas, text: (await pageTextLines(page)).join('\n'), url: canvas.toDataURL('image/png') };
}

/** Faded page A with every pixel that differs in B painted red. */
function visualDiff(a: HTMLCanvasElement, b: HTMLCanvasElement): { url: string; changed: number } {
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
  const pa = document.createElement('canvas'), pb = document.createElement('canvas');
  for (const [c, src] of [[pa, a], [pb, b]] as const) { c.width = w; c.height = h; const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(src, 0, 0); }
  const da = pa.getContext('2d')!.getImageData(0, 0, w, h), db = pb.getContext('2d')!.getImageData(0, 0, w, h);
  const out = new ImageData(w, h);
  let changed = 0;
  for (let i = 0; i < da.data.length; i += 4) {
    const delta = Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2]);
    if (delta > 60) { out.data[i] = 220; out.data[i + 1] = 38; out.data[i + 2] = 38; out.data[i + 3] = 255; changed++; }
    else { const g = 255 - (255 - (da.data[i] + da.data[i + 1] + da.data[i + 2]) / 3) * 0.25; out.data[i] = out.data[i + 1] = out.data[i + 2] = g; out.data[i + 3] = 255; }
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d')!.putImageData(out, 0, 0);
  return { url: c.toDataURL('image/png'), changed: changed / (w * h) };
}

const DropZone = ({ label, file, onFile }: { label: string; file: File | null; onFile: (f: File) => void }) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted: File[]) => { if (accepted[0]) onFile(accepted[0]); },
    accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false,
  });
  return (
    <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '24px', textAlign: 'center', background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)', cursor: 'pointer', flex: '1 1 150px', minWidth: 0 }}>
      <input {...getInputProps()} />
      <UploadCloud size={28} color="var(--accent)" style={{ margin: '0 auto 8px' }} />
      <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>{label}</p>
      {file ? <p style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--accent)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</p> : <p style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--text-secondary)' }}>Click or drop PDF</p>}
    </div>
  );
};

type View = 'side' | 'visual' | 'text';

const ComparePdfs = () => {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [numA, setNumA] = useState(1);
  const [numB, setNumB] = useState(1);
  const [result, setResult] = useState<{ a: Rendered; b: Rendered; diffUrl: string; pixelChange: number; ops: DiffOp[] } | null>(null);
  const [view, setView] = useState<View>('text');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const compare = async () => {
    if (!fileA || !fileB) return;
    setError('');
    setIsLoading(true);
    try {
      const [docA, docB] = await Promise.all([fileA, fileB].map(async f => pdfjsLib.getDocument({ isEvalSupported: false, data: new Uint8Array(await f.arrayBuffer()) }).promise));
      if (numA > docA.numPages || numB > docB.numPages) {
        setError(`Document A has ${docA.numPages} page(s) and Document B has ${docB.numPages}.`);
        return;
      }
      const [a, b] = await Promise.all([renderPage(docA, numA), renderPage(docB, numB)]);
      const { url, changed } = visualDiff(a.canvas, b.canvas);
      const ops = diffWords(a.text, b.text);
      setResult({ a, b, diffUrl: url, pixelChange: changed, ops });
      setView(a.text.trim() || b.text.trim() ? 'text' : 'visual');
    } catch (err) { console.error(err); setError('Could not open one of the PDFs. It may be damaged or password-protected.'); }
    finally { setIsLoading(false); }
  };

  const changes = result ? changeCount(result.ops) : 0;
  const tab = (id: View, label: string) => (
    <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}>{label}</button>
  );
  const pageImg = (src: string, label: string) => (
    <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
      <p style={{ fontSize: '12px', lineHeight: '16px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--accent)' }}>{label}</p>
      <img src={src} alt={label} style={{ width: '100%', borderRadius: '16px', boxShadow: 'var(--shadow-raised)', background: '#fff' }} />
    </div>
  );

  return (
    <ToolWorkspaceLayout title="Compare PDFs" description="Find what changed between two versions — text changes highlighted word by word, plus a visual difference overlay.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--hairline)', background: 'var(--card-bg)', display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <DropZone label="Original (A)" file={fileA} onFile={f => { setFileA(f); setResult(null); }} />
          <DropZone label="Revised (B)" file={fileB} onFile={f => { setFileB(f); setResult(null); }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1 1 160px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {([['Page A', numA, setNumA], ['Page B', numB, setNumB]] as const).map(([label, value, set]) => (
                <div key={label} style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ display: 'block', margin: '0 0 8px', fontSize: '12px', lineHeight: '16px', fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{label}</label>
                  <input type="number" min={1} value={value} onChange={e => set(Math.max(1, Number(e.target.value) || 1))} style={{ width: '100%', minHeight: '48px', padding: '0 16px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: '16px', boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
            <button onClick={compare} disabled={!fileA || !fileB || isLoading}
              className="btn-primary" style={{ width: '100%' }}>
              {isLoading ? 'Comparing…' : 'Compare'} <ArrowRight size={15} />
            </button>
          </div>
        </div>

        {result && (
          <div style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', borderBottom: '1px solid var(--hairline)', background: 'var(--card-bg)' }}>
            <div className="segmented" role="tablist" aria-label="Comparison view" style={{ flex: '1 1 320px', minWidth: 0 }}>
            {tab('text', `Text changes (${changes})`)}
            {tab('visual', 'Visual differences')}
            {tab('side', 'Side by side')}
            </div>
            <span style={{ marginLeft: 'auto', fontSize: '14px', lineHeight: '20px', color: 'var(--text-secondary)' }}>
              {changes === 0 && result.pixelChange < 0.0005 ? 'No differences found on these pages.' : `${(result.pixelChange * 100).toFixed(2)}% of the page area differs`}
            </span>
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', background: 'var(--surface-sunken)', overflow: 'auto' }}>
          {!result && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '14px', padding: '24px', textAlign: 'center' }}>Upload both versions and click Compare</div>
          )}
          {result && view === 'side' && (<>{pageImg(result.a.url, `A — page ${numA}`)}<div style={{ width: '1px', background: 'var(--hairline)', margin: '16px 0' }} />{pageImg(result.b.url, `B — page ${numB}`)}</>)}
          {result && view === 'visual' && pageImg(result.diffUrl, 'Red = pixels that differ between A and B')}
          {result && view === 'text' && (
            <div style={{ flex: 1, padding: '24px', minWidth: 0 }}>
              <div style={{ background: 'var(--surface)', color: 'var(--ink)', borderRadius: '24px', padding: '24px', lineHeight: 1.8, fontSize: '14px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', boxShadow: 'var(--shadow-raised)' }}>
                {result.ops.length === 0 ? 'Neither page has a text layer — see Visual differences.' : result.ops.map((op, i) => (
                  <span key={i} style={op.type === 'add' ? { background: 'var(--good-bg)', color: 'var(--ink)' } : op.type === 'del' ? { background: 'var(--danger-bg)', color: 'var(--ink)', textDecoration: 'line-through' } : undefined}>
                    {op.text}{' '}
                  </span>
                ))}
              </div>
              <p style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--text-secondary)', marginTop: '12px' }}>
                <span style={{ background: 'var(--good-bg)', color: 'var(--success)', padding: '0 4px', borderRadius: '4px' }}>added in B</span>{' '}
                <span style={{ background: 'var(--danger-bg)', color: 'var(--danger)', textDecoration: 'line-through', padding: '0 4px', borderRadius: '4px' }}>removed from A</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default ComparePdfs;
