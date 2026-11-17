import { describe, expect, it } from 'vitest';
import { getStateFromPath } from '@react-navigation/core';
import { LETTER_LINKS } from './links';

const T = '6f9b1c2e-1d2a-4b3c-8d4e-5f6a7b8c9d0e';

/** The screen and its params an address opens, with the letters’ part of the app’s linking. */
function opens(path: string): { name: string; params?: object } | undefined {
  const route = getStateFromPath(path, { screens: LETTER_LINKS })?.routes.at(-1);
  return route ? { name: route.name, ...(route.params ? { params: route.params } : {}) } : undefined;
}

describe('the letters’ addresses', () => {
  it('opens the window with a notification’s bird named', () => {
    expect(opens(`app/letters?bird=${T}`)).toEqual({ name: 'Letters', params: { bird: T } });
    expect(opens('app/letters')).toEqual({ name: 'Letters' });
  });

  it('still opens a correspondence by its own address, as the widget does', () => {
    expect(opens(`app/letters/${T}`)).toEqual({ name: 'LetterThread', params: { threadId: T } });
  });
});
