/**
 * Rendering a page for the admin's tests (jsdom): mount, wait for what it
 * fetches, and act on it the way a person does — click, type, choose.
 */
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// tells React these renders are driven by a test, so it flushes effects inside act()
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Let pending fetches, timers and hash changes run, inside act. */
export async function settle(rounds = 5): Promise<void> {
  await act(async () => {
    for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

export async function render(ui: ReactNode): Promise<{ container: HTMLElement; unmount: () => void }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(ui));
  await settle();
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

export async function click(el: Element | null | undefined): Promise<void> {
  if (!el) throw new Error('nothing to click');
  await act(async () => (el as HTMLElement).click());
  await settle();
}

/** Type into an input or textarea: set its value the way the browser does, then tell React. */
export async function type(el: Element | null | undefined, value: string): Promise<void> {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) throw new Error('not a text field');
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

export async function choose(el: Element | null | undefined, value: string): Promise<void> {
  if (!(el instanceof HTMLSelectElement)) throw new Error('not a select');
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}

/** The button (or link) a person would name this way: its text, or its aria-label. */
export function button(container: ParentNode, name: string | RegExp): HTMLButtonElement | HTMLAnchorElement | null {
  const all = [...container.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>('button, a')];
  return (
    all.find((b) => {
      const label = b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '';
      return typeof name === 'string' ? label === name : name.test(label);
    }) ?? null
  );
}

export function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}
