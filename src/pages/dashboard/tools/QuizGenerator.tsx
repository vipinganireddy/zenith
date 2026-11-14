import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, FileText, X, CheckCircle, XCircle, RefreshCw, ChevronRight, Key } from 'lucide-react';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import { callAI, hasAnyKey, extractPdfText } from '../../../utils/aiService';

interface Question { question: string; options: string[]; correct: number; explanation?: string; }
type Phase = 'upload' | 'generating' | 'quiz' | 'result';

const QuizGenerator = () => {
  const navigate = useNavigate();
  const [file, setFile]         = useState<File | null>(null);
  const [phase, setPhase]       = useState<Phase>('upload');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent]   = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [wrongIndexes, setWrongIndexes] = useState<Set<number>>(new Set());
  const [score, setScore]       = useState(0);
  const [numQ, setNumQ]         = useState(5);
  const [error, setError]       = useState('');

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) { setFile(accepted[0]); setError(''); }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false,
  });

  const generate = async () => {
    if (!file || !hasAnyKey()) return;
    setPhase('generating');
    setError('');
    try {
      const text = await extractPdfText(file);
      const raw = await callAI([{
        role: 'user',
        content: `Generate exactly ${numQ} multiple-choice quiz questions from the document below.
Return ONLY a JSON array, no markdown fences, no extra text.
Schema: [{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct":0,"explanation":"..."}]
"correct" is the 0-based index of the correct option.
"explanation" is a 1-sentence explanation of why it's correct.

DOCUMENT:
${text.slice(0, 10000)}`,
      }], {
        systemPrompt: 'You are a quiz-question writer. Output only valid JSON.',
        maxTokens: 2500,
      });

      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('AI returned an unexpected format. Try again.');
      // Keep only well-formed questions — one malformed item must not break the quiz.
      const parsed: Question[] = (JSON.parse(match[0]) as unknown[]).filter((q): q is Question => {
        const x = q as Partial<Question>;
        return typeof x?.question === 'string' && Array.isArray(x.options) && x.options.length >= 2
          && x.options.every(o => typeof o === 'string')
          && Number.isInteger(x.correct) && x.correct! >= 0 && x.correct! < x.options.length;
      });
      if (parsed.length === 0) throw new Error('No questions were generated. Try again.');

      setQuestions(parsed);
      setCurrent(0); setSelected(null); setAnswered(false);
      setScore(0); setWrongIndexes(new Set());
      setPhase('quiz');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('upload');
    }
  };

  const pick = (idx: number) => {
    if (answered) return;
    setSelected(idx);
    setAnswered(true);
    if (idx === questions[current].correct) {
      setScore(s => s + 1);
    } else {
      setWrongIndexes(prev => new Set(prev).add(current));
    }
  };

  const next = () => {
    if (current + 1 >= questions.length) { setPhase('result'); return; }
    setCurrent(c => c + 1); setSelected(null); setAnswered(false);
  };

  const retake = () => {
    setCurrent(0); setSelected(null); setAnswered(false); setScore(0); setWrongIndexes(new Set()); setPhase('quiz');
  };

  const reset = () => {
    setFile(null); setPhase('upload'); setQuestions([]); setCurrent(0);
    setScore(0); setWrongIndexes(new Set()); setSelected(null); setAnswered(false); setError('');
  };

  const q = questions[current];
  const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
  const grade = pct >= 90 ? { emoji: '🏆', label: 'Outstanding!', color: 'var(--good)' }
    : pct >= 70 ? { emoji: '🎉', label: 'Great job!', color: 'var(--good)' }
    : pct >= 50 ? { emoji: '👍', label: 'Good effort!', color: 'var(--warn)' }
    : { emoji: '📚', label: 'Keep studying!', color: 'var(--bad)' };

  return (
    <ToolWorkspaceLayout title="AI Quiz Generator" description="Upload a PDF and get an interactive quiz generated from its content.">
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px', minHeight: '520px', overflow: 'auto', minWidth: 0 }}>

        {/* ── Upload ── */}
        {phase === 'upload' && (
          <div style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                  <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Drop a PDF here to generate a quiz</p>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>or click to browse</p>
                </>
              )}
            </div>

            <div style={{ background: 'var(--surface)', borderRadius: '24px', padding: '20px', boxShadow: 'var(--shadow-raised)' }}>
              <label style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: '10px' }}>
                Questions: <span style={{ color: 'var(--accent)' }}>{numQ}</span>
              </label>
              <input type="range" min={3} max={15} value={numQ} onChange={e => setNumQ(+e.target.value)}
                style={{ width: '100%', accentColor: 'var(--accent)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                <span>3 (quick)</span><span>15 (comprehensive)</span>
              </div>
            </div>

            {error && <div style={{ padding: '12px 16px', background: 'var(--danger-bg)', borderRadius: '16px', color: 'var(--danger)', fontSize: '14px', lineHeight: '20px' }}>{error}</div>}

            {!hasAnyKey() ? (
              <div style={{ padding: '16px', background: 'var(--warn-bg)', borderRadius: '16px' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-main)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}><Key size={14} color="var(--accent)" /> No API key — AI features disabled.</p>
                <button onClick={() => navigate('/dashboard/profile?tab=api-keys')} className="btn-primary" style={{ width: '100%' }}>Add API Key →</button>
              </div>
            ) : (
              <button onClick={generate} disabled={!file} className="btn-primary" style={{ width: '100%' }}>
                ✨ Generate Quiz
              </button>
            )}
          </div>
        )}

        {/* ── Generating ── */}
        {phase === 'generating' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
              style={{ width: '60px', height: '60px', borderRadius: '50%', border: '4px solid var(--surface-high)', borderTopColor: 'var(--accent)' }} />
            <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>Generating your quiz…</p>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Reading the document and crafting {numQ} questions</p>
          </div>
        )}

        {/* ── Quiz ── */}
        {phase === 'quiz' && q && (
          <div style={{ width: '100%', maxWidth: '620px' }}>
            {/* Progress bar */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600 }}>Question {current + 1} <span style={{ color: 'var(--text-muted)' }}>of {questions.length}</span></span>
                <span>Score: <strong style={{ color: 'var(--accent)' }}>{score}</strong>/{questions.length}</span>
              </div>
              <div style={{ height: '6px', background: 'var(--surface-high)', borderRadius: '9999px', overflow: 'hidden' }}>
                <motion.div animate={{ width: `${(current / questions.length) * 100}%` }} style={{ height: '100%', background: 'var(--accent)', borderRadius: '9999px' }} />
              </div>
            </div>

            {/* Question card */}
            <AnimatePresence mode="wait">
              <motion.div key={current} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
                style={{ background: 'var(--surface)', borderRadius: '24px', padding: '28px 28px 24px', marginBottom: '16px', boxShadow: 'var(--shadow-raised)' }}>
                <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.55, margin: 0 }}>{q.question}</p>
              </motion.div>
            </AnimatePresence>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
              {q.options.map((opt, i) => {
                const isCorrect = i === q.correct;
                const isSelected = i === selected;
                const letter = ['A', 'B', 'C', 'D'][i];
                let bg = 'var(--surface-sunken)', ring = 'none', color = 'var(--ink)', letterBg = 'var(--surface-high)', letterColor = 'var(--ink-muted)';
                if (answered) {
                  if (isCorrect) { bg = 'var(--good-bg)'; ring = 'inset 0 0 0 2px var(--good)'; color = 'var(--ink)'; letterBg = 'var(--good)'; letterColor = 'var(--on-accent)'; }
                  else if (isSelected) { bg = 'var(--danger-bg)'; ring = 'inset 0 0 0 2px var(--bad)'; color = 'var(--ink)'; letterBg = 'var(--bad)'; letterColor = 'var(--on-accent)'; }
                } else if (isSelected) {
                  bg = 'color-mix(in srgb, var(--accent) 12%, transparent)'; ring = 'inset 0 0 0 2px var(--accent)'; color = 'var(--ink)'; letterBg = 'var(--accent)'; letterColor = 'var(--on-accent)';
                }
                return (
                  <button key={i} onClick={() => pick(i)} disabled={answered}
                    style={{ minHeight: '56px', padding: '12px 16px', borderRadius: '16px', border: 'none', boxShadow: ring, background: bg, color, cursor: answered ? 'default' : 'pointer', textAlign: 'left', fontWeight: 500, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.15s', lineHeight: '24px' }}>
                    <span style={{ width: '32px', height: '32px', borderRadius: '12px', background: letterBg, color: letterColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, flexShrink: 0, transition: 'all 0.15s' }}>
                      {letter}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>{opt.replace(/^[A-D]\)\s*/, '')}</span>
                    {answered && isCorrect && <CheckCircle size={18} color="var(--good)" style={{ flexShrink: 0 }} />}
                    {answered && isSelected && !isCorrect && <XCircle size={18} color="var(--danger)" style={{ flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>

            {/* Feedback */}
            <AnimatePresence>
              {answered && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div style={{ padding: '12px 16px', borderRadius: '16px', marginBottom: '16px', background: selected === q.correct ? 'var(--good-bg)' : 'var(--danger-bg)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: selected === q.correct ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {selected === q.correct ? <><CheckCircle size={15} /> Correct!</> : <><XCircle size={15} /> Incorrect — correct answer: {['A','B','C','D'][q.correct]}</>}
                    </div>
                    {q.explanation && <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{q.explanation}</p>}
                  </div>
                  <button onClick={next} className="btn-primary" style={{ width: '100%' }}>
                    {current + 1 >= questions.length ? 'See Results 🏆' : 'Next Question'} <ChevronRight size={18} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── Results ── */}
        {phase === 'result' && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            style={{ textAlign: 'center', maxWidth: '480px', width: '100%' }}>
            <div style={{ width: '110px', height: '110px', borderRadius: '50%', background: `color-mix(in srgb, ${grade.color} 12%, transparent)`, border: `5px solid ${grade.color}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <span style={{ fontSize: '32px' }}>{grade.emoji}</span>
            </div>
            <h2 style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>{score}/{questions.length}</h2>
            <p style={{ fontSize: '20px', fontWeight: 700, color: grade.color, marginBottom: '4px' }}>{grade.label}</p>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }}>You scored <strong>{pct}%</strong> on this quiz</p>

            {/* Per-question review */}
            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px', maxHeight: '260px', overflowY: 'auto' }}>
              {questions.map((qq, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '16px', background: 'var(--surface-sunken)', fontSize: '14px', lineHeight: '20px' }}>
                  {wrongIndexes.has(i) ? <XCircle size={16} color="var(--danger)" style={{ flexShrink: 0 }} /> : <CheckCircle size={16} color="var(--good)" style={{ flexShrink: 0 }} />}
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--text-secondary)', lineHeight: '20px' }}>{qq.question.slice(0, 72)}{qq.question.length > 72 ? '…' : ''}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>Ans: {['A','B','C','D'][qq.correct]}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button onClick={retake} className="btn-secondary" style={{ flex: '1 1 140px' }}>
                Retake Quiz
              </button>
              <button onClick={reset} className="btn-primary" style={{ flex: '1 1 140px' }}>
                <RefreshCw size={14} /> New Quiz
              </button>
            </div>
          </motion.div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </ToolWorkspaceLayout>
  );
};

export default QuizGenerator;
