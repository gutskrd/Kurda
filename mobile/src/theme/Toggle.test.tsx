// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
import { useState } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { ToggleRow } from './Toggle';

// The whole row is the switch, for a finger and for a screen reader alike.

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

function Row({ onChange = () => undefined, disabled = false }: { onChange?: (on: boolean) => void; disabled?: boolean }): React.JSX.Element {
  const [on, setOn] = useState(false);
  return (
    <ToggleRow
      label="Play sounds"
      hint="Plays a word as it is shown"
      value={on}
      disabled={disabled}
      onValueChange={(next) => {
        onChange(next);
        setOn(next);
      }}
    />
  );
}

describe('a switch row', () => {
  it('turns on from a tap on its words, and off again', () => {
    const onChange = vi.fn();
    renderWithProviders(<Row onChange={onChange} />);
    fireEvent.click(screen.getByText('Play sounds'));
    expect(screen.getByRole('switch', { name: 'Play sounds' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByText('Plays a word as it is shown'));
    expect(screen.getByRole('switch', { name: 'Play sounds' }).getAttribute('aria-checked')).toBe('false');
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('is one switch to a screen reader, with the one inside it hidden', () => {
    renderWithProviders(<Row />);
    // The system switch inside is drawn, but only the row is offered as a switch.
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(screen.getAllByRole('switch', { hidden: true }).length).toBeGreaterThan(1);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('flips once when the switch itself is tapped', () => {
    const onChange = vi.fn();
    renderWithProviders(<Row onChange={onChange} />);
    const inner = screen.getAllByRole('switch', { hidden: true }).find((el) => el.tagName === 'INPUT')!;
    fireEvent.click(inner);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is at least the reach tall', () => {
    renderWithProviders(<Row />);
    expect(getComputedStyle(screen.getByRole('switch')).minHeight).toBe('48px');
  });

  it('does nothing while it is disabled, and says so', () => {
    const onChange = vi.fn();
    renderWithProviders(<Row onChange={onChange} disabled />);
    fireEvent.click(screen.getByText('Play sounds'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('switch').getAttribute('aria-disabled')).toBe('true');
  });

  it('lets a row with its own layout place the switch itself', () => {
    renderWithProviders(
      <ToggleRow label="Event themes" value onValueChange={() => undefined}>
        {(toggle) => (
          <>
            <Text>Seasons and holidays</Text>
            {toggle}
          </>
        )}
      </ToggleRow>,
    );
    const row = screen.getByRole('switch', { name: 'Event themes' });
    expect(row.getAttribute('aria-checked')).toBe('true');
    expect(row.textContent).toContain('Seasons and holidays');
    expect(screen.queryByText('Event themes')).toBeNull();
  });
});
