import { useState, type CSSProperties } from 'react';
import { PDFDocument, PDFString, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { User, Plus, Trash2, ArrowRight, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { pickFonts, wrapText } from '../../../utils/pdfText';
import { normaliseLink } from '../../../utils/links';

const fieldStyle: CSSProperties = { width: '100%', minHeight: '48px', padding: '0 16px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: '16px', lineHeight: '24px', boxSizing: 'border-box' };
const entryFieldStyle: CSSProperties = { ...fieldStyle, background: 'var(--surface)' };
const areaStyle: CSSProperties = { ...fieldStyle, padding: '12px 16px', resize: 'vertical' };
const labelStyle: CSSProperties = { display: 'block', margin: '0 0 8px', fontSize: '12px', lineHeight: '16px', fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink-faint)' };
const colStyle: CSSProperties = { flex: '1 1 140px', minWidth: 0 };
const addBtnStyle: CSSProperties = { height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px' };
const removeBtnStyle: CSSProperties = { width: '44px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' };

interface WorkExp {
  id: string;
  company: string;
  role: string;
  start: string;
  end: string;
  bullets: string;
}

interface Education {
  id: string;
  school: string;
  degree: string;
  year: string;
  gpa: string;
}

const uid = () => Math.random().toString(36).slice(2);

const ResumeBuilder = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [summary, setSummary] = useState('');
  const [skills, setSkills] = useState('');
  const [experience, setExperience] = useState<WorkExp[]>([{ id: uid(), company: '', role: '', start: '', end: 'Present', bullets: '' }]);
  const [education, setEducation] = useState<Education[]>([{ id: uid(), school: '', degree: '', year: '', gpa: '' }]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const addExp = () => setExperience(p => [...p, { id: uid(), company: '', role: '', start: '', end: 'Present', bullets: '' }]);
  const removeExp = (id: string) => setExperience(p => p.filter(e => e.id !== id));
  const updateExp = (id: string, key: keyof WorkExp, val: string) =>
    setExperience(p => p.map(e => e.id === id ? { ...e, [key]: val } : e));

  const addEdu = () => setEducation(p => [...p, { id: uid(), school: '', degree: '', year: '', gpa: '' }]);
  const removeEdu = (id: string) => setEducation(p => p.filter(e => e.id !== id));
  const updateEdu = (id: string, key: keyof Education, val: string) =>
    setEducation(p => p.map(e => e.id === id ? { ...e, [key]: val } : e));

  const generate = async () => {
    if (!name) return;
    setError('');
    setIsProcessing(true);
    try {
      const doc = await PDFDocument.create();
      doc.setTitle(`${name} — Résumé`);
      const W = 612, H = 792, L = 48, R = W - 48, TOP = H - 48, BOTTOM = 48;
      const { regular: font, bold, safe } = await pickFonts(doc, [
        name, email, phone, location, linkedin, summary, skills,
        ...experience.flatMap(e => [e.company, e.role, e.start, e.end, e.bullets]),
        ...education.flatMap(e => [e.school, e.degree, e.year, e.gpa]),
      ]);
      const clean = (t: string) => t.split('\n').map(safe).join('\n');
      const ink = rgb(0.1, 0.1, 0.1), grey = rgb(0.45, 0.45, 0.45);
      let page: PDFPage = doc.addPage([W, H]);
      let y = TOP;

      // New page when the next block doesn't fit; long résumés flow onto page 2+.
      const ensure = (h: number) => { if (y - h < BOTTOM) { page = doc.addPage([W, H]); y = TOP; } };
      const txt = (t: string, x: number, yy: number, size = 10, f: PDFFont = font, color: RGB = ink) =>
        page.drawText(safe(t), { x, y: yy, size, font: f, color });
      const rightTxt = (t: string, yy: number, size: number, f: PDFFont, color: RGB) =>
        txt(t, R - f.widthOfTextAtSize(safe(t), size), yy, size, f, color);
      const rule = (yy: number, thick = 0.5, color = rgb(0.8, 0.8, 0.8)) =>
        page.drawLine({ start: { x: L, y: yy }, end: { x: R, y: yy }, thickness: thick, color });
      const para = (t: string, x: number, size: number, lineH: number, f: PDFFont = font, color: RGB = ink, maxW = R - x) => {
        for (const ln of wrapText(clean(t), f, size, maxW)) { ensure(lineH); txt(ln, x, y, size, f, color); y -= lineH; }
      };
      const sectionHead = (label: string) => {
        ensure(48); // keep a heading with at least its first line
        y -= 14;
        txt(label.toUpperCase(), L, y, 9, bold, rgb(0.35, 0.35, 0.35));
        y -= 4;
        rule(y, 0.8, rgb(0.35, 0.35, 0.35));
        y -= 12;
      };

      // Header band; the contact line shrinks to fit the width.
      page.drawRectangle({ x: 0, y: y - 8, width: W, height: 68, color: rgb(0.13, 0.18, 0.35) });
      txt(name, L, y + 28, 22, bold, rgb(1, 1, 1));
      const contact = safe([email, phone, location, linkedin].filter(Boolean).join('  ·  '));
      const cSize = Math.max(6.5, Math.min(9, 9 * (R - L) / Math.max(font.widthOfTextAtSize(contact, 9), 1)));
      txt(contact, L, y + 8, cSize, font, rgb(0.75, 0.85, 1));
      // Email, phone and profile URL are clickable, as recruiters expect.
      {
        const sep = '  ·  ';
        let x = L;
        for (const [value, link] of [[email, email && `mailto:${email.trim()}`], [phone, phone && normaliseLink(phone)], [location, null], [linkedin, linkedin && normaliseLink(linkedin)]] as const) {
          if (!value) continue;
          const w = font.widthOfTextAtSize(safe(value), cSize);
          if (link) {
            page.node.addAnnot(doc.context.register(doc.context.obj({
              Type: 'Annot', Subtype: 'Link', Rect: [x, y + 6, x + w, y + 8 + cSize], Border: [0, 0, 0],
              A: { Type: 'Action', S: 'URI', URI: PDFString.of(link) },
            })));
          }
          x += w + font.widthOfTextAtSize(sep, cSize);
        }
      }
      y -= 52;

      if (summary.trim()) { sectionHead('Professional Summary'); para(summary.trim(), L, 10, 14); }

      if (experience.some(e => e.company || e.role)) {
        sectionHead('Experience');
        for (const exp of experience) {
          if (!exp.company && !exp.role) continue;
          ensure(40);
          const dateRange = [exp.start, exp.end].filter(Boolean).join(' – ');
          txt(exp.role || 'Position', L, y, 11, bold);
          if (dateRange) rightTxt(dateRange, y, 9, font, grey);
          y -= 14;
          if (exp.company) { txt(exp.company, L, y, 9, font, grey); y -= 13; }
          for (const bullet of exp.bullets.split('\n').map(b => b.trim()).filter(Boolean)) {
            ensure(13);
            txt('•', L + 2, y, 9.5);
            para(bullet, L + 12, 9.5, 13);
          }
          y -= 6;
        }
      }

      if (education.some(e => e.school || e.degree)) {
        sectionHead('Education');
        for (const edu of education) {
          if (!edu.school && !edu.degree) continue;
          ensure(30);
          txt(edu.degree || 'Degree', L, y, 11, bold);
          if (edu.year) rightTxt(edu.year, y, 9, font, grey);
          y -= 14;
          const schoolLine = [edu.school, edu.gpa ? `GPA: ${edu.gpa}` : ''].filter(Boolean).join('  ·  ');
          if (schoolLine) para(schoolLine, L, 9, 14, font, grey);
        }
      }

      if (skills.trim()) {
        sectionHead('Skills');
        para(skills.split(',').map(s => s.trim()).filter(Boolean).join('  ·  '), L, 9.5, 14);
      }

      const bytes = await doc.save();
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
    } catch (err) {
      console.error(err);
      setError('Failed to generate resume.');
    } finally {
      setIsProcessing(false);
    }
  };

  const inp = (val: string, set: (v: string) => void, placeholder = '') => (
    <input value={val} onChange={e => set(e.target.value)} placeholder={placeholder} style={fieldStyle} />
  );

  return (
    <ToolWorkspaceLayout title="Resume Builder" description="Build a clean, ATS-friendly PDF resume directly in your browser — no account needed.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, minWidth: 0, padding: '28px', display: 'flex', flexDirection: 'column', gap: '18px', borderRight: '1px solid var(--hairline)', background: 'var(--card-bg)', overflowY: 'auto' }}>

          {/* Personal Info */}
          <div>
            <p style={{ ...labelStyle, marginBottom: '12px' }}>Personal Info</p>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: '2 1 200px', minWidth: 0 }}><label style={labelStyle}>Full Name *</label>{inp(name, setName, 'Jane Smith')}</div>
              <div style={{ flex: '1 1 140px', minWidth: 0 }}><label style={labelStyle}>Phone</label>{inp(phone, setPhone, '(555) 123-4567')}</div>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={colStyle}><label style={labelStyle}>Email</label>{inp(email, setEmail, 'jane@example.com')}</div>
              <div style={colStyle}><label style={labelStyle}>Location</label>{inp(location, setLocation, 'New York, NY')}</div>
              <div style={colStyle}><label style={labelStyle}>LinkedIn / URL</label>{inp(linkedin, setLinkedin, 'linkedin.com/in/jane')}</div>
            </div>
          </div>

          {/* Summary */}
          <div>
            <label style={labelStyle}>Professional Summary</label>
            <textarea value={summary} onChange={e => setSummary(e.target.value)} placeholder="Results-driven professional with 5+ years of experience…" rows={3}
              style={areaStyle} />
          </div>

          {/* Experience */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <p style={{ ...labelStyle, margin: 0 }}>Experience</p>
              <button onClick={addExp} className="btn-secondary" style={addBtnStyle}><Plus size={14} /> Add</button>
            </div>
            {experience.map((exp) => (
              <div key={exp.id} style={{ background: 'var(--surface-high)', padding: '16px', borderRadius: '20px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: '2 1 160px', minWidth: 0 }}><label style={labelStyle}>Job Title</label><input value={exp.role} onChange={e => updateExp(exp.id, 'role', e.target.value)} placeholder="Software Engineer" style={entryFieldStyle} /></div>
                  <div style={{ flex: '2 1 160px', minWidth: 0 }}><label style={labelStyle}>Company</label><input value={exp.company} onChange={e => updateExp(exp.id, 'company', e.target.value)} placeholder="Google" style={entryFieldStyle} /></div>
                  <div style={{ flex: '1 1 110px', minWidth: 0 }}><label style={labelStyle}>Start</label><input value={exp.start} onChange={e => updateExp(exp.id, 'start', e.target.value)} placeholder="Jan 2021" style={entryFieldStyle} /></div>
                  <div style={{ flex: '1 1 110px', minWidth: 0 }}><label style={labelStyle}>End</label><input value={exp.end} onChange={e => updateExp(exp.id, 'end', e.target.value)} placeholder="Present" style={entryFieldStyle} /></div>
                  {experience.length > 1 && <button onClick={() => removeExp(exp.id)} aria-label="Remove experience entry" style={removeBtnStyle}><Trash2 size={16} /></button>}
                </div>
                <label style={labelStyle}>Bullet Points <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>(one per line)</span></label>
                <textarea value={exp.bullets} onChange={e => updateExp(exp.id, 'bullets', e.target.value)} placeholder={"Led team of 5 engineers to deliver project 2 weeks early\nReduced load time by 40% through code optimization"} rows={3}
                  style={{ ...areaStyle, background: 'var(--surface)' }} />
              </div>
            ))}
          </div>

          {/* Education */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <p style={{ ...labelStyle, margin: 0 }}>Education</p>
              <button onClick={addEdu} className="btn-secondary" style={addBtnStyle}><Plus size={14} /> Add</button>
            </div>
            {education.map(edu => (
              <div key={edu.id} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-end', flexWrap: 'wrap', background: 'var(--surface-high)', padding: '16px', borderRadius: '20px' }}>
                <div style={{ flex: '2 1 160px', minWidth: 0 }}><label style={labelStyle}>School</label><input value={edu.school} onChange={e => updateEdu(edu.id, 'school', e.target.value)} placeholder="MIT" style={entryFieldStyle} /></div>
                <div style={{ flex: '2 1 160px', minWidth: 0 }}><label style={labelStyle}>Degree / Field</label><input value={edu.degree} onChange={e => updateEdu(edu.id, 'degree', e.target.value)} placeholder="B.S. Computer Science" style={entryFieldStyle} /></div>
                <div style={{ flex: '1 1 90px', minWidth: 0 }}><label style={labelStyle}>Year</label><input value={edu.year} onChange={e => updateEdu(edu.id, 'year', e.target.value)} placeholder="2022" style={entryFieldStyle} /></div>
                <div style={{ flex: '1 1 90px', minWidth: 0 }}><label style={labelStyle}>GPA</label><input value={edu.gpa} onChange={e => updateEdu(edu.id, 'gpa', e.target.value)} placeholder="3.9" style={entryFieldStyle} /></div>
                {education.length > 1 && <button onClick={() => removeEdu(edu.id)} aria-label="Remove education entry" style={removeBtnStyle}><Trash2 size={16} /></button>}
              </div>
            ))}
          </div>

          {/* Skills */}
          <div>
            <label style={labelStyle}>Skills <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>(comma-separated)</span></label>
            <input value={skills} onChange={e => setSkills(e.target.value)} placeholder="Python, React, SQL, Project Management, Communication"
              style={fieldStyle} />
          </div>
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, minWidth: 0, padding: '28px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={18} color="var(--accent)" /> Build Resume
          </h3>
          {downloadUrl ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', boxShadow: 'var(--shadow-raised)', textAlign: 'center' }}>
                <CheckCircle size={48} color="var(--good)" style={{ margin: '0 auto 12px' }} />
                <h4 style={{ marginBottom: '8px' }}>Resume Ready!</h4>
                <a href={downloadUrl} download={`${name.replace(/\s+/g, '_') || 'resume'}.pdf`}
                  className="btn-primary" style={{ display: 'flex', textDecoration: 'none', marginBottom: '8px' }}>
                  Download PDF
                </a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`${name.replace(/\s+/g, '_') || 'resume'}.pdf`} />
                <button onClick={() => setDownloadUrl(null)} className="btn-secondary"
                  style={{ width: '100%' }}>
                  Edit & Regenerate
                </button>
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '20px' }}>
                Fill in your information and click Generate. Your resume will be formatted as a clean single-page PDF with a dark header and ATS-friendly layout.
              </p>
              <div style={{ fontSize: '14px', lineHeight: '20px', background: 'var(--surface-sunken)', padding: '12px 16px', borderRadius: '16px' }}>
                <div style={{ marginBottom: '4px' }}>✓ {experience.filter(e => e.company || e.role).length} experience entr{experience.filter(e => e.company || e.role).length !== 1 ? 'ies' : 'y'}</div>
                <div style={{ marginBottom: '4px' }}>✓ {education.filter(e => e.school || e.degree).length} education entr{education.filter(e => e.school || e.degree).length !== 1 ? 'ies' : 'y'}</div>
                {skills && <div>✓ Skills section</div>}
              </div>
              <button onClick={generate} disabled={!name || isProcessing} className="btn-primary"
                style={{ width: '100%' }}>
                {isProcessing ? 'Generating…' : 'Generate Resume PDF'} <ArrowRight size={16} />
              </button>
              {!name && <p style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--warn)', textAlign: 'center' }}>Enter your name to get started.</p>}
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default ResumeBuilder;
