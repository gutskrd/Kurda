import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './markdown';

describe('parseInline', () => {
  it('splits bold and code from plain text', () => {
    expect(parseInline('a **b** c `d`')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' c ' },
      { text: 'd', code: true },
    ]);
  });

  it('leaves unmatched markers as plain text', () => {
    expect(parseInline('a ** b')).toEqual([{ text: 'a ** b' }]);
  });

  it('keeps Kurdish diacritics intact', () => {
    expect(parseInline('**sêv** û **av**')).toEqual([
      { text: 'sêv', bold: true },
      { text: ' û ' },
      { text: 'av', bold: true },
    ]);
  });
});

describe('parseMarkdown', () => {
  it('parses headings, paragraphs, bullets and code', () => {
    const md = `# Cases\n\nKurmanji marks the **oblique** case.\n\n- sêv → sêvê\n- av → avê\n\n\`\`\`\nEz diçim\n\`\`\``;
    const blocks = parseMarkdown(md);
    expect(blocks[0]).toEqual({ type: 'heading', level: 1, spans: [{ text: 'Cases' }] });
    expect(blocks[1]!.type).toBe('paragraph');
    expect(blocks[2]).toMatchObject({ type: 'bullets' });
    expect((blocks[2] as { items: unknown[] }).items).toHaveLength(2);
    expect(blocks[3]).toEqual({ type: 'code', text: 'Ez diçim' });
  });

  it('joins wrapped paragraph lines and separates on blank lines', () => {
    const blocks = parseMarkdown('one\ntwo\n\nthree');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'paragraph', spans: [{ text: 'one two' }] });
  });
});
