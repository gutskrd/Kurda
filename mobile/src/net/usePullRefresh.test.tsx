// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
// the control as a button that shows what it was given: whether it turns, and its tint
vi.mock('react-native', async () => {
  const rn = (await import('react-native-web')) as unknown as Record<string, unknown>;
  const { createElement } = await import('react');
  const RefreshControl = ({ refreshing, onRefresh, tintColor }: { refreshing: boolean; onRefresh: () => void; tintColor: string }) =>
    createElement('button', { type: 'button', 'aria-label': 'Pull to refresh', 'aria-busy': refreshing, 'data-tint': tintColor, onClick: onRefresh });
  return { ...rn, RefreshControl };
});
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { useTheme } from '../theme/ThemeProvider';
import { usePullRefresh } from './usePullRefresh';

afterEach(cleanup);

function Pulled({ reload }: { reload: () => unknown }): React.JSX.Element {
  return usePullRefresh(reload);
}

/** A reload the test settles when it likes. */
function held() {
  let settle: (ok: boolean) => void = () => undefined;
  const reload = vi.fn(() => new Promise<void>((resolve, reject) => (settle = (ok) => (ok ? resolve() : reject(new Error('down'))))));
  return { reload, settle: (ok: boolean) => settle(ok) };
}

describe('usePullRefresh', () => {
  it('turns until the reading settles, and reads once per pull', async () => {
    const { reload, settle } = held();
    renderWithProviders(<Pulled reload={reload} />);
    const pull = screen.getByRole('button', { name: 'Pull to refresh' });
    expect(pull.getAttribute('aria-busy')).toBe('false');
    await act(async () => {
      fireEvent.click(pull);
    });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(pull.getAttribute('aria-busy')).toBe('true');
    await act(async () => settle(true));
    expect(pull.getAttribute('aria-busy')).toBe('false');
  });

  it('stops turning when the reading fails, leaving the failure to the screen', async () => {
    const { reload, settle } = held();
    renderWithProviders(<Pulled reload={reload} />);
    const pull = screen.getByRole('button', { name: 'Pull to refresh' });
    await act(async () => {
      fireEvent.click(pull);
    });
    await act(async () => settle(false));
    expect(pull.getAttribute('aria-busy')).toBe('false');
  });

  it('stops at once for a reading that returns nothing to wait on', async () => {
    const reload = vi.fn();
    renderWithProviders(<Pulled reload={reload} />);
    const pull = screen.getByRole('button', { name: 'Pull to refresh' });
    await act(async () => {
      fireEvent.click(pull);
    });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(pull.getAttribute('aria-busy')).toBe('false');
  });

  it('is tinted the quiet grey the other screens use', () => {
    let grey = '';
    function Probe(): React.JSX.Element {
      grey = useTheme().colors.textSecondary;
      return <Pulled reload={() => undefined} />;
    }
    renderWithProviders(<Probe />);
    expect(screen.getByRole('button', { name: 'Pull to refresh' }).getAttribute('data-tint')).toBe(grey);
  });
});
