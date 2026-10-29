// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { Tile, TileButton } from './Tile';
import type { TileState } from './tileTones';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

/** The face of the tile a button is: drawn last, over its lip. */
function face(button: HTMLElement): HTMLElement {
  return button.lastElementChild as HTMLElement;
}

describe('a tile', () => {
  it('can be pressed while it is waiting or picked, and not once it is spent or the lesson has moved on', () => {
    const pressed: TileState[] = [];
    const states: TileState[] = ['idle', 'picked', 'right', 'wrong', 'spent', 'disabled'];
    renderWithProviders(
      <>
        {states.map((state) => (
          <Tile key={state} label={state} state={state} onPress={() => pressed.push(state)} />
        ))}
      </>,
    );
    for (const state of states) fireEvent.click(screen.getByRole('button', { name: state }));
    expect(pressed).toEqual(['idle', 'picked', 'right', 'wrong']);
    expect(screen.getByRole('button', { name: 'spent' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'disabled' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('says it is picked to a screen reader, and keeps its colours but not its press once graded', () => {
    const onPress = vi.fn();
    renderWithProviders(
      <>
        <Tile label="sêv" state="picked" onPress={onPress} />
        <Tile label="nan" state="right" disabled onPress={onPress} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'sêv' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'nan' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  // under Reduce Motion it does not travel: it is simply down while held and up again when let go
  it('sinks onto its lip while it is held, and stands back up when it is let go', async () => {
    renderWithProviders(<Tile label="av" onPress={() => undefined} />);
    // the Reduce Motion setting is read as it mounts
    await act(async () => undefined);
    const tile = screen.getByRole('button', { name: 'av' });
    expect(face(tile).style.transform).toMatch(/translateY\(0px\)/);
    // held from the keyboard, which presses at once where a finger waits a moment to be sure it is a press
    act(() => {
      fireEvent.keyDown(tile, { key: ' ' });
    });
    expect(face(tile).style.transform).toMatch(/translateY\(4px\)/);
    act(() => {
      fireEvent.keyUp(tile, { key: ' ' });
    });
    expect(face(tile).style.transform).toMatch(/translateY\(0px\)/);
  });

  it('loses its lip once it is spent, keeping its place so nothing around it moves', () => {
    const { rerender } = renderWithProviders(<Tile label="av" state="idle" onPress={() => undefined} />);
    expect(screen.getByRole('button', { name: 'av' }).children).toHaveLength(2);
    rerender(<Tile label="av" state="spent" onPress={() => undefined} />);
    expect(screen.getByRole('button', { name: 'av' }).children).toHaveLength(1);
  });
});

describe('a lesson button', () => {
  it('cannot be pressed while there is nothing to check, and says so', () => {
    const onPress = vi.fn();
    renderWithProviders(<TileButton label="Check" disabled onPress={onPress} />);
    const check = screen.getByRole('button', { name: 'Check' });
    expect(check.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(check);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('spins in place of its word while an answer is on its way, and is not pressed twice', () => {
    const onPress = vi.fn();
    renderWithProviders(<TileButton label="Check" busy onPress={onPress} />);
    const check = screen.getByRole('button', { name: 'Check' });
    expect(check.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('Check')).toBeNull();
    fireEvent.click(check);
    expect(onPress).not.toHaveBeenCalled();
  });
});
