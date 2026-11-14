import React from 'react';

interface Props { content: string; style?: React.CSSProperties; }

function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // bold+italic, bold, italic, inline code
  const regex = /(\*\*\*(.*?)\*\*\*|\*\*(.*?)\*\*|\*(.*?)\*|`(.*?)`)/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2]) nodes.push(<strong key={m.index}><em>{m[2]}</em></strong>);
    else if (m[3]) nodes.push(<strong key={m.index}>{m[3]}</strong>);
    else if (m[4]) nodes.push(<em key={m.index}>{m[4]}</em>);
    else if (m[5]) nodes.push(<code key={m.index} style={{ background: 'var(--primary-subtle)', borderRadius: '8px', padding: '1px 4px', fontFamily: 'monospace', fontSize: '0.9em' }}>{m[5]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const MarkdownRenderer: React.FC<Props> = ({ content, style }) => {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let listBuffer: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!listBuffer) return;
    const { ordered, items } = listBuffer;
    if (ordered) {
      elements.push(
        <ol key={`ol-${i}`} style={{ paddingLeft: '22px', marginBottom: '10px', lineHeight: 1.7 }}>
          {items.map((it, idx) => <li key={idx} style={{ marginBottom: '3px' }}>{parseInline(it)}</li>)}
        </ol>
      );
    } else {
      elements.push(
        <ul key={`ul-${i}`} style={{ paddingLeft: '20px', marginBottom: '10px', lineHeight: 1.7, listStyle: 'disc' }}>
          {items.map((it, idx) => <li key={idx} style={{ marginBottom: '3px' }}>{parseInline(it)}</li>)}
        </ul>
      );
    }
    listBuffer = null;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Headings
    const h3 = trimmed.match(/^###\s+(.*)/);
    const h2 = trimmed.match(/^##\s+(.*)/);
    const h1 = trimmed.match(/^#\s+(.*)/);
    if (h1 || h2 || h3) {
      flushList();
      const text = (h1 ?? h2 ?? h3)![1];
      const level = h1 ? 1 : h2 ? 2 : 3;
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
      const sizes = { h1: '20px', h2: '17px', h3: '15px' };
      const margins = { h1: '20px 0 8px', h2: '16px 0 6px', h3: '14px 0 4px' };
      elements.push(
        <Tag key={`h-${i}`} style={{ fontSize: sizes[Tag], fontWeight: 700, margin: margins[Tag], color: 'var(--text-main)', borderBottom: level === 1 ? '1px solid var(--border-color)' : 'none', paddingBottom: level === 1 ? '6px' : 0 }}>
          {parseInline(text)}
        </Tag>
      );
      i++; continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      elements.push(<hr key={`hr-${i}`} style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '14px 0' }} />);
      i++; continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      flushList();
      elements.push(
        <blockquote key={`bq-${i}`} style={{ borderLeft: '2px solid var(--border-color)', paddingLeft: '12px', margin: '8px 0', color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '14px' }}>
          {parseInline(trimmed.slice(2))}
        </blockquote>
      );
      i++; continue;
    }

    // Ordered list
    const ordMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (ordMatch) {
      if (listBuffer && !listBuffer.ordered) flushList();
      if (!listBuffer) listBuffer = { ordered: true, items: [] };
      listBuffer.items.push(ordMatch[2]);
      i++; continue;
    }

    // Unordered list (-, *, •)
    const unordMatch = trimmed.match(/^[-*•]\s+(.*)/);
    if (unordMatch) {
      if (listBuffer && listBuffer.ordered) flushList();
      if (!listBuffer) listBuffer = { ordered: false, items: [] };
      listBuffer.items.push(unordMatch[1]);
      i++; continue;
    }

    // Blank line
    if (!trimmed) {
      flushList();
      elements.push(<div key={`br-${i}`} style={{ height: '6px' }} />);
      i++; continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} style={{ margin: '0 0 8px', lineHeight: 1.75, color: 'var(--text-main)' }}>
        {parseInline(trimmed)}
      </p>
    );
    i++;
  }
  flushList();

  return (
    <div style={{ fontSize: '14px', color: 'var(--text-main)', ...style }}>
      {elements}
    </div>
  );
};

export default MarkdownRenderer;
