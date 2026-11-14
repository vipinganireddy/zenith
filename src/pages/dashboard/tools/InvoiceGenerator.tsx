import { useState, type CSSProperties } from 'react';
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import { FileText, Plus, Trash2, ArrowRight, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { pickFonts, wrapText } from '../../../utils/pdfText';
import { useIsMobile } from '../../../hooks/useIsMobile';

const CURRENCIES = [
  { code: 'INR', locale: 'en-IN', label: '₹ INR' },
  { code: 'USD', locale: 'en-US', label: '$ USD' },
  { code: 'EUR', locale: 'de-DE', label: '€ EUR' },
  { code: 'GBP', locale: 'en-GB', label: '£ GBP' },
  { code: 'AED', locale: 'en-AE', label: 'AED' },
  { code: 'SGD', locale: 'en-SG', label: 'S$ SGD' },
];


const fieldStyle: CSSProperties = { width: '100%', minHeight: '48px', padding: '0 16px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: '16px', lineHeight: '24px', boxSizing: 'border-box' };
const areaStyle: CSSProperties = { ...fieldStyle, padding: '12px 16px', resize: 'vertical' };
const labelStyle: CSSProperties = { display: 'block', margin: '0 0 8px', fontSize: '12px', lineHeight: '16px', fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink-faint)' };
const colStyle: CSSProperties = { flex: '1 1 140px', minWidth: 0 };

interface LineItem { description: string; qty: number; price: number; }

const InvoiceGenerator = () => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('INV-001');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const isMobile = useIsMobile(768);
  const [items, setItems] = useState<LineItem[]>([{ description: '', qty: 1, price: 0 }]);
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState('');
  const [currency, setCurrency] = useState('INR');
  const cur = CURRENCIES.find(c => c.code === currency) ?? CURRENCIES[0];
  const money = (n: number) => new Intl.NumberFormat(cur.locale, { style: 'currency', currency: cur.code }).format(Number.isFinite(n) ? n : 0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  const addItem = () => setItems(p => [...p, { description: '', qty: 1, price: 0 }]);
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, key: keyof LineItem, val: string | number) => setItems(p => p.map((item, idx) => idx === i ? { ...item, [key]: val } : item));

  const generatePdf = async () => {
    setError('');
    setIsProcessing(true);
    try {
      const doc = await PDFDocument.create();
      doc.setTitle(`Invoice ${invoiceNo}`);
      const W = 595, H = 842, L = 50, R = W - 50, BOTTOM = 60;
      const rows = items.filter(i => i.description.trim() || i.price);
      const amounts = [subtotal, tax, total, ...rows.flatMap(i => [i.price, i.qty * i.price])].map(money);
      const { regular: font, bold, safe } = await pickFonts(doc, [from, to, invoiceNo, notes, date, dueDate, ...rows.map(r => r.description), ...amounts]);
      // Sanitise per line so wrapping can still see the user's line breaks.
      const clean = (t: string) => t.split('\n').map(safe).join('\n');
      const ink = rgb(0.1, 0.1, 0.1), muted = rgb(0.45, 0.45, 0.45), navy = rgb(0.12, 0.23, 0.37);

      let page: PDFPage = doc.addPage([W, H]);
      let y = H - 60;
      const text = (t: string, x: number, yy: number, size = 10, f = font, color = ink) =>
        page.drawText(safe(t), { x, y: yy, size, font: f, color });
      const right = (t: string, xr: number, yy: number, size = 10, f = font, color = ink) =>
        text(t, xr - f.widthOfTextAtSize(safe(t), size), yy, size, f, color);
      const rule = (yy: number) => page.drawLine({ start: { x: L, y: yy }, end: { x: R, y: yy }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });

      // Header band
      page.drawRectangle({ x: 0, y: y - 10, width: W, height: 80, color: navy });
      text('INVOICE', L, y + 20, 28, bold, rgb(1, 1, 1));
      right(`#${invoiceNo}`, R, y + 20, 14, bold, rgb(0.6, 0.8, 1));
      y -= 70;

      // From / To, each wrapped in its column
      text('FROM', L, y, 8, bold, muted);
      text('BILL TO', L + 250, y, 8, bold, muted);
      y -= 16;
      const fromLines = wrapText(clean(from), font, 10, 230);
      const toLines = wrapText(clean(to), font, 10, R - L - 250);
      fromLines.forEach((ln, i) => text(ln, L, y - i * 14));
      toLines.forEach((ln, i) => text(ln, L + 250, y - i * 14));
      y -= Math.max(fromLines.length, toLines.length, 1) * 14 + 6;
      text(`Date: ${date}`, L, y, 9, font, muted);
      if (dueDate) text(`Due: ${dueDate}`, L + 160, y, 9, font, muted);
      y -= 30;

      // Line items — columns: description | qty | unit price | amount
      // Right edges: qty 300, unit price 410, amount 539 — room for ₹99,99,99,999.00.
      const C_QTY = L + 230, C_PRICE = L + 320, DESC_W = C_QTY - L - 20;
      const tableHeader = () => {
        page.drawRectangle({ x: L, y: y - 4, width: R - L, height: 20, color: rgb(0.93, 0.95, 0.98) });
        text('Description', L + 6, y + 3, 9, bold);
        right('Qty', C_QTY + 20, y + 3, 9, bold);
        right('Unit price', C_PRICE + 40, y + 3, 9, bold);
        right('Amount', R - 6, y + 3, 9, bold);
        y -= 22;
      };
      const newPage = () => { page = doc.addPage([W, H]); y = H - 60; };
      tableHeader();
      for (const item of rows.length ? rows : [{ description: '—', qty: 0, price: 0 }]) {
        const desc = wrapText(clean(item.description || '—'), font, 9, DESC_W);
        const h = desc.length * 12 + 8;
        if (y - h < BOTTOM) { newPage(); tableHeader(); }
        desc.forEach((ln, i) => text(ln, L + 6, y - i * 12, 9));
        right(String(item.qty), C_QTY + 20, y, 9);
        right(money(item.price), C_PRICE + 40, y, 9);
        right(money(item.qty * item.price), R - 6, y, 9);
        y -= h;
        rule(y + 6);
      }

      // Totals block stays together
      const totalsH = (taxRate ? 16 : 0) + 60;
      if (y - totalsH < BOTTOM) newPage();
      y -= 10;
      text('Subtotal', R - 190, y, 9); right(money(subtotal), R - 6, y, 9);
      if (taxRate) { y -= 16; text(`Tax (${taxRate}%)`, R - 190, y, 9); right(money(tax), R - 6, y, 9); }
      y -= 24;
      page.drawRectangle({ x: R - 195, y: y - 6, width: 195, height: 24, color: navy });
      text('TOTAL', R - 190, y + 2, 10, bold, rgb(1, 1, 1));
      right(money(total), R - 6, y + 2, 11, bold, rgb(1, 1, 1));

      if (notes.trim()) {
        y -= 40;
        const noteLines = wrapText(clean(notes), font, 9, R - L);
        if (y - noteLines.length * 13 - 20 < BOTTOM) newPage();
        rule(y + 10); y -= 10;
        text('Notes', L, y, 9, bold); y -= 14;
        for (const ln of noteLines) { if (y < BOTTOM) newPage(); text(ln, L, y, 9, font, muted); y -= 13; }
      }

      // Footer on every page
      const pages = doc.getPages();
      pages.forEach((pg, i) => {
        const label = pages.length > 1 ? `Page ${i + 1} of ${pages.length}` : 'Generated with O-Zenith';
        pg.drawText(label, { x: W / 2 - font.widthOfTextAtSize(label, 8) / 2, y: 24, size: 8, font, color: rgb(0.7, 0.7, 0.7) });
      });

      const bytes = await doc.save();
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
    } catch (err) { console.error(err); setError('Failed to generate invoice.'); }
    finally { setIsProcessing(false); }
  };

  const inp = (val: string, onChange: (v: string) => void, placeholder = '', multiline = false) =>
    multiline
      ? <textarea value={val} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={areaStyle} />
      : <input value={val} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={fieldStyle} />;

  return (
    <ToolWorkspaceLayout title="Invoice Generator" description="Create professional PDF invoices in seconds — free, browser-only, no signup.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, minWidth: 0, padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px', borderRight: '1px solid var(--hairline)', background: 'var(--card-bg)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={colStyle}>
              <label style={labelStyle}>From (your info)</label>
              {inp(from, setFrom, 'Company Name\nAddress\nEmail', true)}
            </div>
            <div style={colStyle}>
              <label style={labelStyle}>Bill To</label>
              {inp(to, setTo, 'Client Name\nAddress\nEmail', true)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={colStyle}><label style={labelStyle}>Invoice #</label>{inp(invoiceNo, setInvoiceNo, 'INV-001')}</div>
            <div style={colStyle}><label style={labelStyle}>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={fieldStyle} /></div>
            <div style={colStyle}><label style={labelStyle}>Due Date</label><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={fieldStyle} /></div>
            <div style={colStyle}><label style={labelStyle}>Currency</label><select value={currency} onChange={e => setCurrency(e.target.value)} style={fieldStyle}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <label style={{ ...labelStyle, margin: 0 }}>Line Items</label>
              <button onClick={addItem} className="btn-secondary" style={{ height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px' }}><Plus size={14} /> Add Item</button>
            </div>
            {!isMobile && <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
              <span style={{ ...labelStyle, margin: 0, flex: 3 }}>Description</span>
              <span style={{ ...labelStyle, margin: 0, width: '60px' }}>Qty</span>
              <span style={{ ...labelStyle, margin: 0, width: '90px' }}>Price</span>
              <span style={{ ...labelStyle, margin: 0, width: '70px', textAlign: 'right' }}>Total</span>
              <span style={{ width: '44px' }} />
            </div>}
            {items.map((item, i) => isMobile ? (
              // Phones: one small card per line item instead of a 5-column row
              <div key={i} style={{ background: 'var(--surface-high)', borderRadius: '16px', padding: '12px', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder={`Item ${i + 1} description`} aria-label="Description" style={{ ...fieldStyle, background: 'var(--surface)' }} />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ ...labelStyle, margin: 0, display: 'flex', flexDirection: 'column', width: '84px' }}>Qty
                    <input type="number" inputMode="numeric" min={1} value={item.qty} onChange={e => updateItem(i, 'qty', Number(e.target.value))} style={{ ...fieldStyle, background: 'var(--surface)', marginTop: '4px' }} />
                  </label>
                  <label style={{ ...labelStyle, margin: 0, display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>Price
                    <input type="number" inputMode="decimal" min={0} step={0.01} value={item.price} onChange={e => updateItem(i, 'price', Number(e.target.value))} style={{ ...fieldStyle, background: 'var(--surface)', marginTop: '4px' }} />
                  </label>
                  <div style={{ ...labelStyle, margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 0 }}>Total
                    <span style={{ marginTop: '4px', fontSize: '14px', lineHeight: '20px', fontWeight: 700, letterSpacing: 0, textTransform: 'none', color: 'var(--ink)', padding: '14px 0' }}>{money(item.qty * item.price)}</span>
                  </div>
                  <button onClick={() => removeItem(i)} aria-label={`Remove item ${i + 1}`} style={{ alignSelf: 'flex-end', width: '44px', height: '48px', background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={17} /></button>
                </div>
              </div>
            ) : (
              <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="Item description" aria-label="Description" style={{ ...fieldStyle, flex: 3, width: 'auto', minWidth: 0, padding: '0 12px' }} />
                <input type="number" min={1} value={item.qty} onChange={e => updateItem(i, 'qty', Number(e.target.value))} aria-label="Quantity" style={{ ...fieldStyle, width: '60px', padding: '0 8px' }} />
                <input type="number" min={0} step={0.01} value={item.price} onChange={e => updateItem(i, 'price', Number(e.target.value))} aria-label="Price" style={{ ...fieldStyle, width: '90px', padding: '0 8px' }} />
                <span style={{ width: '70px', fontSize: '14px', lineHeight: '20px', fontWeight: 600, textAlign: 'right' }}>{money(item.qty * item.price)}</span>
                <button onClick={() => removeItem(i)} aria-label={`Remove item ${i + 1}`} style={{ width: '44px', height: '44px', background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px', flexDirection: isMobile ? 'column' : 'row' }}>
            <div style={{ width: isMobile ? '100%' : '140px', minWidth: 0 }}><label style={labelStyle}>Tax Rate (%)</label><input type="number" min={0} max={100} step={0.5} value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} style={fieldStyle} /></div>
            <div style={{ flex: 1, minWidth: 0 }}><label style={labelStyle}>Notes</label>{inp(notes, setNotes, 'Payment terms, thank-you note…', true)}</div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, padding: '28px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={18} color="var(--accent)" /> Summary</h3>
          {downloadUrl ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', boxShadow: 'var(--shadow-raised)', textAlign: 'center' }}>
                <CheckCircle size={48} color="var(--good)" style={{ margin: '0 auto 12px' }} />
                <h4 style={{ marginBottom: '8px' }}>Invoice Ready!</h4>
                <a href={downloadUrl} download={`invoice_${invoiceNo}.pdf`} className="btn-primary" style={{ display: 'flex', textDecoration: 'none' }}>Download PDF</a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`invoice_${invoiceNo}.pdf`} />
                <button onClick={() => setDownloadUrl(null)} className="btn-secondary" style={{ marginTop: '10px', width: '100%' }}>Edit & Regenerate</button>
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '14px', lineHeight: '20px' }}><span>Subtotal</span><span>{money(subtotal)}</span></div>
              {taxRate > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '14px', lineHeight: '20px', color: 'var(--text-secondary)' }}><span>Tax ({taxRate}%)</span><span>{money(tax)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontWeight: 700, fontSize: '16px', lineHeight: '24px', background: 'var(--surface-sunken)', borderRadius: '16px', padding: '12px 16px' }}><span>Total</span><span>{money(total)}</span></div>
              <button onClick={generatePdf} disabled={isProcessing} className="btn-primary" style={{ width: '100%' }}>
                {isProcessing ? 'Generating…' : 'Generate Invoice PDF'} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default InvoiceGenerator;
