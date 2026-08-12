import React from 'react';

/**
 * A lightweight helper component to render basic markdown structures beautifully.
 */
export default function MarkdownText({ text = '' }) {
  if (!text) return null;

  // Split lines to identify block-level structures
  const lines = text.split('\n');

  let insideCodeBlock = false;
  let codeBlockLines = [];

  const elements = lines.map((line, idx) => {
    // 1. Code Block detection
    if (line.trim().startsWith('```')) {
      if (insideCodeBlock) {
        insideCodeBlock = false;
        const codeContent = codeBlockLines.join('\n');
        codeBlockLines = [];
        return (
          <pre key={idx} className="my-3 p-3 bg-black/60 border border-blue-900/40 rounded-xl font-mono text-xs overflow-x-auto text-cyan-300">
            <code>{codeContent}</code>
          </pre>
        );
      } else {
        insideCodeBlock = true;
        return null;
      }
    }

    if (insideCodeBlock) {
      codeBlockLines.push(line);
      return null;
    }

    // 2. Headings
    if (line.startsWith('### ')) {
      return (
        <h4 key={idx} className="text-sm font-bold font-mono text-cyan-400 mt-3 mb-1.5 uppercase tracking-wider">
          {parseInline(line.slice(4))}
        </h4>
      );
    }
    if (line.startsWith('## ')) {
      return (
        <h3 key={idx} className="text-base font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400 mt-4 mb-2 uppercase tracking-widest">
          {parseInline(line.slice(3))}
        </h3>
      );
    }
    if (line.startsWith('# ')) {
      return (
        <h2 key={idx} className="text-lg font-black font-mono text-white mt-5 mb-3 uppercase tracking-widest border-b border-blue-900/30 pb-1">
          {parseInline(line.slice(2))}
        </h2>
      );
    }

    // 3. Lists
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const content = line.trim().substring(2);
      return (
        <ul key={idx} className="list-disc pl-5 my-1.5 space-y-1">
          <li className="text-slate-300 text-sm leading-relaxed">{parseInline(content)}</li>
        </ul>
      );
    }

    // 4. Empty line
    if (line.trim() === '') {
      return <div key={idx} className="h-2" />;
    }

    // 5. Default paragraph
    return (
      <p key={idx} className="text-sm leading-relaxed text-slate-200 my-1">
        {parseInline(line)}
      </p>
    );
  });

  return <div className="space-y-1.5">{elements.filter(Boolean)}</div>;
}

/**
 * Regex-based inline styles processor (bold, italics, inline code)
 */
function parseInline(text) {
  let parts = [text];

  // Inline Code `code`
  parts = parts.flatMap((part) => {
    if (typeof part !== 'string') return part;
    const pieces = part.split(/(`[^`]+`)/g);
    return pieces.map((piece, i) => {
      if (piece.startsWith('`') && piece.endsWith('`')) {
        return <code key={i} className="px-1.5 py-0.5 bg-black/40 rounded border border-blue-950 text-emerald-400 font-mono text-xs">{piece.slice(1, -1)}</code>;
      }
      return piece;
    });
  });

  // Bold **text**
  parts = parts.flatMap((part) => {
    if (typeof part !== 'string') return part;
    const pieces = part.split(/(\*\*[^*]+\*\*)/g);
    return pieces.map((piece, i) => {
      if (piece.startsWith('**') && piece.endsWith('**')) {
        return <strong key={i} className="text-white font-extrabold">{piece.slice(2, -2)}</strong>;
      }
      return piece;
    });
  });

  // Italic *text*
  parts = parts.flatMap((part) => {
    if (typeof part !== 'string') return part;
    const pieces = part.split(/(\*[^*]+\*)/g);
    return pieces.map((piece, i) => {
      if (piece.startsWith('*') && piece.endsWith('*') && !piece.startsWith('**')) {
        return <em key={i} className="text-slate-300 italic">{piece.slice(1, -1)}</em>;
      }
      return piece;
    });
  });

  return parts;
}
