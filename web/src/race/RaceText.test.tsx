import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { compareTyping } from '@kurda/shared';
import { RaceText, splitWords, wordState } from './RaceText';

describe('the race text, word by word', () => {
  it('cuts a text into words, each with the spaces after it', () => {
    expect(splitWords([...'ez ji  wan'])).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 7 },
      { start: 7, end: 10 },
    ]);
    expect(splitWords([])).toEqual([]);
  });

  it('reads a word as wrong, partly typed, forgiven or right', () => {
    expect(wordState(['ok', 'wrong'], false)).toBe('wrong');
    expect(wordState(['ok', 'ok'], true)).toBe('wrong');
    expect(wordState(['pending', 'pending'], false)).toBe('pending');
    expect(wordState(['ok', 'pending'], false)).toBe('partial');
    expect(wordState(['ok', 'accent'], false)).toBe('accent');
    expect(wordState(['ok', 'ok'], false)).toBe('ok');
  });

  it('shows a letter typed twice where it was typed, and the caret after it', () => {
    const text = 'ez ji';
    const { container } = render(
      <RaceText id="t" text={text} comparison={compareTyping(text, 'ezz j')} rtl={false} lang="ku" finished={false} />,
    );
    expect(container.querySelector('.race-extra')?.textContent).toBe('z');
    expect(container.querySelector('.race-cursor')?.textContent).toBe('i');
  });

  it('marks an accent left out as forgiven, not wrong', () => {
    const text = 'bê';
    const { container } = render(
      <RaceText id="t" text={text} comparison={compareTyping(text, 'be', 'forgiving', { backtickShortcut: false })} rtl={false} lang="ku" finished />,
    );
    const chars = container.querySelectorAll('.race-char');
    expect(chars[1]).toHaveClass('race-accent');
    expect(container.querySelector('.race-cursor')).toBeNull();
  });

  it('colours a Soranî text a whole word at a time, so its letters keep their joins', () => {
    const text = 'من کورد';
    const { container } = render(
      <RaceText
        id="t"
        text={text}
        comparison={compareTyping(text, 'من ', 'forgiving', { dialect: 'sorani' })}
        rtl
        lang="ckb"
        finished={false}
      />,
    );
    const p = container.querySelector('p')!;
    expect(p).toHaveAttribute('dir', 'rtl');
    expect(p).toHaveAttribute('lang', 'ckb');
    expect(container.querySelectorAll('.race-char')).toHaveLength(0);
    const words = container.querySelectorAll('.race-word');
    expect(words[0]).toHaveClass('race-word-ok');
    expect(words[1]).toHaveClass('race-word-pending', 'race-cursor-word');
  });
});
