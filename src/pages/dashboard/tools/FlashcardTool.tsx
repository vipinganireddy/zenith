import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, FileText, X, ChevronLeft, ChevronRight, RefreshCw, RotateCw, Key } from 'lucide-react';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import { callAI, hasAnyKey, extractPdfText } from '../../../utils/aiService';

interface Flashcard { front: string; back: string; }
type Phase = 'upload' | 'generating' | 'study' | 'done';

const FlashcardTool = () => {
  const navigate = useNavigate();
  const [file, setFile]             = useState<File | null>(null);
  const [phase, setPhase]           = useState<Phase>('upload');
  const [cards, setCards]           = useState<Flashcard[]>([]);
  const [current, setCurrent]       = useState(0);
  const [flipped, setFlipped]       = useState(false);
  const [known, setKnown]           = useState<Set<number>>(new Set());
  const [numCards, setNumCards]     = useState(10);
  const [error, setError]           = useState('');

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
      const text = await extractPdfText(file, 12000);
      const raw = await callAI([{
        role: 'user',
        content: `Generate exactly ${numCards} flashcards from the document below.
Return ONLY a JSON array — no markdown, no explanation.
Schema: [{"front":"question or term","back":"answer or definition"}]
Make the fronts concise (a term, concept, or question) and backs clear (1-3 sentences max).

DOCUMENT:
${text.slice(0, 12000)}`,
      }], {
        systemPrompt: 'You are a study-card creator. Output only valid JSON.',
        maxTokens: 3000,
      });

      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('AI returned an unexpected format. Try again.');
      const parsed: Flashcard[] = (JSON.parse(match[0]) as unknown[])
        .filter((c): c is Flashcard => typeof (c as Flashcard)?.front === 'string' && typeof (c as Flashcard)?.back === 'string');
      if (parsed.length === 0) throw new Error('No flashcards were generated. Try again.');

      setCards(parsed);
      setCurrent(0);
      setFlipped(false);
      setKnown(new Set());
      setPhase('study');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('upload');
    }
  };

  const goNext = () => {
    if (current + 1 >= cards.length) { setPhase('done'); return; }
    setCurrent(c => c + 1);
    setFlipped(false);
  };

  const goPrev = () => {
    if (current > 0) { setCurrent(c => c - 1); setFlipped(false); }
  };

  const markKnown = () => {
    setKnown(prev => new Set(prev).add(current));
    goNext();
  };

  const markStudy = () => {
    setKnown(prev => { const s = new Set(prev); s.delete(current); return s; });
    goNext();
  };

  const restart = () => {
    setCurrent(0); setFlipped(false); setKnown(new Set()); setPhase('study');
  };

  const reset = () => {
    setFile(null); setCards([]); setCurrent(0); setFlipped(false);
    setKnown(new Set()); setError(''); setPhase('upload');
  };

  const card = cards[current];
  const pct = cards.length > 0 ? Math.round((known.size / cards.length) * 100) : 0;

  return (
    <ToolWorkspaceLayout title="AI Flashcard Generator" description="Upload a PDF and get interactive study flashcards generated from its content.">
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
                  <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Drop a PDF to generate flashcards</p>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>or click to browse</p>
                </>
              )}
            </div>

            <div style={{ background: 'var(--surface)', borderRadius: '24px', padding: '20px', boxShadow: 'var(--shadow-raised)' }}>
              <label style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: '10px' }}>
                Flashcards: <span style={{ color: 'var(--accent)' }}>{numCards}</span>
              </label>
              <input type="range" min={5} max={20} value={numCards} onChange={e => setNumCards(+e.target.value)}
                style={{ width: '100%', accentColor: 'var(--accent)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                <span>5 (quick)</span><span>20 (comprehensive)</span>
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
                ✨ Generate Flashcards
              </button>
            )}
          </div>
        )}

        {/* ── Generating ── */}
        {phase === 'generating' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
              style={{ width: '60px', height: '60px', borderRadius: '50%', border: '4px solid var(--surface-high)', borderTopColor: 'var(--accent)' }} />
            <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>Generating flashcards…</p>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Reading the document and creating {numCards} study cards</p>
          </div>
        )}

        {/* ── Study ── */}
        {phase === 'study' && card && (
          <div style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            {/* Progress */}
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600 }}>Card {current + 1} <span style={{ color: 'var(--text-muted)' }}>of {cards.length}</span></span>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>✓ {known.size} known</span>
              </div>
              <div style={{ height: '6px', background: 'var(--surface-high)', borderRadius: '9999px', overflow: 'hidden' }}>
                <motion.div animate={{ width: `${((current) / cards.length) * 100}%` }} style={{ height: '100%', background: 'var(--accent)', borderRadius: '9999px' }} />
              </div>
            </div>

            {/* Flip card */}
            <div style={{ width: '100%', perspective: '1200px', cursor: 'pointer' }} onClick={() => setFlipped(f => !f)}
              role="button" tabIndex={0} aria-label={flipped ? 'Show question' : 'Reveal answer'}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped(f => !f); } }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${current}-${flipped ? 'back' : 'front'}`}
                  initial={{ rotateY: flipped ? -90 : 90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  exit={{ rotateY: flipped ? 90 : -90, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{
                    minHeight: '220px', borderRadius: '24px', padding: '36px 32px',
                    background: flipped ? 'var(--accent)' : 'var(--surface)',
                    boxShadow: 'var(--shadow-raised)', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '12px',
                  }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: flipped ? 'color-mix(in srgb, var(--on-accent) 75%, transparent)' : 'var(--text-muted)' }}>
                    {flipped ? 'Answer' : 'Question / Term'}
                  </span>
                  <p style={{ fontSize: '20px', fontWeight: 700, color: flipped ? 'var(--on-accent)' : 'var(--text-main)', lineHeight: 1.45, margin: 0 }}>
                    {flipped ? card.back : card.front}
                  </p>
                  <span style={{ fontSize: '12px', color: flipped ? 'color-mix(in srgb, var(--on-accent) 60%, transparent)' : 'var(--text-muted)', marginTop: '8px' }}>
                    {flipped ? '' : 'Tap to reveal answer'}
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Flip hint + icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '12px' }}>
              <RotateCw size={13} />
              <span>Tap the card to flip it</span>
            </div>

            {/* Know / Study buttons */}
            <div style={{ display: 'flex', gap: '12px', width: '100%', flexWrap: 'wrap' }}>
              <button onClick={markStudy}
                style={{ flex: 1, minHeight: '56px', background: 'var(--warn-bg)', border: 'none', borderRadius: '24px', color: 'var(--ink)', fontWeight: 700, fontSize: '16px', cursor: 'pointer' }}>
                Still learning
              </button>
              <button onClick={markKnown}
                style={{ flex: 1, minHeight: '56px', background: 'var(--good-bg)', border: 'none', borderRadius: '24px', color: 'var(--ink)', fontWeight: 700, fontSize: '16px', cursor: 'pointer' }}>
                Got it ✓
              </button>
            </div>

            {/* Nav arrows */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={goPrev} disabled={current === 0}
                className="btn-secondary" style={{ height: '48px', minHeight: '48px', padding: '0 20px', borderRadius: '999px', fontSize: '14px', opacity: current === 0 ? 0.5 : 1 }}>
                <ChevronLeft size={16} /> Prev
              </button>
              <button onClick={goNext}
                className="btn-primary" style={{ height: '48px', minHeight: '48px', padding: '0 20px', borderRadius: '999px', fontSize: '14px' }}>
                {current + 1 >= cards.length ? 'Finish' : 'Skip'} <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {phase === 'done' && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            style={{ textAlign: 'center', maxWidth: '440px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: `color-mix(in srgb, ${pct >= 70 ? 'var(--good)' : 'var(--warn)'} 12%, transparent)`, border: `5px solid ${pct >= 70 ? 'var(--good)' : 'var(--warn)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', marginBottom: '8px' }}>
              {pct >= 90 ? '🏆' : pct >= 70 ? '🎉' : pct >= 50 ? '👍' : '📚'}
            </div>
            <h2 style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-main)' }}>{known.size}/{cards.length} cards known</h2>
            <p style={{ fontSize: '16px', fontWeight: 700, color: pct >= 70 ? 'var(--success)' : 'var(--warn)' }}>
              {pct >= 90 ? 'Mastered!' : pct >= 70 ? 'Great progress!' : pct >= 50 ? 'Keep practicing!' : 'Keep studying!'}
            </p>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>You got <strong>{pct}%</strong> of this deck</p>

            <div style={{ display: 'flex', gap: '12px', width: '100%', flexWrap: 'wrap' }}>
              <button onClick={restart}
                className="btn-secondary" style={{ flex: '1 1 140px' }}>
                <RefreshCw size={14} /> Study Again
              </button>
              <button onClick={reset}
                className="btn-primary" style={{ flex: '1 1 140px' }}>
                New Deck
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </ToolWorkspaceLayout>
  );
};

export default FlashcardTool;
