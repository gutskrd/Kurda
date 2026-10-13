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
 *   vi.mock('react-native-safe-area-context', () => import('…/reports/testing/stubs'));
 *   vi.mock('…/auth/AuthContext', () => import('…/reports/testing/auth'));
 *
 * then renders with `renderWithProviders`, which wraps the real theme and
 * translation providers around the component.
 */
import type { ReactElement, ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
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
