import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/*
 * jsdom has no layout, so it ships no scrollIntoView at all — calling it throws
 * rather than doing nothing. Every real browser has had it for two decades, so
 * this is jsdom's gap to fill, not something the components should guard.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
