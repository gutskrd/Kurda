import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

/*
 * How long a findBy… or waitFor waits for the page to catch up. Testing
 * Library's own second is often not enough when the whole suite runs at once
 * on a busy machine, and a test that fails only then is a test nobody can
 * trust. A passing test is no slower for it: the wait ends as soon as the
 * page is there.
 */
configure({ asyncUtilTimeout: 4000 });

/*
 * jsdom has no layout, so it ships no scrollIntoView at all — calling it throws
 * rather than doing nothing. Every real browser has had it for two decades, so
 * this is jsdom's gap to fill, not something the components should guard.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}

/*
 * jsdom has <audio> but cannot play it: play() only logs "not implemented".
 * A play that resolves silently is what a browser with sound off does.
 */
HTMLMediaElement.prototype.play = function play(): Promise<void> {
  return Promise.resolve();
};
HTMLMediaElement.prototype.pause = function pause(): void {};

/*
 * jsdom has no user-agent stylesheet, so every element computes as display ''
 * and Testing Library reads a name with a marked piece, `<mark>Ro</mark>jda`,
 * as two words ("Ro jda") where a browser reads it as one. <mark> is inline in
 * every browser; say so here. Only <mark>: the spans the app lays out as rows
 * are blocks in a real page, and are best left read as separate words.
 */
const userAgentStyles = document.createElement('style');
userAgentStyles.textContent = 'mark { display: inline }';
document.head.appendChild(userAgentStyles);

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
