// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../reports/testing/harness';
import { AppErrorBoundary } from './AppErrorBoundary';
import { reportRenderError } from './crashReporting';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('./crashReporting', () => ({ reportRenderError: vi.fn() }));

function BrokenCard(): React.JSX.Element {
  throw new TypeError('lesson is undefined');
}

describe('the error boundary round the screens', () => {
  beforeEach(() => {
    // a store build: the crash screen leaves out the developer’s detail line
    vi.stubGlobal('__DEV__', false);
    // React logs the caught error on its own; it is expected here
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the crash screen and reports the error, with the components that were rendering', async () => {
    renderWithProviders(
      <AppErrorBoundary>
        <BrokenCard />
      </AppErrorBoundary>,
    );
    expect(await screen.findByTestId('crash-retry')).toBeTruthy();
    expect(reportRenderError).toHaveBeenCalledTimes(1);
    const [error, componentStack] = vi.mocked(reportRenderError).mock.calls[0]!;
    expect((error as Error).message).toBe('lesson is undefined');
    expect(componentStack).toContain('BrokenCard');
  });
});
