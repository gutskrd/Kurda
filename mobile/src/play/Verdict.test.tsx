// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { ICON_PATHS } from '../theme/icon-paths';
import { DARK, LIGHT } from '../theme/palette';
import { TRANSLATIONS } from '../i18n/translations';
import { Verdict } from './Verdict';

vi.mock('react-native', () => import('./testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));

patchReactNativeWeb();
afterEach(cleanup);

describe('a game’s verdict', () => {
  it('draws the app’s own trophy over a win, in the gold made for the page', () => {
    const { container } = renderWithProviders(<Verdict won>{TRANSLATIONS.en['games.youWon']}</Verdict>);
    expect(screen.getByRole('heading', { name: 'You won!' })).toBeTruthy();
    const trophy = container.querySelector('svg path');
    expect(trophy?.getAttribute('d')).toBe(ICON_PATHS.trophy[0]);
    // whichever scheme the test's device is in: its gold for words, never white or the label colour
    expect([LIGHT.goldText, DARK.goldText]).toContain(trophy?.getAttribute('fill'));
  });

  it('draws nothing over a game that was not won', () => {
    const { container } = renderWithProviders(<Verdict won={false}>Game over</Verdict>);
    expect(screen.getByRole('heading', { name: 'Game over' })).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
  });

  // the mark is an icon's work now: a screen reader used to be read an emoji before the words, in every language
  it('keeps the words free of the emoji the icons replaced', () => {
    for (const [locale, catalogue] of Object.entries(TRANSLATIONS)) {
      for (const key of ['games.youWon', 'games.wordle.solved', 'play.chat.preview', 'comments.voice', 'chat.preview.gift'] as const) {
        expect(catalogue[key], `${locale} ${key}`).not.toMatch(/\p{Extended_Pictographic}/u);
      }
    }
  });
});
