import { describe, it, expect, vi, afterEach } from 'vitest';
import { keepInView } from './keepInView';

/** A menu inside a card; each box is where the test says it was drawn. */
function drawn(menu: Partial<DOMRect>, card: Partial<DOMRect> | null): HTMLElement {
  const outer = document.createElement('div');
  if (card) outer.style.overflowX = 'hidden';
  const el = document.createElement('div');
  outer.appendChild(el);
  document.body.appendChild(outer);
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(menu as DOMRect);
  vi.spyOn(outer, 'getBoundingClientRect').mockReturnValue((card ?? {}) as DOMRect);
  return el;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('keepInView', () => {
  it('moves a menu back inside the window', () => {
    vi.stubGlobal('innerWidth', 390);
    const el = drawn({ left: 324, right: 500 }, null);
    keepInView(el);
    expect(el.style.transform).toBe('translateX(-118px)');
  });

  it('moves it inside a card that clips it, before the window would', () => {
    // the profile card at 16–374 hides anything past its edge; the menu starts at 4
    vi.stubGlobal('innerWidth', 390);
    const el = drawn({ left: 4, right: 180 }, { left: 16, right: 374 });
    keepInView(el);
    expect(el.style.transform).toBe('translateX(20px)');
  });

  it('leaves a menu that already fits where it is', () => {
    vi.stubGlobal('innerWidth', 1280);
    const el = drawn({ left: 400, right: 576 }, { left: 100, right: 900 });
    el.style.transform = 'translateX(30px)';
    keepInView(el);
    expect(el.style.transform).toBe('');
  });
});
