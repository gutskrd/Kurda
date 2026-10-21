import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useWordleKeys, wordleKeyFrom, type WordleKeyEvent } from './wordleKeys';

function press(key: string, extra: Partial<WordleKeyEvent> = {}): WordleKeyEvent {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    repeat: false,
    keyCode: 0,
    target: document.body,
    ...extra,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('which physical keys Peyvok takes', () => {
  it('takes plain letters, and the Kurdish ones however they were typed', () => {
    expect(wordleKeyFrom(press('a'))).toBe('a');
    expect(wordleKeyFrom(press('Ş'))).toBe('ş');
    // a Mac's Option+c, AltGr on Windows (Ctrl+Alt to the browser)
    expect(wordleKeyFrom(press('ç', { altKey: true }))).toBe('ç');
    expect(wordleKeyFrom(press('ê', { ctrlKey: true, altKey: true }))).toBe('ê');
    // a Turkish Q keyboard's i keys, and a dead key's decomposed letter
    expect(wordleKeyFrom(press('ı'))).toBe('i');
    expect(wordleKeyFrom(press('İ'))).toBe('i');
    expect(wordleKeyFrom(press('ê'))).toBe('ê');
  });

  it('takes Enter and Backspace', () => {
    expect(wordleKeyFrom(press('Enter'))).toBe('Enter');
    expect(wordleKeyFrom(press('Backspace'))).toBe('Backspace');
  });

  it('leaves alone what is not a letter, a shortcut, a repeat or a key still composing', () => {
    expect(wordleKeyFrom(press('é'))).toBeNull();
    expect(wordleKeyFrom(press('1'))).toBeNull();
    expect(wordleKeyFrom(press('Dead'))).toBeNull();
    expect(wordleKeyFrom(press('Shift'))).toBeNull();
    expect(wordleKeyFrom(press('c', { ctrlKey: true }))).toBeNull();
    expect(wordleKeyFrom(press('v', { metaKey: true }))).toBeNull();
    expect(wordleKeyFrom(press('a', { repeat: true }))).toBeNull();
    expect(wordleKeyFrom(press('a', { isComposing: true }))).toBeNull();
    expect(wordleKeyFrom(press('a', { keyCode: 229 }))).toBeNull();
  });

  it('leaves typing in another field on the page to that field', () => {
    const input = document.createElement('input');
    document.body.append(input);
    expect(wordleKeyFrom(press('a', { target: input }))).toBeNull();
    expect(wordleKeyFrom(press('Backspace', { target: input }))).toBeNull();
  });

  it('leaves Enter on another button to that button, but not on the game’s own keys', () => {
    const button = document.createElement('button');
    document.body.append(button);
    expect(wordleKeyFrom(press('Enter', { target: button }))).toBeNull();
    expect(wordleKeyFrom(press('a', { target: button }))).toBe('a');

    const keys = document.createElement('div');
    keys.className = 'wordle-keyboard';
    const key = document.createElement('button');
    keys.append(key);
    document.body.append(keys);
    expect(wordleKeyFrom(press('Enter', { target: key }))).toBe('Enter');
  });
});

function Keys({ active, onKey }: { active: boolean; onKey: (k: string) => void }): null {
  useWordleKeys(active, onKey);
  return null;
}

describe('useWordleKeys', () => {
  it('passes the keys it takes on, and keeps them from doing anything else', () => {
    const onKey = vi.fn();
    render(<Keys active onKey={onKey} />);

    const handled = fireEvent.keyDown(window, { key: 'ê', altKey: true });
    const ignored = fireEvent.keyDown(window, { key: 'Tab' });

    expect(onKey.mock.calls).toEqual([['ê']]);
    expect(handled).toBe(false); // default prevented
    expect(ignored).toBe(true);
  });

  it('listens only while the game is being played', () => {
    const onKey = vi.fn();
    render(<Keys active={false} onKey={onKey} />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(onKey).not.toHaveBeenCalled();
  });
});
