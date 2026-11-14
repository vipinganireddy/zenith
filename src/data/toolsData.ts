import {
  FileText, Edit, Type, Square, MessageSquare, Image, Pen, FileSignature, UserCircle, Link,
  Droplet, LayoutTemplate, Hash, Crop, Maximize, Shield, EyeOff, Trash2, FileSearch, Copy,
  FilePlus, GitMerge, Scissors, RotateCw, BarChart, HardDrive, Smartphone, CheckCircle, Lock,
  Globe, Layout, Scan, Box, Database, GraduationCap, Briefcase, Code, Zap,
  Cloud, Eraser, Move, Wrench, Layers, RefreshCcw, Activity, Eye, Search,
  CheckSquare, Minimize2
} from 'lucide-react';

export const categories = [
  { id: 'all', name: 'All Tools' },
  { id: 'ai', name: 'AI Tools' },
  { id: 'edit', name: 'PDF Editing' },
  { id: 'convert-from', name: 'Convert from PDF' },
  { id: 'convert-to', name: 'Convert to PDF' },
  { id: 'organize', name: 'Organize PDF' },
  { id: 'scan-media', name: 'Scan & Media' },
  { id: 'productivity', name: 'Productivity' },
];

export const toolsData = [
  // ── AI TOOLS ──────────────────────────────────────────────────────────────
  { icon: FileText,      name: 'AI Summarize PDF',         desc: 'Get quick summaries of long reports.',                    category: 'ai', color: '#A855F7' },
  { icon: Globe,         name: 'AI Translate PDF',         desc: 'Translate your documents instantly.',                     category: 'ai', color: '#A855F7' },
  { icon: CheckCircle,   name: 'AI Extract Key Points',    desc: 'Automatically pull out main concepts.',                   category: 'ai', color: '#A855F7' },
  { icon: MessageSquare, name: 'AI Generate Notes',        desc: 'Generate comprehensive notes from PDFs.',                 category: 'ai', color: '#A855F7' },
  { icon: FileSearch,    name: 'AI Explain Document',      desc: 'Break down complex concepts simply.',                     category: 'ai', color: '#A855F7' },
  { icon: RefreshCcw,    name: 'AI Rewrite Content',       desc: 'Rewrite and polish existing content.',                    category: 'ai', color: '#A855F7' },
  { icon: Eye,           name: 'AI Simplify Language',     desc: 'Make complex language easier to understand.',             category: 'ai', color: '#A855F7' },
  { icon: Briefcase,     name: 'AI Legal Document Analysis', desc: 'Analyze contracts for loopholes and key terms.',        category: 'ai', color: '#A855F7' },
  { icon: UserCircle,    name: 'AI Resume Scanner',        desc: 'Score resumes against job descriptions.',                 category: 'ai', color: '#A855F7' },
  { icon: FileSignature, name: 'AI Contract Review',       desc: 'Review contracts using AI intelligence.',                 category: 'ai', color: '#A855F7' },
  { icon: FileText,      name: 'AI Invoice Reader',        desc: 'Extract total, items, and tax from invoices.',            category: 'ai', color: '#A855F7' },
  { icon: Database,      name: 'AI Data Extraction',       desc: 'Extract tables and forms into structured data.',          category: 'ai', color: '#A855F7' },
  { icon: Search,        name: 'AI Smart Search',          desc: 'Find exact concepts, not just keywords.',                 category: 'ai', color: '#A855F7' },
  { icon: Layers,        name: 'AI Flashcards',            desc: 'Generate flashcards for learning.',                       category: 'ai', color: '#A855F7' },
  { icon: GraduationCap, name: 'AI Study Assistant',       desc: 'Your personal AI tutor for PDF materials.',               category: 'ai', color: '#A855F7' },
  { icon: CheckSquare,   name: 'AI Quiz Generator',        desc: 'Create quizzes from PDF content automatically.',          category: 'ai', color: '#A855F7' },
  { icon: Link,          name: 'AI Citation Generator',    desc: 'Generate APA/MLA citations instantly.',                   category: 'ai', color: '#A855F7' },
  { icon: FileSearch,    name: 'AI Research Assistant',    desc: 'Cross-reference multiple documents.',                     category: 'ai', color: '#A855F7' },
  { icon: GitMerge,      name: 'AI Compare Documents',     desc: 'Highlight semantic differences.',                         category: 'ai', color: '#A855F7' },
  { icon: Shield,        name: 'AI Detect Errors',         desc: 'Find typos, inconsistencies, and logical errors.',        category: 'ai', color: '#A855F7' },
  { icon: Layout,        name: 'AI Auto Categorization',   desc: 'Sort documents automatically by type.',                   category: 'ai', color: '#A855F7' },
  { icon: Activity,      name: 'AI Insights Dashboard',    desc: 'Visualize document trends and data.',                     category: 'ai', color: '#A855F7' },

  // ── PDF EDITING ───────────────────────────────────────────────────────────
  { icon: Edit,          name: 'Edit PDF',                 desc: 'Add text, shapes, and freehand annotations.',             category: 'edit', color: '#3B82F6' },
  { icon: Type,          name: 'Add Text',                 desc: 'Insert new text blocks anywhere.',                        category: 'edit', color: '#3B82F6' },
  { icon: Type,          name: 'Highlight Text',           desc: 'Highlight important text sections.',                      category: 'edit', color: '#3B82F6' },
  { icon: Type,          name: 'Underline Text',           desc: 'Underline essential content.',                            category: 'edit', color: '#3B82F6' },
  { icon: Type,          name: 'Strike Through',           desc: 'Strike out incorrect information.',                       category: 'edit', color: '#3B82F6' },
  { icon: Image,         name: 'Add Images to PDF',        desc: 'Insert JPG, PNG, and SVG images.',                        category: 'edit', color: '#3B82F6' },
  { icon: FileSignature, name: 'Add Signature',            desc: 'Sign your document digitally.',                           category: 'edit', color: '#3B82F6' },
  { icon: Pen,           name: 'Add Initials',             desc: 'Quickly initial pages.',                                  category: 'edit', color: '#3B82F6' },
  { icon: LayoutTemplate,name: 'Fill PDF Forms',           desc: 'Easily fill interactive PDF forms.',                      category: 'edit', color: '#3B82F6' },
  { icon: Link,          name: 'Add Hyperlinks',           desc: 'Link to external websites or pages.',                     category: 'edit', color: '#3B82F6' },
  { icon: Droplet,       name: 'Add Watermark',            desc: 'Stamp a watermark across your document.',                 category: 'edit', color: '#3B82F6' },
  { icon: Eraser,        name: 'Remove Watermark',         desc: 'Remove watermarks added by PDF tools.',                   category: 'edit', color: '#3B82F6' },
  { icon: Layout,        name: 'Add Header/Footer',        desc: 'Insert consistent headers and footers.',                  category: 'edit', color: '#3B82F6' },
  { icon: Hash,          name: 'Add Page Numbers',         desc: 'Number your pages automatically.',                        category: 'edit', color: '#3B82F6' },
  { icon: Crop,          name: 'Crop PDF',                 desc: 'Trim white margins or focus on content.',                 category: 'edit', color: '#3B82F6' },
  { icon: Maximize,      name: 'Resize PDF Pages',         desc: 'Change page dimensions (A4, Letter, etc).',               category: 'edit', color: '#3B82F6' },
  { icon: Square,        name: 'Whiteout Text',            desc: 'Cover text with a white box.',                            category: 'edit', color: '#3B82F6' },
  { icon: Image,         name: 'Change Background',        desc: 'Add a new background color or image.',                    category: 'edit', color: '#3B82F6' },
  { icon: Layers,        name: 'Flatten PDF',              desc: 'Merge annotations into a single layer.',                  category: 'edit', color: '#3B82F6' },
  { icon: Wrench,        name: 'Repair Broken PDF',        desc: 'Fix corrupted PDF files.',                                category: 'edit', color: '#3B82F6' },

  // ── CONVERT FROM PDF ─────────────────────────────────────────────────────
  { icon: FileText,      name: 'PDF to Word',             desc: 'Convert to editable DOCX.',                              category: 'convert-from', color: '#06B6D4' },
  { icon: BarChart,      name: 'PDF to Excel',            desc: 'Convert tables to XLSX.',                                category: 'convert-from', color: '#06B6D4' },
  { icon: Image,         name: 'PDF to JPG',              desc: 'Extract pages as JPG images.',                           category: 'convert-from', color: '#06B6D4' },
  { icon: Image,         name: 'PDF to PNG',              desc: 'Extract pages as PNG images with transparency.',          category: 'convert-from', color: '#06B6D4' },
  { icon: Code,          name: 'PDF to HTML',             desc: 'Convert PDF to web-ready HTML.',                         category: 'convert-from', color: '#06B6D4' },
  { icon: FileText,      name: 'PDF to TXT',              desc: 'Extract plain text from document.',                      category: 'convert-from', color: '#06B6D4' },
  { icon: FileText,      name: 'PDF to EPUB',             desc: 'Convert to eBook format.',                               category: 'convert-from', color: '#06B6D4' },
  { icon: Database,      name: 'PDF to CSV',              desc: 'Extract tabular data into CSV.',                         category: 'convert-from', color: '#06B6D4' },
  { icon: FileText,      name: 'PDF to RTF',              desc: 'Convert to Rich Text Format.',                           category: 'convert-from', color: '#06B6D4' },
  { icon: Code,          name: 'PDF to JSON',             desc: 'Structure PDF content into JSON.',                       category: 'convert-from', color: '#06B6D4' },
  { icon: Code,          name: 'PDF to XML',              desc: 'Convert data into XML format.',                          category: 'convert-from', color: '#06B6D4' },

  // ── CONVERT TO PDF ───────────────────────────────────────────────────────
  { icon: FileText,      name: 'Word to PDF',             desc: 'Convert DOCX to PDF format.',                            category: 'convert-to', color: '#F59E0B' },
  { icon: BarChart,      name: 'Excel to PDF',            desc: 'Convert XLSX to PDF format.',                            category: 'convert-to', color: '#F59E0B' },
  { icon: LayoutTemplate,name: 'PowerPoint to PDF',       desc: 'Convert PPTX to PDF format.',                            category: 'convert-to', color: '#F59E0B' },
  { icon: Image,         name: 'Image to PDF',            desc: 'Turn JPG, PNG, or screenshots into a PDF document.',     category: 'convert-to', color: '#F59E0B' },
  { icon: Code,          name: 'HTML to PDF',             desc: 'Convert web pages to PDF format.',                       category: 'convert-to', color: '#F59E0B' },
  { icon: FileText,      name: 'TXT to PDF',              desc: 'Convert plain text to PDF document.',                    category: 'convert-to', color: '#F59E0B' },
  { icon: FileText,      name: 'EPUB to PDF',             desc: 'Convert eBooks to PDF format.',                          category: 'convert-to', color: '#F59E0B' },
  { icon: Database,      name: 'CSV to PDF',              desc: 'Convert CSV data to PDF format.',                        category: 'convert-to', color: '#F59E0B' },
  { icon: Image,         name: 'SVG to PDF',              desc: 'Convert vector graphics to PDF.',                        category: 'convert-to', color: '#F59E0B' },

  // ── ORGANIZE PDF ─────────────────────────────────────────────────────────
  { icon: GitMerge,      name: 'Merge PDF',               desc: 'Combine multiple PDFs into one.',                        category: 'organize', color: '#10B981' },
  { icon: Scissors,      name: 'Split PDF',               desc: 'Extract pages or split into multiple files.',            category: 'organize', color: '#10B981' },
  { icon: Trash2,        name: 'Delete Pages',            desc: 'Remove unwanted pages from document.',                   category: 'organize', color: '#10B981' },
  { icon: Move,          name: 'Rearrange Pages',         desc: 'Drag and drop to reorder pages.',                        category: 'organize', color: '#10B981' },
  { icon: RotateCw,      name: 'Rotate PDF',              desc: 'Rotate pages that are upside down.',                     category: 'organize', color: '#10B981' },
  { icon: Copy,          name: 'Duplicate Pages',         desc: 'Clone specific pages within the document.',              category: 'organize', color: '#10B981' },
  { icon: FilePlus,      name: 'Insert Blank Page',       desc: 'Add empty pages between content.',                       category: 'organize', color: '#10B981' },
  { icon: RefreshCcw,    name: 'Replace Page',            desc: 'Swap a page with a new one.',                            category: 'organize', color: '#10B981' },
  { icon: Eye,           name: 'Compare PDFs',            desc: 'Find differences between two versions.',                 category: 'organize', color: '#10B981' },

  // ── COMPRESSION ──────────────────────────────────────────────────────────
  { icon: HardDrive,     name: 'Compress PDF',            desc: 'Reduce file size efficiently.',                          category: 'productivity', color: '#8B5CF6' },
  { icon: EyeOff,        name: 'Remove Metadata',         desc: 'Strip author and creation data.',                        category: 'productivity', color: '#8B5CF6' },
  { icon: Minimize2,     name: 'Reduce Resolution',       desc: 'Lower DPI for screens.',                                 category: 'productivity', color: '#8B5CF6' },

  // ── OCR & SCAN ───────────────────────────────────────────────────────────
  { icon: Scan,          name: 'OCR PDF',                 desc: 'Make text searchable and selectable.',                   category: 'scan-media', color: '#6366F1' },
  { icon: Scan,          name: 'OCR Image',               desc: 'Extract text from scanned images.',                      category: 'scan-media', color: '#6366F1' },
  { icon: Smartphone,    name: 'Scan to PDF',             desc: 'Use device camera to digitize documents.',               category: 'scan-media', color: '#6366F1' },
  { icon: Edit,          name: 'Convert Scanned PDF to Editable PDF', desc: 'Full scan-to-editable-doc conversion.', category: 'scan-media', color: '#6366F1' },

  // ── SECURITY ─────────────────────────────────────────────────────────────
  { icon: Shield,        name: 'Protect PDF',             desc: 'Encrypt with AES-256 password protection.',              category: 'productivity', color: '#8B5CF6' },
  { icon: Lock,          name: 'Remove Password',         desc: 'Strip existing password protections.',                   category: 'productivity', color: '#8B5CF6' },
  { icon: Lock,          name: 'Permission Control',      desc: 'Control who can view, edit, or print.',                  category: 'productivity', color: '#8B5CF6' },

  // ── SIGN & ESIGN ─────────────────────────────────────────────────────────
  { icon: FileSignature, name: 'eSign PDF',               desc: 'Add electronic signatures legally.',                     category: 'productivity', color: '#8B5CF6' },

  // ── PRODUCTIVITY ─────────────────────────────────────────────────────────
  { icon: FileText,      name: 'Invoice Generator',       desc: 'Create professional invoices instantly.',                category: 'productivity', color: '#8B5CF6' },
  { icon: Briefcase,     name: 'Resume Builder',          desc: 'Craft ATS-friendly resumes.',                            category: 'productivity', color: '#8B5CF6' },
  { icon: RefreshCcw,    name: 'Auto Naming',             desc: 'Use AI to name files based on content.',                 category: 'productivity', color: '#8B5CF6' },

  // ── IMAGE & MEDIA ─────────────────────────────────────────────────────────
  { icon: Image,         name: 'Extract Images from PDF', desc: 'Pull out embedded graphics.',                            category: 'scan-media', color: '#6366F1' },
  { icon: HardDrive,     name: 'Compress Images',         desc: 'Optimize image payload inside PDFs.',                    category: 'scan-media', color: '#6366F1' },
  { icon: Maximize,      name: 'Resize Images',           desc: 'Adjust dimensions of pictures.',                         category: 'scan-media', color: '#6366F1' },
  { icon: Image,         name: 'Remove Background',       desc: 'Make plain image backgrounds transparent.',              category: 'scan-media', color: '#6366F1' },

  // ── CLOUD & COLLABORATION ─────────────────────────────────────────────────
  { icon: Cloud,         name: 'Google Drive Integration',desc: 'Save & sync files with Google Drive.',                   category: 'productivity', color: '#8B5CF6' },

  // ── DEVELOPER TOOLS ───────────────────────────────────────────────────────

  // ── (merged into AI & Organize) ───────────────────────────────────────────
  { icon: FileText,      name: 'PDF Notes Generator',     desc: 'Turn syllabi into study guides.',                        category: 'ai',       color: '#A855F7' },
  { icon: Zap,           name: 'AI Study Summary',        desc: 'Quick chapter summaries for exam prep.',                 category: 'ai',       color: '#A855F7' },
  { icon: Box,           name: 'Assignment PDF Organizer',desc: 'Keep track of semesters and courses.',                   category: 'organize', color: '#10B981' },

  // ── BUSINESS / LEGAL ──────────────────────────────────────────────────────
  { icon: FileSignature, name: 'Contract Signing',        desc: 'Legally binding e-signatures.',                          category: 'productivity', color: '#8B5CF6' },
  { icon: EyeOff,        name: 'Legal Redaction',         desc: 'Comply with discovery requirements.',                    category: 'productivity', color: '#8B5CF6' },
];

// ── Derived counts ───────────────────────────────────────────────────────────
// Every "N tools" claim on the site reads from here. They were hard-coded per
// page and had drifted: PDF Editing advertised 21 (really 20), Convert to PDF
// 11 (9), Organize 11 (10), Scan & Media 9 (8), and the free tier "43 tools"
// (40). Computing them means adding or removing a tool updates the whole site.

export const toolCountByCategory: Record<string, number> = toolsData.reduce(
  (acc, t) => { acc[t.category] = (acc[t.category] || 0) + 1; return acc; },
  {} as Record<string, number>,
);

export const TOTAL_TOOLS = toolsData.length;

/** Category id -> display name, from the `categories` list above. */
export const categoryName = (id: string): string =>
  categories.find(c => c.id === id)?.name ?? id;

/** How many tools a given set of category ids covers (used for the free tier). */
export const countTools = (categoryIds: Iterable<string>): number =>
  [...categoryIds].reduce((n, id) => n + (toolCountByCategory[id] || 0), 0);
