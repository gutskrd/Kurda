// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
/*
 * The timings a slide leaves on, held until the test lets each finish: under
 * test every animation otherwise ends the moment it begins, and a slide on
 * its way out would never be seen on its way.
 */
const held = vi.hoisted(() => ({ runs: [] as { to: number; finish: () => void }[] }));
vi.mock('../theme/animate', async (original) => ({
  ...(await original<typeof import('../theme/animate')>()),
  timing: (_value: unknown, to: number) => {
    const run = { to, finish: () => undefined as void };
    held.runs.push(run);
    return {
      start: (cb?: (r: { finished: boolean }) => void) => {
        run.finish = () => cb?.({ finished: true });
      },
      stop: () => undefined,
      reset: () => undefined,
    };
  },
}));

import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { TRANSLATIONS } from '../i18n/translations';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { OnboardingScreen } from './OnboardingScreen';

/*
 * The intro: the languages offered as a choice that ticks when it changes;
 * the slides turning the way the reader goes, the one leaving to the start
 * side going on and to the end side going back, the dots' capsule sliding
 * with them; and the welcome slide with Hevalo himself over all four lines
 * about the app at once, in the language just chosen.
 */

let felt: HapticEvent[] = [];
let stop: () => void = () => undefined;

beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: true });
  // a language chosen in one test is saved as the app's, and must not be the next test's
  globalThis.localStorage?.clear();
  resetHaptics();
  felt = [];
  stop = onHaptic((e) => felt.push(e));
  held.runs = [];
});
afterEach(() => {
  stop();
  cleanup();
});

async function settle(): Promise<void> {
  await act(async () => undefined);
}

/** every held animation runs to its end */
function finishAll(): void {
  act(() => held.runs.splice(0).forEach((run) => run.finish()));
}

/** a device that has said whether it wants motion, known from the intro's first frame */
async function device({ reduceMotion }: { reduceMotion: boolean }): Promise<void> {
  patchReactNativeWeb({ reduceMotion });
  renderWithProviders(<OnboardingScreen onComplete={() => undefined} />).unmount();
  await settle();
  felt = [];
  held.runs = [];
}

/** how far along the dots the capsule sits, in points */
const capsuleAt = (): number => Number(/translateX\((-?[\d.e-]+)px\)/.exec(screen.getByTestId('onboarding-dots-active').style.transform)?.[1] ?? 0);

const en = TRANSLATIONS.en;
const de = TRANSLATIONS.de;

describe('OnboardingScreen', () => {
  it('offers the languages as a choice, ticks when it changes, and not when the chosen one is tapped again', async () => {
    renderWithProviders(<OnboardingScreen onComplete={() => undefined} />);
    await settle();
    expect(screen.getByText(en['onboarding.language.title'])).toBeTruthy();
    const german = screen.getByRole('radio', { name: 'Deutsch' });
    expect(german.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(german);
    await settle();
    expect(screen.getByRole('radio', { name: 'Deutsch' }).getAttribute('aria-checked')).toBe('true');
    expect(felt).toEqual(['select']);
    fireEvent.click(screen.getByRole('radio', { name: 'Deutsch' }));
    await settle();
    expect(felt).toEqual(['select']);
  });

  it('turns on to Hevalo over the four lines in the language chosen, the language slide leaving to the start side, and back again to the end side', async () => {
    await device({ reduceMotion: true });
    renderWithProviders(<OnboardingScreen onComplete={() => undefined} />);
    await settle();
    expect(capsuleAt()).toBe(0);
    fireEvent.click(screen.getByRole('radio', { name: 'Deutsch' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: de['common.continue'] }));
    await settle();
    // the language list on its way out, a still of itself; Hevalo and all four lines in
    const leaving = screen.getByTestId('slide-out-start');
    expect(leaving.textContent).toContain(de['onboarding.language.title']);
    expect(screen.getByRole('img', { name: /Hevalo/ })).toBeTruthy();
    for (const line of ['onboarding.prop.learn', 'onboarding.prop.play', 'onboarding.prop.read', 'onboarding.prop.streak'] as const) {
      expect(screen.getByText(de[line])).toBeTruthy();
    }
    expect(capsuleAt()).toBeGreaterThan(0);
    const second = capsuleAt();
    // the cross-fade done, the list is gone
    finishAll();
    expect(screen.queryByTestId('slide-out-start')).toBeNull();
    expect(screen.queryByText(de['onboarding.language.title'])).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: de['common.back'] }));
    await settle();
    expect(screen.getByTestId('slide-out-end').textContent).toContain(de['onboarding.prop.learn']);
    expect(screen.getByRole('radio', { name: 'Deutsch' }).getAttribute('aria-checked')).toBe('true');
    expect(capsuleAt()).toBe(0);
    finishAll();
    fireEvent.click(screen.getByRole('button', { name: de['common.continue'] }));
    await settle();
    finishAll();
    fireEvent.click(screen.getByRole('button', { name: de['common.continue'] }));
    await settle();
    // the last slide: the bell, and the capsule a slot further on
    expect(screen.getByText(de['onboarding.notify.title'])).toBeTruthy();
    expect(capsuleAt()).toBeCloseTo(second * 2);
  });

  it('greets a tap on Hevalo with a knock', async () => {
    renderWithProviders(<OnboardingScreen onComplete={() => undefined} initialStep="welcome" />);
    await settle();
    fireEvent.click(screen.getByRole('img', { name: /Hevalo/ }));
    expect(felt).toEqual(['tap']);
  });

  it('finishes with what was chosen', async () => {
    const onComplete = vi.fn();
    renderWithProviders(<OnboardingScreen onComplete={onComplete} initialStep="notifications" />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: en['nav.register'] }));
    expect(onComplete).toHaveBeenCalledWith({ completed: true, preferredLanguage: 'en' });
  });
});
