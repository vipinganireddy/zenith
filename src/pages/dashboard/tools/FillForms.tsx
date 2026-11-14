import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument, PDFCheckBox, PDFDropdown, PDFRadioGroup } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { pickFonts } from '../../../utils/pdfText';

interface FieldInfo { name: string; type: string; value: string; options?: string[]; }

const FillForms = () => {
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [noFields, setNoFields] = useState(false);
  const [error, setError] = useState('');

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return;
    const f = accepted[0];
    setFile(f); setDownloadUrl(null); setNoFields(false); setValues({}); setError('');
    try {
      const ab = await f.arrayBuffer();
      const pdfDoc = await PDFDocument.load(ab, { ignoreEncryption: true });
      const form = pdfDoc.getForm();
      const detected: FieldInfo[] = [];
      for (const field of form.getFields()) {
        const name = field.getName();
        // instanceof, not constructor.name — class names are mangled in the minified build.
        let type = 'text';
        let options: string[] | undefined;
        if (field instanceof PDFCheckBox) type = 'checkbox';
        else if (field instanceof PDFDropdown) { type = 'select'; try { options = field.getOptions(); } catch { /* malformed options — fall back to free text */ } }
        else if (field instanceof PDFRadioGroup) { type = 'radio'; try { options = field.getOptions(); } catch { /* malformed options — fall back to free text */ } }
        detected.push({ name, type, value: '', options });
      }
      if (!detected.length) { setNoFields(true); return; }
      setFields(detected);
      const initVals: Record<string, string> = {};
      detected.forEach(f => { initVals[f.name] = ''; });
      setValues(initVals);
    } catch (err) { console.error(err); setError('Could not read PDF form fields.'); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

  const handleFill = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true);
    try {
      const ab = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(ab, { ignoreEncryption: true });
      const form = pdfDoc.getForm();
      const skipped: string[] = [];
      for (const field of fields) {
        const val = values[field.name] ?? '';
        try {
          if (field.type === 'text') {
            const tf = form.getTextField(field.name);
            tf.setText(val);
          } else if (field.type === 'checkbox') {
            const cb = form.getCheckBox(field.name);
            if (val === 'true') cb.check(); else cb.uncheck();
          } else if (field.type === 'select' && val) {
            const dd = form.getDropdown(field.name);
            dd.select(val);
          } else if (field.type === 'radio' && val) {
            const rg = form.getRadioGroup(field.name);
            rg.select(val);
          }
        } catch { skipped.push(field.name); /* e.g. longer than the field's max length — fill the rest */ }
      }
      // Field appearances are drawn with Helvetica by default, which can't encode
      // ₹, Ł, Cyrillic… Regenerate them with a font that covers what was typed.
      const { regular, safe } = await pickFonts(pdfDoc, Object.values(values));
      for (const field of fields) {
        if (field.type !== 'text') continue;
        try {
          const tf = form.getTextField(field.name);
          const v = tf.getText() ?? '';
          if (safe(v) !== v.replace(/[\r\n\t]+/g, ' ')) tf.setText(safe(v)); // only glyphs no font has
        } catch { /* leave as is */ }
      }
      form.updateFieldAppearances(regular);
      const bytes = await pdfDoc.save({ updateFieldAppearances: false });
      if (skipped.length) setError(`Saved, but these fields rejected their value (too long or not an allowed option): ${skipped.join(', ')}`);
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })));
    } catch (err) { console.error(err); setError('Failed to fill form.'); }
    finally { setIsProcessing(false); }
  };

  return (
    <ToolWorkspaceLayout title="Fill PDF Forms" description="Detect and fill interactive form fields in your PDF — text fields, checkboxes, dropdowns.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', background: 'var(--card-bg)', overflowY: 'auto', minWidth: 0 }}>
          <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '16px', padding: '32px', textAlign: 'center', background: 'var(--surface-sunken)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <input {...getInputProps()} />
            {!file ? (
              <>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}><UploadCloud size={28} /></div>
                <h3 style={{ fontSize: '20px', marginBottom: '6px' }}>Upload PDF Form</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>PDF must have interactive form fields</p>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', minWidth: 0, maxWidth: '100%' }}>
                <FileText size={32} color="var(--accent)" />
                <div style={{ textAlign: 'left', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px', overflowWrap: 'anywhere' }}>{file.name}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '16px' }}>{fields.length} field{fields.length !== 1 ? 's' : ''} detected</div>
                </div>
                <button onClick={e => { e.stopPropagation(); setFile(null); setFields([]); setDownloadUrl(null); setNoFields(false); }} style={{ marginLeft: 'auto', fontSize: '14px', color: 'var(--ink)', background: 'var(--surface-high)', border: 'none', padding: '0 16px', borderRadius: '16px', cursor: 'pointer', minHeight: '44px' }}>Change</button>
              </div>
            )}
          </div>

          {noFields && (
            <div style={{ padding: '16px', background: 'var(--warn-bg)', borderRadius: '16px', fontSize: '14px', lineHeight: '20px', color: 'var(--text-main)' }}>
              This PDF has no interactive form fields. Use the <strong>Edit PDF</strong> tool to add text annotations manually.
            </div>
          )}

          {fields.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {fields.map(field => (
                <div key={field.name}>
                  <label className="field-label" style={{ overflowWrap: 'anywhere' }}>{field.name}</label>
                  {field.type === 'text' && (
                    <input value={values[field.name] ?? ''} onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}
                      style={{ width: '100%', padding: '0 14px', borderRadius: '16px', border: 'none', fontSize: '16px', boxSizing: 'border-box', background: 'var(--surface-sunken)', minHeight: '48px' }} />
                  )}
                  {field.type === 'checkbox' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '14px', lineHeight: '20px', minHeight: '44px' }}>
                      <input type="checkbox" checked={values[field.name] === 'true'} onChange={e => setValues(v => ({ ...v, [field.name]: e.target.checked ? 'true' : 'false' }))} />
                      Check / uncheck
                    </label>
                  )}
                  {(field.type === 'select' || field.type === 'radio') && field.options && (
                    <select value={values[field.name] ?? ''} onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}
                      style={{ width: '100%', padding: '0 12px', borderRadius: '16px', border: 'none', fontSize: '16px', boxSizing: 'border-box', background: 'var(--surface-sunken)', color: 'var(--ink)', minHeight: '48px' }}>
                      <option value="">— select —</option>
                      {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600 }}>Fill & Download</h3>
          {downloadUrl ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: 'var(--shadow-raised)' }}>
                <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 12px' }} />
                <h4 style={{ marginBottom: '8px' }}>Form Filled!</h4>
                <a href={downloadUrl} download={`filled_${file?.name}`} style={{ display: 'flex', background: 'var(--accent)', color: 'var(--on-accent)', padding: '0 24px', borderRadius: '24px', fontWeight: 700, textDecoration: 'none', alignItems: 'center', justifyContent: 'center', minHeight: '56px', fontSize: '16px', boxSizing: 'border-box', width: '100%' }}>Download</a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`filled_${file?.name}`} />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '16px' }}>Fill in the form fields, then use the button below to embed the values and download the completed PDF.</p>
              <button onClick={handleFill} disabled={!file || !fields.length || isProcessing}
                style={{ width: '100%', padding: '0 24px', borderRadius: '24px', fontWeight: 700, border: 'none', background: fields.length ? 'var(--accent)' : 'var(--surface-high)', color: fields.length ? 'var(--on-accent)' : 'var(--ink-faint)', cursor: !fields.length ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '56px', fontSize: '16px' }}>
                {isProcessing ? 'Saving…' : 'Save Filled PDF'} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default FillForms;
