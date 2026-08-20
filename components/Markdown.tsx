import React from 'react';

/**
 * Rendu Markdown minimal, suffisant pour les comptes rendus produits par
 * `lib/report.ts` (titres, listes, tableaux, gras, code, citations).
 * Aucun HTML brut n'est interprete : le contenu vient d'une transcription,
 * il ne doit jamais pouvoir injecter de balises.
 */

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith('**')) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    else nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const lines = (source || '').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  const flushList = (ordered: boolean) => {
    const items: string[] = [];
    while (i < lines.length) {
      const m = lines[i].match(ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/);
      if (!m) break;
      items.push(m[1]);
      i++;
      // lignes de continuation indentees
      while (i < lines.length && /^\s{3,}[-*]?\s*\S/.test(lines[i]) && !/^\s*[-*\d]/.test(lines[i].trimStart())) {
        items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
    }
    const Tag = ordered ? 'ol' : 'ul';
    blocks.push(
      React.createElement(
        Tag,
        { key: `l${blocks.length}` },
        items.map((it, k) => <li key={k}>{inline(it, `li${blocks.length}-${k}`)}</li>),
      ),
    );
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const Tag = `h${Math.min(level, 4)}` as 'h1' | 'h2' | 'h3' | 'h4';
      blocks.push(React.createElement(Tag, { key: `h${blocks.length}` }, inline(heading[2], `h${blocks.length}`)));
      i++;
      continue;
    }

    if (/^\s*(---|___|\*\*\*)\s*$/.test(line)) {
      blocks.push(<hr key={`hr${blocks.length}`} />);
      i++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push(<blockquote key={`q${blocks.length}`}>{inline(quote.join(' '), `q${blocks.length}`)}</blockquote>);
      continue;
    }

    // tableau : ligne d'en-tete + separateur |---|
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]*\|[\s:|-]*$/.test(lines[i + 1])) {
      const parse = (l: string) =>
        l
          .replace(/^\s*\|/, '')
          .replace(/\|\s*$/, '')
          .split('|')
          .map((c) => c.trim());
      const header = parse(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(parse(lines[i]));
        i++;
      }
      const hasHeader = header.some((h) => h.length > 0);
      blocks.push(
        <table key={`t${blocks.length}`}>
          {hasHeader && (
            <thead>
              <tr>
                {header.map((h, k) => (
                  <th key={k}>{inline(h, `th${k}`)}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci}>{inline(c, `td${ri}-${ci}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flushList(false);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      flushList(true);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*([-*]\s|\d+\.\s|#{1,4}\s|>|\|)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(' '), `p${blocks.length}`)}</p>);
  }

  return <div className={`prose-report ${className}`}>{blocks}</div>;
}
