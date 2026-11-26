import { lazy, type ComponentType } from 'react';

/**
 * A part of a screen that only a press opens (the composer, a chat docked by the rail, the collection sheet), kept out
 * of the first download. Every part is fetched once the page has loaded and gone quiet (`whenPageSettles`), so it
 * is already here when someone opens it; `preload` fetches one at once, for a press about to land.
 */
export type LazyPart<P> = React.LazyExoticComponent<ComponentType<P>> & { preload: () => void };

const parts: Array<() => void> = [];

/** How long after the page's own load the parts wait, so the screen's data and pictures go first. */
const SETTLE_MS = 3000;

export function lazyPart<P extends object>(load: () => Promise<ComponentType<P>>): LazyPart<P> {
  let pending: Promise<{ default: ComponentType<P> }> | null = null;
  const fetchPart = (): Promise<{ default: ComponentType<P> }> => {
    // A failed fetch is forgotten, so opening the part later tries again.
    pending ??= load().then(
      (component) => ({ default: component }),
      (error: unknown) => {
        pending = null;
        throw error;
      },
    );
    return pending;
  };
  const part = lazy(fetchPart) as LazyPart<P>;
  part.preload = () => void fetchPart().catch(() => undefined);
  parts.push(part.preload);
  return part;
}

/** Fetches every part now. */
export function preloadParts(): void {
  for (const preload of parts) preload();
}

/** Runs `then` once the page has loaded and the browser is idle, unless the reader has asked to save data. */
export function whenPageSettles(then: () => void): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;
  const settle = (): void => {
    window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(then, { timeout: SETTLE_MS });
      else then();
    }, SETTLE_MS);
  };
  if (document.readyState === 'complete') settle();
  else window.addEventListener('load', settle, { once: true });
}
