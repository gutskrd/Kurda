import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { RECENT_MS, growFromOpener, openerPoint, originIn, watchOpeners } from './opener';

/** A browser that plays motion, or one whose reader asked for less of it. */
function withMotion(reduced = false): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

/** A control drawn at a known place: a browser without layout draws everything at nowhere. */
function control(tag: 'button' | 'input', box: { left: number; top: number; width: number; height: number }): HTMLElement {
  const el = document.createElement(tag);
  const drawn = { ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => ({}) };
  el.getBoundingClientRect = () => drawn as DOMRect;
  document.body.appendChild(el);
  return el;
}

/** A panel resting at a known place in the layer that covers the window. */
function panelAt(left: number, top: number, width: number, height: number): HTMLElement {
  const panel = document.createElement('div');
  Object.defineProperties(panel, {
    offsetLeft: { value: left },
    offsetTop: { value: top },
    offsetWidth: { value: width },
    offsetHeight: { value: height },
  });
  return panel;
}

let stop: () => void = () => undefined;

beforeEach(() => {
  stop = watchOpeners();
});

afterEach(() => {
  stop();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('where something was opened from', () => {
  it('is nowhere when nothing has been pressed', () => {
    expect(openerPoint()).toBeNull();
  });

  it('is the point a pointer pressed', () => {
    const button = control('button', { left: 100, top: 400, width: 80, height: 40 });
    fireEvent.click(button, { clientX: 112, clientY: 431, detail: 1 });
    expect(openerPoint()).toEqual({ x: 112, y: 431 });
  });

  it('is the middle of the control, for a click the keyboard made', () => {
    const button = control('button', { left: 100, top: 400, width: 80, height: 40 });
    // Enter on a button: a click with no pointer behind it, at no point at all
    fireEvent.click(button, { clientX: 0, clientY: 0, detail: 0 });
    expect(openerPoint()).toEqual({ x: 140, y: 420 });
  });

  it('is the control that has the focus, for a key that opens something by itself', () => {
    const button = control('button', { left: 20, top: 600, width: 60, height: 60 });
    button.focus();
    fireEvent.keyDown(button, { key: '?' });
    expect(openerPoint()).toEqual({ x: 50, y: 630 });
  });

  it('is not a key typed into a field', () => {
    const field = control('input', { left: 20, top: 600, width: 200, height: 40 });
    field.focus();
    fireEvent.keyDown(field, { key: 'a' });
    expect(openerPoint()).toBeNull();
  });

  it('is forgotten a moment after the press: what opens later was not opened by it', () => {
    const button = control('button', { left: 100, top: 400, width: 80, height: 40 });
    fireEvent.click(button, { clientX: 112, clientY: 431, detail: 1 });
    const pressed = Date.now();
    expect(openerPoint(pressed + RECENT_MS - 1)).not.toBeNull();
    expect(openerPoint(pressed + RECENT_MS + 50)).toBeNull();
  });
});

describe('the point a panel grows from', () => {
  it('is the opener, written from the panel’s middle so it holds when the panel changes size', () => {
    withMotion();
    const button = control('button', { left: 100, top: 400, width: 80, height: 40 });
    fireEvent.click(button, { clientX: 112, clientY: 431, detail: 1 });
    // a panel 400 by 300 whose corner is at 440, 250: its middle is at 640, 400
    expect(originIn(panelAt(440, 250, 400, 300))).toBe('calc(50% - 528px) calc(50% + 31px)');
  });

  it('is none when nothing opened the panel', () => {
    withMotion();
    expect(originIn(panelAt(440, 250, 400, 300))).toBeNull();
  });

  it('is none for a reader who asked for less motion', () => {
    withMotion(true);
    const button = control('button', { left: 100, top: 400, width: 80, height: 40 });
    fireEvent.click(button, { clientX: 112, clientY: 431, detail: 1 });
    expect(originIn(panelAt(440, 250, 400, 300))).toBeNull();
  });
});

describe('a small menu, opened', () => {
  /** A menu drawn where its ⋯ put it: under the button, its far corner at the button’s. */
  function menuAt(left: number, top: number): HTMLElement {
    const menu = control('button', { left, top, width: 176, height: 120 });
    return menu;
  }

  it('grows out of the press that opened it, measured from its own corner', () => {
    withMotion();
    const button = control('button', { left: 330, top: 200, width: 44, height: 44 });
    fireEvent.click(button, { clientX: 352, clientY: 222, detail: 1 });
    const menu = menuAt(198, 248);
    growFromOpener(menu);
    expect(menu).toHaveClass('grows-from-opener');
    expect(menu.style.transformOrigin).toBe('154px -26px');
  });

  it('is simply there when nothing was pressed to open it', () => {
    withMotion();
    const menu = menuAt(198, 248);
    growFromOpener(menu);
    expect(menu).not.toHaveClass('grows-from-opener');
    expect(menu.style.transformOrigin).toBe('');
  });

  it('is simply there for a reader who asked for less motion', () => {
    withMotion(true);
    const button = control('button', { left: 330, top: 200, width: 44, height: 44 });
    fireEvent.click(button, { clientX: 352, clientY: 222, detail: 1 });
    const menu = menuAt(198, 248);
    growFromOpener(menu);
    expect(menu).not.toHaveClass('grows-from-opener');
  });
});
