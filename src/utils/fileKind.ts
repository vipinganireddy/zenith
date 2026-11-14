/* What kind of preview a library file gets in the Files viewer, decided by
   extension first (MIME types are often missing or generic on mobile), then MIME. */

export type PreviewKind =
  | 'pdf' | 'image' | 'heic' | 'video' | 'audio'
  | 'docx' | 'pptx' | 'sheet' | 'csv'
  | 'markdown' | 'json' | 'html' | 'text'
  | 'zip' | 'none';

const EXT: Record<string, PreviewKind> = {
  pdf: 'pdf',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', avif: 'image', bmp: 'image',
  svg: 'image', ico: 'image', tif: 'image', tiff: 'image',
  heic: 'heic', heif: 'heic',
  mp4: 'video', m4v: 'video', mov: 'video', webm: 'video', ogv: 'video',
  mp3: 'audio', m4a: 'audio', aac: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', flac: 'audio', opus: 'audio',
  docx: 'docx', docm: 'docx', dotx: 'docx',
  pptx: 'pptx', ppsx: 'pptx',
  xlsx: 'sheet', xlsm: 'sheet', xls: 'sheet', ods: 'sheet', numbers: 'none',
  csv: 'csv', tsv: 'csv',
  md: 'markdown', markdown: 'markdown',
  json: 'json', geojson: 'json',
  html: 'html', htm: 'html',
  txt: 'text', log: 'text', xml: 'text', yml: 'text', yaml: 'text', ini: 'text', cfg: 'text', conf: 'text',
  rtf: 'text', tex: 'text', srt: 'text', vtt: 'text',
  js: 'text', mjs: 'text', ts: 'text', tsx: 'text', jsx: 'text', css: 'text', scss: 'text',
  py: 'text', java: 'text', kt: 'text', swift: 'text', c: 'text', h: 'text', cpp: 'text', cs: 'text',
  go: 'text', rs: 'text', rb: 'text', php: 'text', sh: 'text', sql: 'text',
  zip: 'zip', epub: 'zip', jar: 'zip',
};

export const extensionOf = (name: string) => (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();

export function previewKind(name: string, mime = ''): PreviewKind {
  const byExt = EXT[extensionOf(name)];
  if (byExt) return byExt;
  const m = mime.toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (/^image\/hei[cf]/.test(m)) return 'heic';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m.includes('wordprocessingml')) return 'docx';
  if (m.includes('presentationml')) return 'pptx';
  if (m.includes('spreadsheetml') || m.includes('ms-excel') || m.includes('opendocument.spreadsheet')) return 'sheet';
  if (m === 'text/csv' || m === 'text/tab-separated-values') return 'csv';
  if (m === 'text/markdown') return 'markdown';
  if (m.includes('json')) return 'json';
  if (m === 'text/html') return 'html';
  if (m.startsWith('text/') || m.includes('xml')) return 'text';
  if (m.includes('zip')) return 'zip';
  return 'none';
}
