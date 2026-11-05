// @vitest-environment jsdom
import { act, cleanup, renderHook, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AA_NORMAL, contrastRatio } from '../a11y/contrast';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { DARK, LIGHT } from '../theme/palette';
import { Ticket, TicketBurst, TicketStamp, ticketTone, useChangedSinceMount } from './Ticket';

vi.mock('react-native', () => import('./testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-navigation/native', () => import('./testing/navigation'));

afterEach(() => {
  cleanup();
  patchReactNativeWeb({ reduceMotion: true });
});

const tick = () => act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)));

describe('ticketTone', () => {
  it('fills a game’s stub with that game’s own colour, a friendship’s with the brand’s ink, and a spent one in grey', () => {
    for (const colors of [LIGHT, DARK]) {
      expect(ticketTone(colors, 'wordle-battle').face).toBe(colors.success);
      expect(ticketTone(colors, 'rhyme-match').face).toBe(colors.gold);
      expect(ticketTone(colors, 'stories').face).toBe(colors.primary);
      expect(ticketTone(colors, 'friend').face).toBe(colors.primary);
      const spent = ticketTone(colors, 'rhyme-match', true);
      expect(spent.face).not.toBe(colors.gold);
      expect(spent.lip).toBeNull();
    }
  });

  it('inks every stub so its glyph and its words can be read on it', () => {
    for (const colors of [LIGHT, DARK]) {
      for (const tone of ['wordle-battle', 'rhyme-match', 'stories', 'friend'] as const) {
        const { face, ink } = ticketTone(colors, tone);
        expect(contrastRatio(ink, face), `${colors.scheme} ${tone}`).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    }
  });
});

describe('useChangedSinceMount', () => {
  it('is false for what was there from the start, and true once it changes', () => {
    const { result, rerender } = renderHook(({ value }) => useChangedSinceMount(value), { initialProps: { value: 'pending' } });
    expect(result.current).toBe(false);
    rerender({ value: 'accepted' });
    expect(result.current).toBe(true);
  });

  it('takes the first value it was ready with as the start, not the empty one before it', () => {
    const { result, rerender } = renderHook(({ value, ready }) => useChangedSinceMount(value, ready), {
      initialProps: { value: null as string | null, ready: false },
    });
    rerender({ value: 'joined', ready: true });
    // a card that arrives already stamped was stamped before anybody looked
    expect(result.current).toBe(false);
    rerender({ value: 'finished', ready: true });
    expect(result.current).toBe(true);
  });
});

describe('Ticket', () => {
  it('reads as what is written on it: the stub’s notches and perforation are not read out', () => {
    renderWithProviders(
      <Ticket tone="stories" punched stub={<Text>stub</Text>}>
        <Text>Nanê Germ</Text>
      </Ticket>,
    );
    expect(screen.getByText('Nanê Germ')).toBeTruthy();
    // the punched hole and the rule are pictures of the paper, hidden from a screen reader
    expect(document.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('keeps a stamp’s words, so a screen reader hears "Joined" as it is seen', () => {
    renderWithProviders(<TicketStamp label="Joined" tone="success" land />);
    expect(screen.getByText('Joined')).toBeTruthy();
  });
});

describe('under Reduce Motion', () => {
  it('throws no sparks when a ticket is handed over', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    const view = renderWithProviders(<TicketBurst fired={0} colour="#2E7D32" />);
    await tick();
    view.rerender(<TicketBurst fired={1} colour="#2E7D32" />);
    expect(view.container.querySelectorAll('[aria-hidden="true"]').length).toBe(0);
  });

  it('throws them otherwise', async () => {
    patchReactNativeWeb({ reduceMotion: false });
    const view = renderWithProviders(<TicketBurst fired={0} colour="#2E7D32" />);
    await tick();
    expect(view.container.querySelectorAll('[aria-hidden="true"]').length).toBe(1);
  });
});
