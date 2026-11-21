// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('../../theme/Pressable', () => import('../../testing/reach'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { PromptToken } from '@kurda/shared';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { ReachGroup } from '../../theme/Pressable';
import { forgetReach, reachLimitOf, reachOf } from '../../testing/reach';
import { SlowButton } from './AskParts';
import { PromptWords } from './PromptWords';

// How far the lesson's small controls answer past what they draw: prompt words, which touch each other and the line
// under them, and the slow chip under a bubble that may be a button itself.

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  forgetReach();
});

const tokens: PromptToken[] = [
  { text: 'Bibore', meanings: ['excuse me', 'sorry'] },
  { text: ', ' },
  { text: 'xatirê te', meanings: ['goodbye'] },
];

describe('the words of a prompt', () => {
  it('reach down only, half of what a fingertip is missing, and never sideways into the word beside them', () => {
    // A 24-tall line plus its dots makes a 28-tall word, 20 short of 48.
    renderWithProviders(<PromptWords prompt="Bibore, xatirê te" tokens={tokens} style={{ fontSize: typography.sizes.text, lineHeight: 24 }} />);
    expect(reachOf('Bibore')).toEqual({ top: 0, bottom: 10, left: 0, right: 0 });
    expect(reachOf('xatirê te')).toEqual({ top: 0, bottom: 10, left: 0, right: 0 });
  });

  it('reach nowhere past their letters when the line’s height is not known', () => {
    renderWithProviders(<PromptWords prompt="Bibore, xatirê te" tokens={tokens} />);
    expect(reachOf('Bibore')).toBeUndefined();
  });

  it('keep what a word means clear of any group round the prompt, so a tap anywhere still closes it', async () => {
    renderWithProviders(
      <ReachGroup gap={0} rowGap={0}>
        <PromptWords prompt="Bibore, xatirê te" tokens={tokens} style={{ fontSize: typography.sizes.text, lineHeight: 24 }} />
      </ReachGroup>,
    );
    expect(reachLimitOf('Bibore')).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bibore' }));
    });
    await screen.findByTestId('prompt-meanings');
    expect(reachLimitOf('Close')).toBeNull();
  });
});

describe('the slow chip', () => {
  it('reaches 9 down to a fingertip’s 48 but only 4 up, where a listening clip’s bubble sits 4 over it', () => {
    const slowly = vi.fn();
    renderWithProviders(<SlowButton onPress={slowly} />);
    expect(reachOf('Play at slow speed')).toEqual({ top: 4, bottom: 9, left: 0, right: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Play at slow speed' }));
    expect(slowly).toHaveBeenCalledTimes(1);
  });

  it('keeps the same reach while it cannot be pressed, so it is right from the first time it is drawn', () => {
    renderWithProviders(<SlowButton onPress={() => undefined} disabled />);
    expect(reachOf('Play at slow speed')).toEqual({ top: 4, bottom: 9, left: 0, right: 0 });
  });
});
