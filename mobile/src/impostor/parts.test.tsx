// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { View } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { GoldButton, PictureCards, PictureTiles, type PictureOption } from './parts';

/**
 * The parts Kurdish Impostor's screens are built from: choices drawn as
 * pictures that are still radios, a long list folded without ever hiding the
 * one chosen, and the one gold thing to press.
 */

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));

afterEach(cleanup);

// stand-in Kurdish for the fixtures, never shown to a learner
const options: PictureOption<string>[] = Array.from({ length: 15 }, (_, i) => ({ value: `c${i}`, label: `kom ${i}`, hint: `group ${i}`, art: <View />, tone: '#3d8bd9' }));

function Tiles({ start, first, strip }: { start: string; first?: number; strip?: boolean }): React.JSX.Element {
  const [value, setValue] = useState(start);
  return <PictureTiles label="Category" options={options} value={value} onChange={setValue} first={first} strip={strip} moreLabel={(count) => `Show more (${count})`} />;
}

describe('PictureTiles', () => {
  it('is a group of radios, each named by its Kurdish name and what it means, the chosen one checked', () => {
    renderWithProviders(<Tiles start="c0" />);
    const group = screen.getByRole('radiogroup', { name: 'Category' });
    expect(within(group).getAllByRole('radio')).toHaveLength(15);
    expect(within(group).getByRole('radio', { name: 'kom 0 · group 0' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(group).getByRole('radio', { name: 'kom 2 · group 2' }));
    expect(within(group).getByRole('radio', { name: 'kom 2 · group 2' }).getAttribute('aria-checked')).toBe('true');
    expect(within(group).getByRole('radio', { name: 'kom 0 · group 0' }).getAttribute('aria-checked')).toBe('false');
  });

  it('folds a long list after its first choices, shows the rest when asked, and never folds away the chosen one', () => {
    renderWithProviders(<Tiles start="c14" first={12} />);
    expect(screen.getAllByRole('radio')).toHaveLength(13);
    expect(screen.getByRole('radio', { name: 'kom 14 · group 14' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Show more (2)' }));
    expect(screen.getAllByRole('radio')).toHaveLength(15);
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull();
  });

  it('lays every choice on one row when it is a strip: a row that scrolls has nothing to fold', () => {
    renderWithProviders(<Tiles start="c0" first={12} strip />);
    expect(within(screen.getByRole('radiogroup', { name: 'Category' })).getAllByRole('radio')).toHaveLength(15);
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull();
  });
});

describe('PictureCards', () => {
  it('reads each card as its name and its sentence together', () => {
    const onChange = vi.fn();
    renderWithProviders(<PictureCards label="Kind of game" options={options.slice(0, 3)} value="c1" onChange={onChange} />);
    const group = screen.getByRole('radiogroup', { name: 'Kind of game' });
    expect(within(group).getByRole('radio', { name: 'kom 1. group 1' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(group).getByRole('radio', { name: 'kom 2. group 2' }));
    expect(onChange).toHaveBeenCalledWith('c2');
  });
});

describe('GoldButton', () => {
  it('does its one thing when pressed, and nothing while it is busy', () => {
    const onPress = vi.fn();
    const { rerender } = renderWithProviders(<GoldButton label="Deal the cards" onPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deal the cards' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<GoldButton label="Deal the cards" onPress={onPress} busy />);
    fireEvent.click(screen.getByRole('button', { name: 'Deal the cards' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Deal the cards' }).getAttribute('aria-disabled')).toBe('true');
  });
});
