import { useEffect, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { trackToolUsage } from '../../utils/activityTracker';
import { useSubscription } from '../../context/SubscriptionContext';
import { toolsData } from '../../data/toolsData';
import GateModal from '../../components/GateModal';
import ErrorBoundary from '../../components/ErrorBoundary';
import type { AccessResult } from '../../context/SubscriptionContext';

// Each tool pulls in heavy libs (pdf-lib, pdfjs-dist, tesseract.js) — lazy-load
// so a visit to one tool doesn't bundle all 50+ others into the initial chunk.
const MergePDF = lazy(() => import('./tools/MergePDF'));
const AISummarizePDF = lazy(() => import('./tools/AISummarizePDF'));
const CompressPDF = lazy(() => import('./tools/CompressPDF'));
const SplitPDF = lazy(() => import('./tools/SplitPDF'));
const RotatePDF = lazy(() => import('./tools/RotatePDF'));
const DeletePages = lazy(() => import('./tools/DeletePages'));
const HtmlToPdf = lazy(() => import('./tools/HtmlToPdf'));
const ImageToPdf = lazy(() => import('./tools/ImageToPdf'));
const WordToPdf = lazy(() => import('./tools/WordToPdf'));
const ExcelToPdf = lazy(() => import('./tools/ExcelToPdf'));
const TxtToPdf = lazy(() => import('./tools/TxtToPdf'));
const EpubToPdf = lazy(() => import('./tools/EpubToPdf'));
const AssignmentOrganizer = lazy(() => import('./tools/AssignmentOrganizer'));
const PptToPdf = lazy(() => import('./tools/PptToPdf'));
const CsvToPdf = lazy(() => import('./tools/CsvToPdf'));
const SvgToPdf = lazy(() => import('./tools/SvgToPdf'));
const PdfToImages = lazy(() => import('./tools/PdfToImages'));
const PdfToTxt = lazy(() => import('./tools/PdfToTxt'));
const AddWatermark = lazy(() => import('./tools/AddWatermark'));
const AddPageNumbers = lazy(() => import('./tools/AddPageNumbers'));
const ProtectPdf = lazy(() => import('./tools/ProtectPdf'));
const UnlockPdf = lazy(() => import('./tools/UnlockPdf'));
const RearrangePages = lazy(() => import('./tools/RearrangePages'));
const DuplicatePages = lazy(() => import('./tools/DuplicatePages'));
const InsertBlankPage = lazy(() => import('./tools/InsertBlankPage'));
const CompressImages = lazy(() => import('./tools/CompressImages'));
const ResizeImages = lazy(() => import('./tools/ResizeImages'));
const ESignPdf = lazy(() => import('./tools/ESignPdf'));
const RedactPdf = lazy(() => import('./tools/RedactPdf'));
const PdfToWord = lazy(() => import('./tools/PdfToWord'));
const OcrPdf = lazy(() => import('./tools/OcrPdf'));
const AddHeaderFooter = lazy(() => import('./tools/AddHeaderFooter'));
const EditPdf = lazy(() => import('./tools/EditPdf'));
const AddImagesToPdf = lazy(() => import('./tools/AddImagesToPdf'));
const FillForms = lazy(() => import('./tools/FillForms'));
const CropPdf = lazy(() => import('./tools/CropPdf'));
const ResizePdfPages = lazy(() => import('./tools/ResizePdfPages'));
const FlattenPdf = lazy(() => import('./tools/FlattenPdf'));
const RemoveMetadata = lazy(() => import('./tools/RemoveMetadata'));
const RepairPdf = lazy(() => import('./tools/RepairPdf'));
const ChangeBackground = lazy(() => import('./tools/ChangeBackground'));
const ComparePdfs = lazy(() => import('./tools/ComparePdfs'));
const ExtractImages = lazy(() => import('./tools/ExtractImages'));
const PdfToExcel = lazy(() => import('./tools/PdfToExcel'));
const PdfToHtml = lazy(() => import('./tools/PdfToHtml'));
const ReplacePage = lazy(() => import('./tools/ReplacePage'));
const RestrictPdf = lazy(() => import('./tools/RestrictPdf'));
const InvoiceGenerator = lazy(() => import('./tools/InvoiceGenerator'));
const ScanToPdf = lazy(() => import('./tools/ScanToPdf'));
const ReduceResolution = lazy(() => import('./tools/ReduceResolution'));
const CitationGenerator = lazy(() => import('./tools/CitationGenerator'));
const ResumeBuilder = lazy(() => import('./tools/ResumeBuilder'));
const QuizGenerator = lazy(() => import('./tools/QuizGenerator'));
const FlashcardTool = lazy(() => import('./tools/FlashcardTool'));
const AITranslatePDF = lazy(() => import('./tools/AITranslatePDF'));
const AIResumeScan = lazy(() => import('./tools/AIResumeScan'));
const AIInvoiceReader = lazy(() => import('./tools/AIInvoiceReader'));
const UniversalTool = lazy(() => import('./tools/UniversalTool'));
const HeicConverter = lazy(() => import('./tools/HeicConverter'));
const RemoveWatermark = lazy(() => import('./tools/RemoveWatermark'));
const RemoveBackground = lazy(() => import('./tools/RemoveBackground'));

const ToolLoadingFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
    <div style={{ width: '36px', height: '36px', border: '3px solid var(--border-color)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
  </div>
);

// Map toolId → category (for access gating)
function getToolCategory(toolId: string): string {
  const cleanId = toolId.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const found = toolsData.find(t => {
    const tid = t.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    return tid === cleanId;
  });
  if (found) return found.category;
  // Fallback heuristics
  if (cleanId.includes('ai-') || cleanId.includes('flashcard') || cleanId.includes('quiz') || cleanId.includes('chat')) return 'ai';
  if (cleanId.includes('invoice') || cleanId.includes('resume-builder') || cleanId.includes('template')) return 'productivity';
  if (cleanId.includes('citation') || cleanId.includes('study') || cleanId.includes('notes')) return 'ai';
  return 'edit'; // default to an unlocked category
}

// Map toolId → human-readable name for activity tracking
function getToolName(toolId: string): string {
  const nameMap: Record<string, string> = {
    'merge-pdf': 'Merge PDF', 'split-pdf': 'Split PDF', 'compress-pdf': 'Compress PDF',
    'rotate-pdf': 'Rotate PDF', 'delete-pages': 'Delete Pages', 'rearrange-pages': 'Rearrange Pages',
    'pdf-to-word': 'PDF to Word', 'pdf-to-docx': 'PDF to Word', 'pdf-to-jpg': 'PDF to JPG',
    'pdf-to-png': 'PDF to PNG', 'pdf-to-txt': 'PDF to Text', 'pdf-to-excel': 'PDF to Excel',
    'pdf-to-html': 'PDF to HTML', 'word-to-pdf': 'Word to PDF', 'excel-to-pdf': 'Excel to PDF',
    'image-to-pdf': 'Image to PDF', 'jpg-to-pdf': 'Image to PDF', 'png-to-pdf': 'Image to PDF',
    'html-to-pdf': 'HTML to PDF',
    'txt-to-pdf': 'Text to PDF', 'csv-to-pdf': 'CSV to PDF', 'svg-to-pdf': 'SVG to PDF',
    'add-watermark': 'Add Watermark', 'add-page-numbers': 'Add Page Numbers',
    'add-header-footer': 'Add Header/Footer', 'protect-pdf': 'Protect PDF',
    'unlock-pdf': 'Unlock PDF', 'esign-pdf': 'eSign PDF', 'ocr-pdf': 'OCR PDF',
    'edit-pdf': 'Edit PDF', 'crop-pdf': 'Crop PDF', 'redact-pdf': 'Legal Redaction',
    'add-images-to-pdf': 'Add Images to PDF', 'fill-forms': 'Fill PDF Forms',
    'invoice-generator': 'Invoice Generator', 'resume-builder': 'Resume Builder',
    'citation-generator': 'Citation Generator', 'compare-pdfs': 'Compare PDFs',
    'scan-to-pdf': 'Scan to PDF', 'extract-images': 'Extract Images',
    'compress-images': 'Compress Images', 'resize-images': 'Resize Images',
  };
  return nameMap[toolId] || toolId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const ToolWorkspace = () => {
  const { toolId } = useParams();
  const navigate = useNavigate();
  const { checkAccess, consumeFreeUse } = useSubscription();
  const [gateReason, setGateReason] = useState<AccessResult | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);

  useEffect(() => {
    if (!toolId) return;

    const category = getToolCategory(toolId);
    const access = checkAccess(category, toolId);

    // Access is decided once per tool visit: consumeFreeUse below changes the
    // inputs to checkAccess, so it must not be re-derived on every render.
    // Reset the gate too — otherwise a lock from a previous tool sticks.
    setGateReason(access === 'allowed' ? null : access);
    setAccessChecked(true);
    if (access !== 'allowed') return;

    // Access granted — track usage and burn a free-tier try
    trackToolUsage(toolId, getToolName(toolId));
    consumeFreeUse(toolId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolId]);

  if (!toolId) return null;
  if (!accessChecked) return null; // brief flash prevention

  // Show gate wall if access denied
  if (gateReason && gateReason !== 'allowed') {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '48px' }}>🔒</div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-main)' }}>
            {gateReason === 'needs_pro' ? 'PRO Plan Required' : 'Free Limit Reached'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '16px', textAlign: 'center', maxWidth: '400px' }}>
            {gateReason === 'free_exhausted'
              ? `You've used all 3 free tries. Upgrade to PRO to continue.`
              : 'This tool requires the PRO plan or above.'}
          </p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button
              onClick={() => navigate('/dashboard/tools')}
              style={{ padding: '10px 20px', background: 'var(--hover-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, color: 'var(--text-main)', fontSize: '14px' }}
            >
              ← Back to Tools
            </button>
            <button
              onClick={() => navigate('/dashboard/subscription')}
              style={{ padding: '10px 20px', background: 'var(--primary)', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 700, color: 'var(--on-accent)', fontSize: '14px' }}
            >
              Upgrade Now
            </button>
          </div>
        </div>
        <GateModal
          reason={gateReason}
          onClose={() => { setGateReason(null); navigate('/dashboard/tools'); }}
          toolName={getToolName(toolId)}
        />
      </>
    );
  }

  return (
    <ErrorBoundary label="Unable to process this file — Try another document" resetLabel="Reset Tool" onReset={() => window.location.reload()}>
      <Suspense fallback={<ToolLoadingFallback />}>
        {renderTool(toolId)}
      </Suspense>
    </ErrorBoundary>
  );
};

function renderTool(toolId: string) {
  switch (toolId) {
    // ── Convert TO PDF ──────────────────────────────────────────
    case 'html-to-pdf':
    case 'webpage-to-pdf':
      return <HtmlToPdf />;
    case 'image-to-pdf': // JPG/PNG/Screenshot to PDF merged into one generic tool
    case 'jpg-to-pdf':
    case 'png-to-pdf':
    case 'heic-to-pdf':
    case 'psd-to-pdf':
    case 'screenshot-to-pdf':
    case 'convert-image-to-pdf':
      return <ImageToPdf toolType="image" />;
    case 'word-to-pdf':
      return <WordToPdf />;
    case 'excel-to-pdf':
      return <ExcelToPdf />;
    case 'txt-to-pdf':
      return <TxtToPdf />;
    case 'csv-to-pdf':
      return <CsvToPdf />;
    case 'svg-to-pdf':
      return <SvgToPdf />;
    case 'epub-to-pdf':
      return <EpubToPdf />;
    case 'assignment-pdf-organizer':
      return <AssignmentOrganizer />;
    case 'powerpoint-to-pdf':
      return <PptToPdf />;
    case 'scan-to-pdf':
    case 'document-scanner':
    case 'receipt-scanner':
      return <ScanToPdf />;

    // ── Convert FROM PDF ─────────────────────────────────────────
    case 'pdf-to-jpg':
      return <PdfToImages outputFormat="jpg" />;
    case 'pdf-to-png':
      return <PdfToImages outputFormat="png" />;
    case 'pdf-to-txt':
    case 'extract-text-from-pdf':
      return <PdfToTxt />;
    case 'pdf-to-word':
    case 'pdf-to-docx':
      return <PdfToWord />;
    case 'pdf-to-excel':
    case 'pdf-to-xlsx':
      return <PdfToExcel format="xlsx" />;
    case 'pdf-to-csv':
      return <PdfToExcel format="csv" />;
    case 'pdf-to-html':
      return <PdfToHtml />;
    case 'pdf-to-rtf':
      return <PdfToTxt format="rtf" />;
    case 'pdf-to-json':
      return <PdfToTxt format="json" />;
    case 'pdf-to-xml':
      return <PdfToTxt format="xml" />;
    case 'pdf-to-epub':
      return <PdfToTxt format="epub" />;
    case 'extract-images-from-pdf':
      return <ExtractImages />;

    // ── Compress / Optimize ───────────────────────────────────────
    case 'extreme-compression':
      return <CompressPDF defaultLevel="strong" />;
    case 'low-compression':
      return <CompressPDF defaultLevel="lossless" />;
    case 'compress-pdf':
    case 'reduce-file-size':
    case 'fast-loading-pdf':
    case 'smart-compression':
    case 'optimize-for-web':
      return <CompressPDF />;
    case 'reduce-resolution':
      return <ReduceResolution />;
    case 'optimize-images':
      return <CompressImages />;

    // ── Organize ──────────────────────────────────────────────────
    case 'merge-pdf':
    case 'combine-multiple-files':
      return <MergePDF />;
    case 'split-pdf':
    case 'extract-pages':
      return <SplitPDF />;
    case 'rotate-pdf':
      return <RotatePDF />;
    case 'delete-pages':
      return <DeletePages />;
    case 'rearrange-pages':
    case 'sort-pages':
      return <RearrangePages />;
    case 'duplicate-pages':
      return <DuplicatePages />;
    case 'insert-blank-page':
      return <InsertBlankPage />;
    case 'replace-page':
      return <ReplacePage />;
    case 'compare-pdfs':
    case 'side-by-side-compare':
      return <ComparePdfs />;

    // ── Edit PDF ──────────────────────────────────────────────────
    case 'edit-pdf':
    case 'draw-/-freehand-annotation':
    case 'draw--freehand-annotation':
    case 'add-shapes':
      return <EditPdf defaultMode="draw" />;
    case 'add-text':
    case 'add-comments':
    case 'sticky-notes':
    case 'edit-existing-text':
      return <EditPdf defaultMode="text" title="Add Text" description="Click anywhere on the PDF to place a text box." />;
    case 'highlight-text':
    case 'pdf-highlighter':
      return <EditPdf defaultMode="highlight" title="Highlight Text" description="Drag over text areas to apply yellow highlight." />;
    case 'underline-text':
      return <EditPdf defaultMode="underline" title="Underline Text" description="Drag across text to draw an underline." />;
    case 'strike-through':
      return <EditPdf defaultMode="strikethrough" title="Strike Through" description="Drag across text to draw a strikethrough line." />;
    case 'add-images-to-pdf':
      return <AddImagesToPdf />;
    case 'add-watermark':
      return <AddWatermark />;
    case 'add-header-footer':
    case 'add-header/footer':
    case 'add-headerfooter':
      return <AddHeaderFooter />;
    case 'add-page-numbers':
      return <AddPageNumbers />;
    case 'crop-pdf':
      return <CropPdf />;
    case 'resize-pdf-pages':
      return <ResizePdfPages />;
    case 'redact-pdf':
    case 'redact-sensitive-data':
    case 'legal-redaction':
      return <RedactPdf />;
    case 'whiteout-text':
      return <RedactPdf fillColor="white" />;
    case 'flatten-pdf':
      return <FlattenPdf />;
    case 'change-background':
      return <ChangeBackground />;
    case 'repair-broken-pdf':
      return <RepairPdf />;
    case 'fill-pdf-forms':
    case 'fill-forms':
    case 'create-fillable-forms':
      return <FillForms />;
    case 'add-hyperlinks':
      return <EditPdf defaultMode="link" title="Add Hyperlinks" description="Drag a box over text or an image, then enter a web address, email or phone number — it becomes a clickable link in any PDF viewer." />;

    // ── Security ──────────────────────────────────────────────────
    case 'protect-pdf':
    case 'add-password':
    case 'encrypt-pdf':
      return <ProtectPdf />;
    case 'unlock-pdf':
    case 'remove-password':
    case 'decrypt-pdf':
      return <UnlockPdf />;
    case 'permission-control':
    case 'restrict-printing':
    case 'restrict-editing':
      return <RestrictPdf />;
    case 'remove-watermark':
      return <RemoveWatermark />;
    case 'remove-metadata':
    case 'file-sanitization':
      return <RemoveMetadata />;

    // ── OCR ───────────────────────────────────────────────────────
    case 'ocr-pdf':
    case 'ocr-image':
    case 'scan-to-text':
    case 'handwriting-recognition':
    case 'multi-language-ocr':
    case 'convert-scanned-pdf-to-editable-pdf':
    case 'id-scanner':
      return <OcrPdf />;

    // ── eSign ─────────────────────────────────────────────────────
    case 'esign-pdf':
    case 'create-signature':
    case 'sign-contract':
    case 'digital-signature':
    case 'add-signature':
    case 'add-initials':
    case 'contract-signing':
    case 'timestamp-signing':
    case 'save-signature':
      return <ESignPdf />;

    // ── Image & Media ─────────────────────────────────────────────
    case 'compress-images':
      return <CompressImages />;
    case 'resize-images':
      return <ResizeImages />;
    case 'convert-heic':
      return <HeicConverter />;
    case 'remove-background':
      return <RemoveBackground />;

    // ── Productivity ──────────────────────────────────────────────
    case 'invoice-generator':
      return <InvoiceGenerator />;
    case 'resume-builder':
      return <ResumeBuilder />;
    case 'document-templates':
      return <FillForms />;
    case 'bulk-merge':
      return <MergePDF />;
    case 'bulk-compress':
      return <CompressPDF />;

    // ── Student ───────────────────────────────────────────────────
    case 'ai-citation-generator': // "Citation Generator" merged into this one
    case 'citation-generator':
      return <CitationGenerator />;

    // ── AI (real implementation) ──────────────────────────────────
    case 'ai-summarize-pdf':
      return <AISummarizePDF />;
    case 'ai-quiz-generator':
    case 'question-extraction':
      return <QuizGenerator />;
    case 'ai-flashcards':
    case 'flashcard-generator':
      return <FlashcardTool />;
    case 'ai-translate-pdf':
      return <AITranslatePDF />;
    case 'ai-resume-scanner':
      return <AIResumeScan />;
    case 'ai-invoice-reader':
    case 'invoice-processing':
      return <AIInvoiceReader />;

    default:
      return <UniversalTool toolId={toolId} />;
  }
}

export default ToolWorkspace;
