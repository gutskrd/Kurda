import { describe, expect, it } from 'vitest';
import { KURDISH_KEYS, insertAtSelection } from './kurdishKeys';

describe('KURDISH_KEYS', () => {
  it('offers the five Kurmanji special letters', () => {
    expect([...KURDISH_KEYS]).toEqual(['ê', 'î', 'û', 'ç', 'ş']);
  });
});

describe('insertAtSelection', () => {
  it('inserts at a collapsed caret', () => {
    expect(insertAtSelection('sv', { start: 1, end: 1 }, 'ê')).toEqual({ text: 'sêv', caret: 2 });
  });

  it('replaces a selected range', () => {
    expect(insertAtSelection('sev', { start: 1, end: 2 }, 'ê')).toEqual({ text: 'sêv', caret: 2 });
  });

  it('appends when the caret is at the end', () => {
    expect(insertAtSelection('av', { start: 2, end: 2 }, 'ê')).toEqual({ text: 'avê', caret: 3 });
  });

  it('clamps an out-of-range selection', () => {
    expect(insertAtSelection('a', { start: 99, end: 99 }, 'ç')).toEqual({ text: 'aç', caret: 2 });
  });
});
