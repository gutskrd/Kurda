// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { lockPageScroll } from './scrollLock';

const root = (): CSSStyleDeclaration => document.documentElement.style;

afterEach(() => {
  root().overflow = '';
  root().removeProperty('scrollbar-gutter');
});

describe('lockPageScroll', () => {
  it('holds the window still on the root element and leaves the body alone', () => {
    const unlock = lockPageScroll();
    expect(root().overflow).toBe('hidden');
    // a hidden body would become a scroll container and take the sticky bar with it
    expect(document.body.style.overflow).toBe('');
    unlock();
    expect(root().overflow).toBe('');
  });

  it('keeps the page still until the last of two nested locks is released', () => {
    const sheet = lockPageScroll();
    const dialog = lockPageScroll();
    dialog();
    expect(root().overflow).toBe('hidden');
    sheet();
    expect(root().overflow).toBe('');
  });

  it('counts a release only once however often it is called', () => {
    const first = lockPageScroll();
    const second = lockPageScroll();
    first();
    first();
    expect(root().overflow).toBe('hidden');
    second();
    expect(root().overflow).toBe('');
  });

  it('puts back an overflow the root already had', () => {
    root().overflow = 'auto';
    const unlock = lockPageScroll();
    expect(root().overflow).toBe('hidden');
    unlock();
    expect(root().overflow).toBe('auto');
  });
});
