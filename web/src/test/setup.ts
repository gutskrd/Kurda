import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { forgetAnswers } from '../lib/apiMemory';
import { forgetArrivals } from '../lib/motion';

/*
 * Tests never reach the network: an unstubbed request would hit the live API with a test token, and its refusal
 * would set off a token refresh in the next test. Tests stub fetch themselves; anything else fails here.
 */
globalThis.fetch = (() => Promise.reject(new TypeError('tests do not reach the network'))) as typeof fetch;

/* The default one-second wait for findBy and waitFor is too short when the whole suite runs on a busy machine. */
configure({ asyncUtilTimeout: 4000 });

/* jsdom has no scrollIntoView, and calling it throws; every real browser has it, so the gap is filled here. */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}

/* jsdom cannot play audio, so play() resolves silently as in a browser with sound off. */
HTMLMediaElement.prototype.play = function play(): Promise<void> {
  return Promise.resolve();
};
HTMLMediaElement.prototype.pause = function pause(): void {};

/*
 * jsdom has no user-agent stylesheet, so `<mark>Ro</mark>jda` reads as two words ("Ro jda"). Marking <mark> inline
 * makes it read as one, as in a browser.
 */
const userAgentStyles = document.createElement('style');
userAgentStyles.textContent = 'mark { display: inline }';
document.head.appendChild(userAgentStyles);

/* Per-tab memory (lib/apiMemory.ts, lib/motion.ts) lives in modules a test file shares, so each test starts afresh. */
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  forgetAnswers();
  forgetArrivals();
});
