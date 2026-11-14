import { useState, useCallback, type CSSProperties } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UploadCloud, FileText, X, Key, CheckCircle, AlertTriangle, TrendingUp, Shield } from 'lucide-react';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import { callAI, hasAnyKey, extractPdfText } from '../../../utils/aiService';

const ACTION_BTN: CSSProperties = { height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px' };

interface ResumeAnalysis {
  score: number;
  grade: string;
  verdict: string;
  strengths: string[];
  improvements: string[];
  ats_notes: string[];
  keywords_missing: string[];
  section_feedback: { section: string; score: number; note: string }[];
}

type Phase = 'upload' | 'analyzing' | 'done';

const ScoreRing = ({ score }: { score: number }) => {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? 'var(--good)' : score >= 60 ? 'var(--warn)' : 'var(--bad)';
  return (
    <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface-high)" strokeWidth="12" />
      <motion.circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="12"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        initial={{ strokeDasharray: `0 ${circ}` }}
        animate={{ strokeDasharray: `${dash} ${circ}` }}
        transition={{ duration: 1.2, ease: 'easeOut' }} />
      <text x="70" y="70" textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: '70px 70px', fill: color, fontSize: '32px', fontWeight: 800 }}>
        {score}
      </text>
    </svg>
  );
};

const AIResumeScan = () => {
  const navigate = useNavigate();
  const [file, setFile]           = useState<File | null>(null);
  const [phase, setPhase]         = useState<Phase>('upload');
  const [analysis, setAnalysis]   = useState<ResumeAnalysis | null>(null);
  const [error, setError]         = useState('');

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) { setFile(accepted[0]); setError(''); }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false,
  });

  const analyze = async () => {
    if (!file || !hasAnyKey()) return;
    setPhase('analyzing');
    setError('');
    try {
      const text = await extractPdfText(file);
      const raw = await callAI([{
        role: 'user',
        content: `Analyze the resume below and return ONLY a JSON object — no markdown fences, no extra text.
Schema:
{
  "score": <0-100 integer>,
  "grade": <"A+" | "A" | "B+" | "B" | "C+" | "C" | "D">,
  "verdict": <1-sentence overall verdict>,
  "strengths": [<3-5 strength strings>],
  "improvements": [<3-5 specific improvement strings>],
  "ats_notes": [<2-4 ATS compatibility notes>],
  "keywords_missing": [<3-6 important keywords likely missing>],
  "section_feedback": [
    {"section":"Contact Info","score":<0-10>,"note":"..."},
    {"section":"Summary","score":<0-10>,"note":"..."},
    {"section":"Experience","score":<0-10>,"note":"..."},
    {"section":"Education","score":<0-10>,"note":"..."},
    {"section":"Skills","score":<0-10>,"note":"..."}
  ]
}

RESUME:
${text.slice(0, 12000)}`,
      }], {
        systemPrompt: 'You are an expert resume coach and ATS specialist. Analyze resumes objectively. Output only valid JSON.',
        maxTokens: 2500,
      });

      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Unexpected AI response format. Try again.');
      const parsed: ResumeAnalysis = JSON.parse(match[0]);
      setAnalysis(parsed);
      setPhase('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('upload');
    }
  };

  const reset = () => {
    setFile(null); setAnalysis(null); setError(''); setPhase('upload');
  };

  const gradeColor = (score: number) => score >= 8 ? 'var(--good)' : score >= 6 ? 'var(--warn)' : 'var(--bad)';

  return (
    <ToolWorkspaceLayout title="AI Resume Scanner" description="Upload your resume PDF and get a detailed AI-powered analysis with an ATS score.">
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
                  <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Drop your resume PDF here</p>
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
              <button onClick={analyze} disabled={!file}
                className="btn-primary" style={{ width: '100%' }}>
                🔍 Analyze Resume
              </button>
            )}
          </div>
        )}

        {/* ── Analyzing ── */}
        {phase === 'analyzing' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
                style={{ width: '60px', height: '60px', borderRadius: '50%', border: '4px solid var(--surface-high)', borderTopColor: 'var(--accent)' }} />
              <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>Analyzing your resume…</p>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Checking ATS compatibility, strengths, and improvements</p>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {phase === 'done' && analysis && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Score hero */}
            <div style={{ background: 'var(--surface-sunken)', borderRadius: '24px', padding: '28px', display: 'flex', alignItems: 'center', gap: '28px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: '140px', height: '140px', flexShrink: 0 }}>
                <ScoreRing score={analysis.score} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>ATS SCORE</span>
                </div>
              </div>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '32px', fontWeight: 800, color: analysis.score >= 80 ? 'var(--success)' : analysis.score >= 60 ? 'var(--warn)' : 'var(--danger)' }}>{analysis.grade}</span>
                  <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Grade</span>
                </div>
                <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{analysis.verdict}</p>
                <button onClick={reset} className="btn-primary" style={{ ...ACTION_BTN, marginTop: '16px' }}>
                  Scan Another
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '16px' }}>
              {/* Strengths */}
              <div style={{ background: 'var(--surface-sunken)', borderRadius: '24px', padding: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                  <CheckCircle size={16} /> Strengths
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {analysis.strengths.map((s, i) => (
                    <li key={i} style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--success)', flexShrink: 0 }}>✓</span> {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Improvements */}
              <div style={{ background: 'var(--surface-sunken)', borderRadius: '24px', padding: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                  <TrendingUp size={16} /> Improvements
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {analysis.improvements.map((s, i) => (
                    <li key={i} style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--danger)', flexShrink: 0 }}>→</span> {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* ATS Notes */}
              <div style={{ background: 'var(--surface-sunken)', borderRadius: '24px', padding: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                  <Shield size={16} /> ATS Compatibility
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {analysis.ats_notes.map((s, i) => (
                    <li key={i} style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--warn)', flexShrink: 0 }}>⚡</span> {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Missing Keywords */}
              <div style={{ background: 'var(--surface-sunken)', borderRadius: '24px', padding: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                  <AlertTriangle size={16} /> Missing Keywords
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {analysis.keywords_missing.map((kw, i) => (
                    <span key={i} style={{ padding: '6px 12px', background: 'var(--surface-high)', borderRadius: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--ink-muted)' }}>
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Section-by-section scores */}
            <div style={{ background: 'var(--surface-sunken)', borderRadius: '24px', padding: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '16px' }}>Section Scores</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {analysis.section_feedback.map((sec, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>{sec.section}</span>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: gradeColor(sec.score) }}>{sec.score}/10</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--surface-high)', borderRadius: '9999px', overflow: 'hidden', marginBottom: '4px' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${sec.score * 10}%` }}
                        transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
                        style={{ height: '100%', background: gradeColor(sec.score), borderRadius: '9999px' }} />
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>{sec.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </ToolWorkspaceLayout>
  );
};

export default AIResumeScan;
