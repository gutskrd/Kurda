/**
 * Rendering the phone's components in a test. React Native's own sources are Flow and do not load under Node, so
 * components render through react-native-web in jsdom with Testing Library, as the browser's tests do.
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
 * React draws a screen and runs its effects as separate pieces of work, and on a busy machine a findBy can resolve in
 * the gap. react-native-web wires a Pressable's onPress, disabled state and touch handling in effects, so a press made
 * then reaches the previous screen's handler or nobody, and the tests failed only in full runs.
 *
 * No person can press inside that gap, so before every fired event, and as every findBy or waitFor is satisfied, React
 * is made to finish its pending work by rendering an empty root of its own (React flushes waiting effects before it
 * draws again).
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
