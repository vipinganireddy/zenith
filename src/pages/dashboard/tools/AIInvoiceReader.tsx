import { useState, useCallback, type CSSProperties } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UploadCloud, FileText, X, Key, Download, Copy, CheckCheck } from 'lucide-react';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import { callAI, hasAnyKey, extractPdfText } from '../../../utils/aiService';

const ACTION_BTN: CSSProperties = { height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px' };

interface LineItem {
  description: string;
  qty: string;
  unit_price: string;
  total: string;
}

interface InvoiceData {
  vendor_name: string;
  vendor_address: string;
  client_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  line_items: LineItem[];
  subtotal: string;
  tax: string;
  discount: string;
  grand_total: string;
  payment_terms: string;
  notes: string;
}

type Phase = 'upload' | 'reading' | 'done';

const Field = ({ label, value }: { label: string; value: string }) => (
  value ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.2px' }}>{label}</span>
      <span style={{ fontSize: '14px', color: 'var(--text-main)', fontWeight: 500 }}>{value}</span>
    </div>
  ) : null
);

const AIInvoiceReader = () => {
  const navigate = useNavigate();
  const [file, setFile]         = useState<File | null>(null);
  const [phase, setPhase]       = useState<Phase>('upload');
  const [invoice, setInvoice]   = useState<InvoiceData | null>(null);
  const [error, setError]       = useState('');
  const [copied, setCopied]     = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) { setFile(accepted[0]); setError(''); }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false,
  });

  const read = async () => {
    if (!file || !hasAnyKey()) return;
    setPhase('reading');
    setError('');
    try {
      const text = await extractPdfText(file);
      const raw = await callAI([{
        role: 'user',
        content: `Extract all invoice data from the document below. Return ONLY a JSON object — no markdown fences, no extra text.
If a field is not present in the document, use an empty string "".
Schema:
{
  "vendor_name": "",
  "vendor_address": "",
  "client_name": "",
  "invoice_number": "",
  "invoice_date": "",
  "due_date": "",
  "line_items": [
    {"description":"","qty":"","unit_price":"","total":""}
  ],
  "subtotal": "",
  "tax": "",
  "discount": "",
  "grand_total": "",
  "payment_terms": "",
  "notes": ""
}

DOCUMENT:
${text.slice(0, 12000)}`,
      }], {
        systemPrompt: 'You are an expert document data extraction specialist. Extract invoice data accurately. Output only valid JSON.',
        maxTokens: 2000,
      });

      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Unexpected AI response. Try again.');
      const parsed: InvoiceData = JSON.parse(match[0]);
      setInvoice(parsed);
      setPhase('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('upload');
    }
  };

  const copyAsText = () => {
    if (!invoice) return;
    const lines = [
      `INVOICE DATA EXTRACTION`,
      `========================`,
      `Vendor: ${invoice.vendor_name}`,
      invoice.vendor_address && `Address: ${invoice.vendor_address}`,
      invoice.client_name && `Client: ${invoice.client_name}`,
      `Invoice #: ${invoice.invoice_number}`,
      `Date: ${invoice.invoice_date}`,
      invoice.due_date && `Due: ${invoice.due_date}`,
      ``,
      `LINE ITEMS`,
      `----------`,
      ...(invoice.line_items || []).map(
        item => `${item.description}  |  Qty: ${item.qty}  |  Unit: ${item.unit_price}  |  Total: ${item.total}`
      ),
      ``,
      invoice.subtotal && `Subtotal: ${invoice.subtotal}`,
      invoice.tax && `Tax: ${invoice.tax}`,
      invoice.discount && `Discount: ${invoice.discount}`,
      `Grand Total: ${invoice.grand_total}`,
      invoice.payment_terms && `Payment Terms: ${invoice.payment_terms}`,
      invoice.notes && `Notes: ${invoice.notes}`,
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCsv = () => {
    if (!invoice) return;
    const rows = [
      ['Description', 'Quantity', 'Unit Price', 'Total'],
      ...(invoice.line_items || []).map(i => [i.description, i.qty, i.unit_price, i.total]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'invoice-line-items.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFile(null); setInvoice(null); setError(''); setPhase('upload');
  };

  return (
    <ToolWorkspaceLayout title="AI Invoice Reader" description="Upload an invoice PDF and extract all structured data automatically.">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '28px', gap: '20px', overflow: 'auto', minWidth: 0 }}>

        {/* ── Upload ── */}
        {phase === 'upload' && (
          <div style={{ width: '100%', maxWidth: '520px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>
            <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '40px', textAlign: 'center', background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)', cursor: 'pointer', transition: 'all 0.2s' }}>
              <input {...getInputProps()} />
              {file ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <FileText size={28} color="var(--accent)" />
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden' }}>
                    <p style={{ fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setFile(null); }} aria-label="Remove file" style={{ width: '44px', height: '44px', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
                </div>
              ) : (
                <>
                  <UploadCloud size={36} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                  <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Drop an invoice PDF here</p>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>or click to browse</p>
                </>
              )}
            </div>

            {error && <div style={{ padding: '12px 16px', background: 'var(--danger-bg)', borderRadius: '16px', color: 'var(--danger)', fontSize: '14px', lineHeight: '20px' }}>{error}</div>}

            {!hasAnyKey() ? (
              <div style={{ padding: '16px', background: 'var(--warn-bg)', borderRadius: '16px' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-main)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}><Key size={14} color="var(--accent)" /> No API key — AI features disabled.</p>
                <button onClick={() => navigate('/dashboard/profile?tab=api-keys')} className="btn-primary" style={{ width: '100%' }}>Add API Key →</button>
              </div>
            ) : (
              <button onClick={read} disabled={!file}
                className="btn-primary" style={{ width: '100%' }}>
                📄 Extract Invoice Data
              </button>
            )}
          </div>
        )}

        {/* ── Reading ── */}
        {phase === 'reading' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
                style={{ width: '60px', height: '60px', borderRadius: '50%', border: '4px solid var(--surface-high)', borderTopColor: 'var(--accent)' }} />
              <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>Reading invoice…</p>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Extracting vendor info, line items, and totals</p>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {phase === 'done' && invoice && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Action bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <p style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '16px' }}>Extracted Invoice Data</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{file?.name}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={copyAsText}
                  className="btn-secondary" style={ACTION_BTN}>
                  {copied ? <><CheckCheck size={14} color="var(--accent)" /> Copied</> : <><Copy size={14} /> Copy</>}
                </button>
                {(invoice.line_items?.length ?? 0) > 0 && (
                  <button onClick={downloadCsv}
                    className="btn-primary" style={ACTION_BTN}>
                    <Download size={14} /> Export CSV
                  </button>
                )}
                <button onClick={reset}
                  className="btn-secondary" style={ACTION_BTN}>
                  New
                </button>
              </div>
            </div>

            {/* Header fields */}
            <div style={{ background: 'var(--surface-sunken)', borderRadius: '24px', padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
              <Field label="Vendor" value={invoice.vendor_name} />
              <Field label="Client" value={invoice.client_name} />
              <Field label="Invoice #" value={invoice.invoice_number} />
              <Field label="Invoice Date" value={invoice.invoice_date} />
              <Field label="Due Date" value={invoice.due_date} />
              <Field label="Payment Terms" value={invoice.payment_terms} />
              {invoice.vendor_address && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Vendor Address" value={invoice.vendor_address} />
                </div>
              )}
            </div>

            {/* Line items table */}
            {invoice.line_items && invoice.line_items.length > 0 && (
              <div style={{ background: 'var(--surface-sunken)', borderRadius: '24px', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Line Items ({invoice.line_items.length})</h3>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-high)' }}>
                        {['Description', 'Qty', 'Unit Price', 'Total'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1.2px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.line_items.map((item, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--hairline)' }}>
                          <td style={{ padding: '11px 16px', color: 'var(--text-main)', lineHeight: 1.4 }}>{item.description}</td>
                          <td style={{ padding: '11px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{item.qty}</td>
                          <td style={{ padding: '11px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{item.unit_price}</td>
                          <td style={{ padding: '11px 16px', color: 'var(--text-main)', fontWeight: 600, whiteSpace: 'nowrap' }}>{item.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Totals */}
            <div style={{ background: 'var(--surface-sunken)', borderRadius: '24px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '340px', alignSelf: 'flex-end', width: '100%' }}>
              {invoice.subtotal && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-secondary)' }}>
                  <span>Subtotal</span><span>{invoice.subtotal}</span>
                </div>
              )}
              {invoice.discount && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--success)' }}>
                  <span>Discount</span><span>-{invoice.discount}</span>
                </div>
              )}
              {invoice.tax && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-secondary)' }}>
                  <span>Tax</span><span>{invoice.tax}</span>
                </div>
              )}
              {invoice.grand_total && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', paddingTop: '12px', borderTop: '1px solid var(--hairline)' }}>
                  <span>Grand Total</span><span style={{ color: 'var(--accent)' }}>{invoice.grand_total}</span>
                </div>
              )}
            </div>

            {invoice.notes && (
              <div style={{ background: 'var(--warn-bg)', borderRadius: '16px', padding: '16px' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '4px' }}>Notes</p>
                <p style={{ fontSize: '14px', color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>{invoice.notes}</p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </ToolWorkspaceLayout>
  );
};

export default AIInvoiceReader;
