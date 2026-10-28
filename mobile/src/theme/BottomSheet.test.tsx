// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { Text } from 'react-native';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { onHaptic, setHapticDriver } from '../feedback/haptics';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { BottomSheet, SheetScrollView } from './BottomSheet';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

// a phone's screen: jsdom's window has no height, and a sheet's heights are shares of it
Object.defineProperty(window, 'visualViewport', { value: { height: 800, width: 390, scale: 1 }, configurable: true });
window.dispatchEvent(new Event('resize'));

describe('the bottom sheet', () => {
  it('shows its title and what is in it, named for a screen reader as a header', () => {
    renderWithProviders(
      <BottomSheet visible onClose={() => undefined} title="New club">
        <Text>Name</Text>
      </BottomSheet>,
    );
    expect(screen.getByRole('heading', { name: 'New club' })).toBeTruthy();
    expect(screen.getByText('Name')).toBeTruthy();
  });

  it('closes from its ✕ and from a tap on the page behind it', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <BottomSheet visible onClose={onClose} title="New club">
        <Text>Name</Text>
      </BottomSheet>,
    );
    const closers = screen.getAllByRole('button', { name: 'Close' });
    // the dimmed page, then the ✕
    expect(closers).toHaveLength(2);
    fireEvent.click(closers[1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps its ✕ when the content carries its own heading', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <BottomSheet visible onClose={onClose}>
        <Text>Îstîkan</Text>
      </BottomSheet>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    const closers = screen.getAllByRole('button', { name: 'Close' });
    expect(closers).toHaveLength(2);
    fireEvent.click(closers[1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('steps back from its ‹ in a sheet with steps, without closing', () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <BottomSheet visible onClose={onClose} onBack={onBack} title="A gift">
        <Text>What</Text>
      </BottomSheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open while something it started is on its way', () => {
    const onClose = vi.fn();
    const { rerender } = renderWithProviders(
      <BottomSheet visible onClose={onClose} dismissible={false}>
        <Text>Deleting</Text>
      </BottomSheet>,
    );
    const [scrim, x] = screen.getAllByRole('button', { name: 'Close' });
    expect(x!.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(scrim!);
    fireEvent.click(x!);
    expect(onClose).not.toHaveBeenCalled();

    // answered: it closes again as any sheet does
    rerender(
      <BottomSheet visible onClose={onClose} dismissible>
        <Text>Deleting</Text>
      </BottomSheet>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reads a title in a language of its own in that language', () => {
    renderWithProviders(
      <BottomSheet visible onClose={() => undefined} title="Nanê germ" titleLanguage={{ accessibilityLanguage: 'ku' }}>
        <Text>Story</Text>
      </BottomSheet>,
    );
    expect(screen.getByRole('heading', { name: 'Nanê germ' }).getAttribute('lang')).toBe('ku');
  });

  it('shows nothing while it is closed', () => {
    renderWithProviders(
      <BottomSheet visible={false} onClose={() => undefined} title="New club">
        <Text>Name</Text>
      </BottomSheet>,
    );
    expect(screen.queryByText('Name')).toBeNull();
  });
});

/**
 * A finger on `from`, down `dy` points in steps of 20, and off: `msPerStep`
 * apart, so a flick is as quick as it says; without, it is let go of slowly.
 */
function drag(from: Element, dy: number, msPerStep?: number): void {
  let time = 1_000_000;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => time);
  const at = (y: number) => ({ clientX: 100, clientY: y, pageX: 100, pageY: y, buttons: 1 });
  fireEvent.mouseDown(from, { ...at(300), button: 0 });
  for (let y = 300; Math.abs(y - 300) < Math.abs(dy); y += Math.sign(dy) * 20) {
    fireEvent.mouseMove(from, at(y));
    time += msPerStep ?? 1;
  }
  fireEvent.mouseMove(from, at(300 + dy));
  // let go slowly: held still a moment first, so it lifts with no speed
  if (msPerStep === undefined) time += 200;
  fireEvent.mouseUp(from, at(300 + dy));
  clock.mockRestore();
}

describe('the bottom sheet under a finger', () => {
  it('closes when dragged down past half from anywhere on it, not only its grabber', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <BottomSheet visible onClose={onClose} title="New club">
        <Text>Name</Text>
      </BottomSheet>,
    );
    drag(screen.getByText('Name'), 500);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a quick flick down from near the top, where a slow drag as far would not', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <BottomSheet visible onClose={onClose} title="New club">
        <Text>Name</Text>
      </BottomSheet>,
    );
    // 80 points in 40 ms: 2000 points a second, which would carry it about 1000 points
    drag(screen.getByText('Name'), 80, 10);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays when let go a little way down', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <BottomSheet visible onClose={onClose} title="New club">
        <Text>Name</Text>
      </BottomSheet>,
    );
    drag(screen.getByText('Name'), 80);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays however far it is dragged while it may not close', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <BottomSheet visible onClose={onClose} dismissible={false}>
        <Text>Deleting</Text>
      </BottomSheet>,
    );
    drag(screen.getByText('Deleting'), 700);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves a drag in scrolled content to the content, and takes it again once the content is back at its top', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <BottomSheet visible onClose={onClose} title="Letters">
        <SheetScrollView testID="letters">
          <Text>A</Text>
        </SheetScrollView>
      </BottomSheet>,
    );
    const list = screen.getByTestId('letters');
    list.scrollTop = 240;
    fireEvent.scroll(list);
    drag(screen.getByText('A'), 500);
    expect(onClose).not.toHaveBeenCalled();

    // a scroll view reports at most every 16 ms
    await new Promise((resolve) => setTimeout(resolve, 20));
    list.scrollTop = 0;
    fireEvent.scroll(list);
    drag(screen.getByText('A'), 500);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('with medium and large, opens at medium and moves between them from its grabber, felt as it lands', () => {
    const felt: string[] = [];
    const restore = setHapticDriver(() => undefined);
    const stop = onHaptic((e) => felt.push(e));
    renderWithProviders(
      <BottomSheet visible onClose={() => undefined} title="Filters" detents={['medium', 'large']} testID="filters">
        <Text>Sort</Text>
      </BottomSheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy();
    expect(felt).toEqual(['tap']);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.getByRole('button', { name: 'Expand' })).toBeTruthy();
    stop();
    restore();
  });

  it('has no grabber control when it has one height', () => {
    renderWithProviders(
      <BottomSheet visible onClose={() => undefined} title="New club">
        <Text>Name</Text>
      </BottomSheet>,
    );
    expect(screen.queryByRole('button', { name: 'Expand' })).toBeNull();
  });
});
