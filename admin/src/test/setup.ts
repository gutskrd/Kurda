/**
 * Set up for every admin test file: the DOM matchers (toBeInTheDocument, …),
 * and Testing Library told to wrap what it does in React's act() — the job
 * @testing-library/react does for a React app. The admin pins its own React,
 * and that package would load the repository's other copy alongside it, so
 * the admin uses the framework-free @testing-library/dom with its own render
 * (test/render.tsx).
 */
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/dom';
import { act } from 'react';
import { afterEach } from 'vitest';
import { cleanupRendered } from './render';

type ActGlobal = { IS_REACT_ACT_ENVIRONMENT?: boolean };
const actGlobal = globalThis as ActGlobal;
actGlobal.IS_REACT_ACT_ENVIRONMENT = true;

configure({
  // waiting (findBy…, waitFor, user-event's whole action) runs outside act, as
  // @testing-library/react does, so updates in between are not flagged as unexpected
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
  // each event dispatched is one act(), so React has finished rendering it
  eventWrapper: (cb) => {
    let result: unknown;
    act(() => {
      result = cb();
    });
    return result;
  },
});

if (typeof window !== 'undefined') {
  // jsdom has no layout, so no scrollIntoView, and media elements cannot play
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
