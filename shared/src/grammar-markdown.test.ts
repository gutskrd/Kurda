import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './grammar-markdown.js';

describe('parseInline', () => {
  it('splits bold and code from plain text, and leaves an unclosed marker alone', () => {
    expect(parseInline('a **b** c `d`')).toEqual([{ text: 'a ' }, { text: 'b', bold: true }, { text: ' c ' }, { text: 'd', code: true }]);
    expect(parseInline('a ** b')).toEqual([{ text: 'a ** b' }]);
  });

  it('keeps Kurdish letters intact', () => {
    expect(parseInline('**sêv** û **av**')).toEqual([{ text: 'sêv', bold: true }, { text: ' û ' }, { text: 'av', bold: true }]);
  });
});

describe('parseMarkdown', () => {
  it('reads a seeded grammar note as headings, paragraphs and bullets', () => {
    const md = '# Silavkirin\n\nKurmanji greetings are simple:\n\n- **Silav** — hello\n- **Spas** — thank you';
    expect(parseMarkdown(md)).toEqual([
      { type: 'heading', level: 1, spans: [{ text: 'Silavkirin' }] },
      { type: 'paragraph', spans: [{ text: 'Kurmanji greetings are simple:' }] },
      {
        type: 'bullets',
        items: [
          [{ text: 'Silav', bold: true }, { text: ' — hello' }],
          [{ text: 'Spas', bold: true }, { text: ' — thank you' }],
        ],
      },
    ]);
  });

  it('keeps a fenced block as written, and never reads markup as anything but text', () => {
    expect(parseMarkdown('```\nEz diçim\n```')).toEqual([{ type: 'code', text: 'Ez diçim' }]);
    expect(parseMarkdown('<img src=x onerror=alert(1)>')).toEqual([
      { type: 'paragraph', spans: [{ text: '<img src=x onerror=alert(1)>' }] },
    ]);
  });
});
