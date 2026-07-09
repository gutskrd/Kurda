/**
 * Tiny, dependency-free markdown parser for grammar notes (KUR-038).
 * Supports headings (#..###), paragraphs, bullet lists (- / *), fenced code
 * blocks (```), and inline **bold** / `code`. Pure, so it's unit-testable;
 * the renderer uses the system font so Kurdish diacritics never tofu.
 */

export interface Span {
  text: string;
  bold?: boolean;
  code?: boolean;
}

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; spans: Span[] }
  | { type: 'paragraph'; spans: Span[] }
  | { type: 'bullets'; items: Span[][] }
  | { type: 'code'; text: string };

/** Parse inline **bold** and `code` into styled spans. */
export function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  let i = 0;
  let plain = '';
  const flush = () => {
    if (plain) spans.push({ text: plain });
    plain = '';
  };
  while (i < text.length) {
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      if (end !== -1) {
        flush();
        spans.push({ text: text.slice(i + 2, end), bold: true });
        i = end + 2;
        continue;
      }
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        flush();
        spans.push({ text: text.slice(i + 1, end), code: true });
        i = end + 1;
        continue;
      }
    }
    plain += text[i];
    i += 1;
  }
  flush();
  return spans;
}

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let bullets: Span[][] | null = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'paragraph', spans: parseInline(para.join(' ')) });
      para = [];
    }
  };
  const flushBullets = () => {
    if (bullets) {
      blocks.push({ type: 'bullets', items: bullets });
      bullets = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushPara();
      flushBullets();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) code.push(lines[i++]!);
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushPara();
      flushBullets();
      blocks.push({
        type: 'heading',
        level: heading[1]!.length as 1 | 2 | 3,
        spans: parseInline(heading[2]!),
      });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushPara();
      bullets ??= [];
      bullets.push(parseInline(bullet[1]!));
      continue;
    }

    if (trimmed === '') {
      flushPara();
      flushBullets();
      continue;
    }

    flushBullets();
    para.push(trimmed);
  }
  flushPara();
  flushBullets();
  return blocks;
}
