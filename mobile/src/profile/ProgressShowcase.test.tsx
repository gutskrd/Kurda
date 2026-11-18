// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../reports/testing/harness';
import { ProgressShowcase } from './ProgressShowcase';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));

describe('ProgressShowcase', () => {
  afterEach(cleanup);

  it('shows the league and opens it, and nothing of games, which are played for fun', () => {
    const onLeague = vi.fn();
    renderWithProviders(<ProgressShowcase own={false} badges={[]} league={{ tier: 'cem' }} onLeague={onLeague} />);
    expect(screen.getByText('Çem')).toBeTruthy();
    expect(screen.queryByText(/Placing|Gir/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Çem/ }));
    expect(onLeague).toHaveBeenCalled();
  });

  it('shows nothing of somebody else’s with no badges on show and no league', () => {
    const { container } = renderWithProviders(<ProgressShowcase own={false} badges={[]} league={null} />);
    expect(container.textContent).toBe('');
  });

  it('marks a badge earned since the app opened as new, and the others not', () => {
    renderWithProviders(
      <ProgressShowcase
        own
        badges={[
          { key: 'agir', family: 'habit', tier: 2, tierKey: 'ziv' },
          { key: 'peyvok', family: 'learning', tier: 1, tierKey: 'sifir' },
        ]}
        league={null}
        fresh={new Set(['agir'])}
      />,
    );
    expect(screen.getAllByTestId('badge-new')).toHaveLength(1);
    expect(screen.getByText('New')).toBeTruthy();
  });
});
