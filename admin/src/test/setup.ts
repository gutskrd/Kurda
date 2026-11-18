/**
 * Setup for every test file: the DOM matchers, and Testing Library told to wrap its work in React's act(). The console
 * pins its own React, which @testing-library/react would load a second copy beside, so it uses @testing-library/dom
 * with its own render (test/render.tsx).
 */
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/dom';
import { act } from 'react';
import { afterEach } from 'vitest';
import { cleanupRendered } from './render';

/* Tests never reach the network: the app's address is the live API, so an unstubbed request fails here as offline. */
globalThis.fetch = (() => Promise.reject(new TypeError('tests do not reach the network'))) as typeof fetch;

type ActGlobal = { IS_REACT_ACT_ENVIRONMENT?: boolean };
const actGlobal = globalThis as ActGlobal;
actGlobal.IS_REACT_ACT_ENVIRONMENT = true;

configure({
  // Waiting (findBy…, waitFor, a user-event action) runs outside act, as @testing-library/react does, so updates in
  // between are not flagged.
  asyncWrapper: async (cb) => {
    const before = actGlobal.IS_REACT_ACT_ENVIRONMENT;
    actGlobal.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      const result = await cb();
      await new Promise((resolve) => setTimeout(resolve, 0));
      return result;
    } finally {
      actGlobal.IS_REACT_ACT_ENVIRONMENT = before;
    }
  },
  // Each dispatched event is one act(), even inside a wait, so React has finished rendering it.
  eventWrapper: (cb) => {
    const before = actGlobal.IS_REACT_ACT_ENVIRONMENT;
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    let result: unknown;
    try {
      act(() => {
        result = cb();
      });
    } finally {
      actGlobal.IS_REACT_ACT_ENVIRONMENT = before;
    }
    return result;
  },
});

if (typeof window !== 'undefined') {
  // jsdom has no layout, so no scrollIntoView, and media elements cannot play.
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function scrollIntoView(): void {};
  HTMLMediaElement.prototype.play = function play(): Promise<void> {
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function pause(): void {};
  window.scrollTo = function scrollTo(): void {};
}

afterEach(() => {
  cleanupRendered();
});
