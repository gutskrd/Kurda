// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('../navigation/hardwareBack', () => import('../navigation/testing/hardwareBack'));
vi.mock('../theme/Pressable', () => import('../testing/reach'));
import { cleanup, screen } from '@testing-library/react';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { FakeAudio } from '../characters/testing/audio';
import { forgetReach, reachLimitOf, reachOf } from '../testing/reach';
import { DictionaryScreen } from '../screens/DictionaryScreen';
import { EntryDetail } from './EntryDetail';
import { SourceLine } from './SourceLine';
import type { Entry, SavedWord } from './types';

/*
 * How far the dictionary's controls reach past what they draw: the headword's two round buttons, a saved word's ✕
 * (which must never take a tap meant for the word), and the source line's links.
 */

beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: true });
  vi.stubGlobal('Audio', FakeAudio);
});
afterEach(() => {
  cleanup();
  forgetReach();
  vi.unstubAllGlobals();
});

const ENTRY: Entry = {
  id: 'e1',
  headword: 'mal',
  dialect: 'kurmanji',
  senses: [{ id: 's1', position: 1, pos: 'noun', definitionEn: 'house, home', definitionKu: null, examples: [] }],
  audio: [{ id: 'a1', url: 'https://media.test/mal.wav', dialect: 'kurmanji' }],
  xrefs: [],
};

/** The line height a text line is drawn with, read from the stylesheet rule react-native-web adds for its class. */
function lineHeightOf(el: Element): string | undefined {
  const cls = [...el.classList].find((c) => c.startsWith('r-lineHeight-'));
  if (!cls) return undefined;
  // The rules can sit inside grouping rules (a media block), so every level is looked through.
  const find = (rules: CSSRuleList): string | undefined => {
    for (const rule of rules) {
      if (rule.cssText.startsWith(`.${cls}`)) return /line-height:\s*([^;]+);/.exec(rule.cssText)?.[1]?.trim();
      const inner = (rule as CSSGroupingRule).cssRules;
      const found = inner ? find(inner) : undefined;
      if (found) return found;
    }
    return undefined;
  };
  for (const sheet of document.styleSheets) {
    const found = find(sheet.cssRules);
    if (found) return found;
  }
  return undefined;
}

const saved = (entryId: string, headword: string, definitionEn: string): SavedWord => ({
  entryId,
  headword,
  pos: 'noun',
  definitionEn,
  definitionKu: null,
  savedAt: '2026-10-01T10:00:00Z',
});

describe('the buttons beside a headword', () => {
  it('each reach 8 past every edge, and meet in the middle of the 16 between them', async () => {
    testAuth.client = fakeClient({ 'GET /dictionary/entries/e1': ok(ENTRY) });
    renderWithProviders(<EntryDetail entryId="e1" onBack={() => undefined} />);
    await screen.findByRole('button', { name: 'Play pronunciation' });
    for (const name of ['Play pronunciation', 'Bookmark word']) {
      expect(reachOf(name)).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
      expect(reachLimitOf(name)).toEqual({ top: undefined, bottom: undefined, left: 8, right: 8 });
    }
  });
});

describe('a saved word’s ✕', () => {
  it('covers its row from top to bottom and its end, and reaches nothing toward the word', async () => {
    testAuth.client = fakeClient({ 'GET /me/saved-words': ok({ words: [saved('e1', 'mal', 'house'), saved('e2', 'av', 'water')] }) });
    renderWithProviders(<DictionaryScreen onBack={() => undefined} />);
    await screen.findByText('av');
    // The row's 8 of padding and half the 4 between rows, above and below; nothing on the word's side.
    expect(reachOf('Remove av')).toEqual({ top: 10, bottom: 10, left: 0, right: 10 });
    expect(reachOf('Remove mal')).toEqual({ top: 10, bottom: 10, left: 0, right: 10 });
  });
});

describe('the source line', () => {
  it('is set 24 tall, so each link in it answers over the whole line rather than its small letters', () => {
    renderWithProviders(<SourceLine />);
    const line = screen.getByText('Wîkîferheng').parentElement!;
    expect(lineHeightOf(line)).toBe('24px');
  });
});
