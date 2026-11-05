/**
 * Rendering the phone's components in a test.
 *
 * The app's tests were all logic until now: React Native's own sources are Flow
 * and do not load under Node. These render a component through react-native-web
 * in jsdom instead, with Testing Library — the same library and the same habits
 * as the browser's tests, so a sheet's steps, its labels and its roles are
 * asserted the way a person meets them.
 *
 * A test file starts with `// @vitest-environment jsdom` and these mocks (they
 * must be written in the file itself, where vitest hoists them):
 *
 *   vi.mock('react-native', () => import('react-native-web'));
 *   vi.mock('react-native-svg', () => import('…/reports/testing/svg'));
 *   vi.mock('expo-secure-store', () => import('…/reports/testing/stubs'));
 *   vi.mock('expo-linear-gradient', () => import('…/reports/testing/stubs'));
 *   vi.mock('expo-notifications', () => import('…/reports/testing/stubs'));  // where a screen reads it
 *   vi.mock('react-native-safe-area-context', () => import('…/reports/testing/stubs'));
 *   vi.mock('…/auth/AuthContext', () => import('…/reports/testing/auth'));
 *
 * then renders with `renderWithProviders`, which wraps the real theme and
 * translation providers around the component.
 */
import type { ReactElement, ReactNode } from 'react';
import { act, configure, getConfig, render, type RenderResult } from '@testing-library/react';
import { createRoot, type Root } from 'react-dom/client';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { I18nProvider } from '../../i18n/I18nContext';

export function Providers({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <ThemeProvider>
      <I18nProvider>{children}</I18nProvider>
    </ThemeProvider>
  );
}

export function renderWithProviders(ui: ReactElement): RenderResult {
  return render(ui, { wrapper: Providers });
}

/*
 * A screen is drawn, and then its effects run, and React does the two as
 * separate pieces of work. On a quiet machine they follow each other at once;
 * on a busy one React hands the thread back in between, and a findBy… that
 * sees the new screen resolves in that gap. A press made then reaches a
 * screen that is drawn but not yet wired: react-native-web gives a Pressable
 * its current onPress and disabled, and joins it to the touch system, in
 * effects, so the press goes to the handler of the screen before (a Start
 * still disabled, a Check that still thinks nothing is picked) or to nobody
 * (a long press on a message just shown), and a screen's own effects (a new
 * item clearing the last one's choice, a result's buzz) land after the step
 * that should have followed them. So the tests failed only in a full run.
 *
 * No person can press inside that gap, so a test should not either: before
 * every event fired, and as every findBy… or waitFor… is satisfied, React is
 * made to finish the work it put off. Rendering anything at all does that,
 * since React runs the effects still waiting before it draws again; here it
 * is an empty root of its own, so no screen is touched.
 */
let quiet: Root | null = null;

/** Run every effect React has put off, and what they set in motion. */
export function settle(): void {
  if (typeof document === 'undefined') return;
  quiet ??= createRoot(document.createElement('div'));
  act(() => quiet!.render(null));
}

const { asyncWrapper, eventWrapper } = getConfig();
configure({
  eventWrapper: (fire) => {
    settle();
    return eventWrapper(fire);
  },
  asyncWrapper: async (wait) => {
    const found = await asyncWrapper(wait);
    settle();
    return found;
  },
});
