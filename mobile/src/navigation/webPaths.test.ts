import { describe, expect, it } from 'vitest';
import { getPathFromState, getStateFromPath } from '@react-navigation/core';
import { WEB_PATH_LINKS } from './webPaths';

/** The screen and params an address opens, through this part of the app's linking. */
function opens(path: string): { name: string; params?: object } | undefined {
  const route = getStateFromPath(path, { screens: WEB_PATH_LINKS })?.routes.at(-1);
  return route ? { name: route.name, ...(route.params ? { params: route.params } : {}) } : undefined;
}

describe('the website’s addresses', () => {
  it('opens search, a lesson and the words where the website has them', () => {
    expect(opens('app/search?q=dar')).toEqual({ name: 'Search', params: { q: 'dar' } });
    expect(opens('app/learn/lesson/l1')).toEqual({ name: 'Lesson', params: { lessonId: 'l1' } });
    expect(opens('app/learn/words')).toEqual({ name: 'Words' });
    expect(opens('app/learn/words/months?script=ckb')).toEqual({ name: 'WordSet', params: { set: 'months', script: 'ckb' } });
  });

  it('still opens the phone’s older addresses', () => {
    expect(opens('search')).toEqual({ name: 'Search' });
    expect(opens('lesson/l1')).toEqual({ name: 'Lesson', params: { lessonId: 'l1' } });
    expect(opens('app/words')).toEqual({ name: 'Words' });
    expect(opens('app/words/colours')).toEqual({ name: 'WordSet', params: { set: 'colours' } });
  });

  it('writes the website’s address when the app names a screen', () => {
    const state = { routes: [{ name: 'WordSet', params: { set: 'days' } }] };
    expect(getPathFromState(state, { screens: WEB_PATH_LINKS })).toBe('/app/learn/words/days');
  });
});
