/**
 * The press's way with text (sheet.ts): a paragraph broken into lines by
 * rule. A no-break space holds an option's letter to its option and an
 * answer's number to its answer; an en or em space keeps its width and still
 * breaks; a paragraph cut short ends on an ellipsis that is measured with
 * its line; a balanced paragraph evens out its lines; and the file names its
 * author.
 */
import { describe, expect, it } from 'vitest';
import { Press, type Line, type Type } from './sheet.js';

const press = new Press('a test of the press');
const type: Type = { font: 'body', size: 8, color: '#000000', lead: 10 };
/** A line as it reads: its runs, a space between two that do not run on. */
const read = (line: Line): string => line.runs.map((r) => r.text).join(' ');

describe('the press', () => {
  it('holds what a no-break space joins on one line, and sets it as a plain space', () => {
    const options = 'a\u00a0Ji Kobaniyê\u2003b\u00a0Ji Sêvanê\u2003c\u00a0Ji Amedê';
    for (let width = 30; width <= 260; width += 2) {
      const lines = press.wrap(options, width, type);
      for (const line of lines) {
        // a letter never ends a line without its option
        expect(read(line), `${width}`).not.toMatch(/(^|\s)[abc]$/);
        for (const run of line.runs) expect(run.text).not.toContain('\u00a0');
      }
      expect(lines.map(read).join(' ').replace(/\s+/g, ' ')).toBe('a Ji Kobaniyê b Ji Sêvanê c Ji Amedê');
    }
    // where the letter and its first word would not fit the line together, they go down together
    const tight = press.wrap('one two three four a\u00a0five', press.measure('one two three four a', type.font, type.size) + 1, type);
    expect(tight.map(read)).toEqual(['one two three four', 'a five']);
  });

  it('keeps an en or em space at its width within a line, and breaks there as at any space', () => {
    const [line] = press.wrap('one\u2003two', 200, type);
    expect(line!.runs.map((r) => r.text)).toEqual(['one', 'two']);
    // the word after an em space starts a size of the type away, and not one space's width
    expect(line!.runs[1]!.x).toBeCloseTo(press.measure('one', type.font, type.size) + type.size, 6);
    expect(line!.width).toBeCloseTo(press.measure('one', type.font, type.size) + type.size + press.measure('two', type.font, type.size), 6);
    const en = press.wrap('one\u2002two', 200, type)[0]!;
    expect(en.runs[1]!.x).toBeCloseTo(press.measure('one', type.font, type.size) + type.size / 2, 6);
    // and a line breaks there, the next starting at its left edge
    const narrow = press.wrap('one\u2003two', press.measure('one', type.font, type.size) + 4, type);
    expect(narrow.map(read)).toEqual(['one', 'two']);
    expect(narrow[1]!.runs[0]!.x).toBe(0);
    // a run of ordinary spaces is one space, as it always was
    expect(press.wrap('one   two', 200, type)[0]!.width).toBeCloseTo(press.wrap('one two', 200, type)[0]!.width, 6);
  });

  it('ends a paragraph cut short on an ellipsis that is measured with its line', () => {
    const text = 'Kanûna Pêşîn the twelfth month of the year, when the snow is deep in the mountains';
    for (const width of [40, 61, 80, 97, 120]) {
      const [line] = press.wrap(text, width, type, 1);
      expect(read(line!)).toMatch(/…$/);
      expect(line!.width).toBeLessThanOrEqual(width + 0.01);
      // the width the press gives is the width the line is set at, ellipsis and all
      expect(line!.width).toBeCloseTo(press.measure(read(line!), type.font, type.size), 6);
    }
    // a paragraph that fits is never given one
    expect(press.wrap('short', 100, type, 1).map(read)).toEqual(['short']);
  });

  it('evens out the lines of a balanced paragraph, keeping how many there are', () => {
    const said = 'Hêvî zaroka duyem e, lê diyariya yekem dixwaze!';
    const say: Type = { font: 'semi', size: 8.4, color: '#000000', lead: 10.6 };
    const width = press.measure('Hêvî zaroka duyem e, lê diyariya yekem', say.font, say.size) + 2;
    const filled = press.wrap(said, width, say, 3);
    const even = press.wrap(said, width, say, 3, true);
    // filled to the measure, the last line is one word; balanced, it is not, and the lines are no more
    expect(filled.map(read).at(-1)).toBe('dixwaze!');
    expect(even).toHaveLength(filled.length);
    expect(read(even.at(-1)!).split(' ').length).toBeGreaterThan(1);
    const spread = (lines: Line[]): number => Math.max(...lines.map((l) => l.width)) - Math.min(...lines.map((l) => l.width));
    expect(spread(even)).toBeLessThan(spread(filled));
    for (const line of even) expect(line.width).toBeLessThanOrEqual(width + 0.01);
    expect(even.map(read).join(' ')).toBe(said);
    // a line that fits is left as it is
    expect(press.wrap('Na, spas.', width, say, 3, true).map(read)).toEqual(['Na, spas.']);
  });

  it('names the book’s author in the file’s details, and Hevalo where it is not given', () => {
    const info = (p: Press): unknown => (p.doc as unknown as { info: { Author?: string } }).info.Author;
    expect(info(new Press('a book', 'The Author'))).toBe('The Author');
    expect(info(new Press('a book'))).toBe('Hevalo');
  });
});
