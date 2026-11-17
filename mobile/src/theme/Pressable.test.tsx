// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * react-native-web drops hitSlop before the page, so the native Pressable is
 * wrapped to note what it is given: the reach a phone would answer over.
 */
const native = vi.hoisted(() => ({ given: new Map<string, unknown>() }));
vi.mock('react-native', async () => {
  const web = await import('react-native-web');
  const { createElement } = await import('react');
  function Pressable(props: { testID?: string; hitSlop?: unknown }): React.JSX.Element {
    if (props.testID) native.given.set(props.testID, props.hitSlop);
    return createElement(web.Pressable as never, props);
  }
  return { ...web, Pressable };
});
vi.mock('./Pressable', () => import('../testing/reach'));

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Animated, StyleSheet, View } from 'react-native';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { forgetReach, reachLimitOf, reachOf } from '../testing/reach';
import { usePressScale } from './animate';
import { PRESS_SCALE } from './motion';
import { PRESS_DELAY_MS, Pressable, QUICK_RELEASE_MS, ReachGroup, ReachReset, TAP_FLASH_MS, resolveReach } from './Pressable';

/*
 * The app's Pressable (theme/Pressable.tsx): how far past what it draws a
 * control answers a finger, how neighbours share the gap between them, and a
 * press too quick to see still being seen.
 */

patchReactNativeWeb();
afterEach(() => {
  cleanup();
  forgetReach();
  native.given.clear();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const press = () => undefined;
const even = (n: number) => ({ top: n, bottom: n, left: n, right: n });
const styles = StyleSheet.create({ icon: { width: 30, height: 30 }, chip: { minWidth: 36, minHeight: 36 }, row: { width: '100%', minHeight: 56 } });

describe('a control’s reach', () => {
  it('pads a small control out to the reach from the size its style declares', () => {
    expect(resolveReach({ onPress: press, style: { width: 36, height: 36 } }, null)).toEqual(even(6));
    expect(resolveReach({ onPress: press, style: [styles.chip, { opacity: 1 }] }, null)).toEqual(even(6));
  });

  it('reads the size from a style that is a function of the press, at rest', () => {
    const seen: boolean[] = [];
    const style = ({ pressed }: { pressed: boolean }) => {
      seen.push(pressed);
      return [styles.icon, pressed && { opacity: 0.5 }];
    };
    expect(resolveReach({ onPress: press, style }, null)).toEqual(even(9));
    expect(seen).toEqual([false]);
  });

  it('takes a size the style does not state from reachSize, one side at a time', () => {
    expect(resolveReach({ onPress: press, reachSize: { height: 44 } }, null)).toEqual({ top: 2, bottom: 2, left: 0, right: 0 });
    expect(resolveReach({ onPress: press, reachSize: { height: 50 } }, null)).toBeUndefined();
    expect(resolveReach({ onPress: press, style: styles.icon, reachSize: { width: 44 } }, null)).toEqual({ top: 9, bottom: 9, left: 2, right: 2 });
  });

  it('gives no reach where the size is not known, or where it is already big enough', () => {
    expect(resolveReach({ onPress: press }, null)).toBeUndefined();
    expect(resolveReach({ onPress: press, style: { flex: 1 } }, null)).toBeUndefined();
    // a width in percent is not a size that can be counted from
    expect(resolveReach({ onPress: press, style: styles.row }, null)).toBeUndefined();
  });

  it('reaches past every edge of a control that stands alone', () => {
    expect(resolveReach({ onPress: press, reach: 'open', style: { width: 44, height: 44 } }, null)).toEqual(even(8));
    expect(resolveReach({ onPress: press, reach: 'open', style: styles.icon }, null)).toEqual(even(9));
    expect(resolveReach({ onPress: press, reach: 'open' }, null)).toEqual(even(8));
  });

  it('keeps a hitSlop the caller wrote as it is, past any group’s cap', () => {
    const limit = { left: 2, right: 2 };
    expect(resolveReach({ onPress: press, hitSlop: { top: 4, bottom: 4 }, style: styles.icon }, limit)).toEqual({ top: 4, bottom: 4 });
    expect(resolveReach({ onPress: press, hitSlop: 12, style: styles.icon }, limit)).toBe(12);
    expect(resolveReach({ onPress: press, hitSlop: null, style: styles.icon }, limit)).toBeUndefined();
  });

  it('gives none when asked for none', () => {
    expect(resolveReach({ onPress: press, reach: 'none', style: styles.icon }, null)).toBeUndefined();
  });

  it('leaves alone a press that answers at once, and a control that is only held', () => {
    expect(resolveReach({ onPress: press, pressDelay: 0, style: styles.icon }, null)).toBeUndefined();
    expect(resolveReach({ style: styles.icon }, null)).toBeUndefined();
    // asked for by name, a reach still holds
    expect(resolveReach({ reach: 'open', style: styles.icon }, null)).toEqual(even(9));
  });

  it('is the same whether or not the control is disabled', () => {
    render(
      <>
        <Pressable testID="on" onPress={press} style={styles.icon} />
        <Pressable testID="off" onPress={press} style={styles.icon} disabled />
      </>,
    );
    expect(native.given.get('on')).toEqual(even(9));
    expect(native.given.get('off')).toEqual(even(9));
  });

  it('is handed to the native view, and stays the same object while its numbers do', () => {
    const { rerender } = render(<Pressable testID="icon" onPress={press} style={{ width: 30, height: 30 }} />);
    const first = native.given.get('icon');
    expect(first).toEqual(even(9));
    rerender(<Pressable testID="icon" onPress={() => undefined} style={{ width: 30, height: 30, opacity: 0.9 }} />);
    expect(native.given.get('icon')).toBe(first);
    rerender(<Pressable testID="icon" onPress={press} style={{ width: 36, height: 30 }} />);
    expect(native.given.get('icon')).toEqual({ top: 9, bottom: 9, left: 6, right: 6 });
  });
});

describe('neighbours’ reaches', () => {
  it('meet in the middle of the gap between them', () => {
    render(
      <ReachGroup gap={4}>
        <Pressable testID="a" onPress={press} style={styles.icon} />
        <Pressable testID="b" onPress={press} style={styles.icon} />
      </ReachGroup>,
    );
    expect(reachOf('a')).toEqual({ top: 9, bottom: 9, left: 2, right: 2 });
    expect(native.given.get('b')).toEqual({ top: 9, bottom: 9, left: 2, right: 2 });
  });

  it('cap rows by half the space between them, and leave a side no gap was given for alone', () => {
    render(
      <ReachGroup rowGap={8}>
        <Pressable testID="chip" onPress={press} style={styles.icon} />
      </ReachGroup>,
    );
    expect(reachLimitOf('chip')).toEqual({ top: 4, bottom: 4, left: undefined, right: undefined });
    expect(reachOf('chip')).toEqual({ top: 4, bottom: 4, left: 9, right: 9 });
  });

  it('take the tighter cap on each side when one group sits inside another', () => {
    render(
      <ReachGroup gap={10} rowGap={2}>
        <ReachGroup gap={4}>
          <Pressable testID="inner" onPress={press} style={styles.icon} />
        </ReachGroup>
      </ReachGroup>,
    );
    expect(reachOf('inner')).toEqual({ top: 1, bottom: 1, left: 2, right: 2 });
  });

  it('do not reach into a sheet opened over them', () => {
    render(
      <ReachGroup gap={0} rowGap={0}>
        <ReachReset>
          <Pressable testID="in-sheet" onPress={press} style={styles.icon} />
        </ReachReset>
      </ReachGroup>,
    );
    expect(reachLimitOf('in-sheet')).toBeNull();
    expect(native.given.get('in-sheet')).toEqual(even(9));
  });

  it('are found by label as well as by testID', () => {
    render(<Pressable accessibilityLabel="Close" onPress={press} reach="open" style={styles.icon} />);
    expect(reachOf('Close')).toEqual(even(9));
    expect(() => reachOf('Nothing here')).toThrow(/no pressable named/);
  });

  it('come from a stand-in that leaves out nothing the real module has', async () => {
    const real = await vi.importActual<Record<string, unknown>>('./Pressable');
    const standIn = await import('../testing/reach');
    for (const name of Object.keys(real)) expect(standIn, name).toHaveProperty(name);
  });
});

describe('a press too quick to see', () => {
  /** A finger down and up on the control, with `ms` between them. */
  async function tap(target: HTMLElement, ms: number): Promise<void> {
    fireEvent.mouseDown(target, { button: 0, buttons: 1 });
    if (ms > 0) await act(async () => vi.advanceTimersByTimeAsync(ms));
    fireEvent.mouseUp(target, { button: 0 });
  }

  function Lit(): React.JSX.Element {
    return (
      <Pressable testID="lit" onPress={press} style={({ pressed }) => [styles.icon, { opacity: pressed ? 0.5 : 1 }]}>
        {({ pressed }) => <View testID={pressed ? 'held' : 'resting'} />}
      </Pressable>
    );
  }
  const opacity = () => getComputedStyle(screen.getByTestId('lit')).opacity;

  it('stays lit for the flash after it is let go, then goes out', async () => {
    vi.useFakeTimers();
    render(<Lit />);
    await tap(screen.getByTestId('lit'), 0);
    expect(opacity()).toBe('0.5');
    expect(screen.getByTestId('held')).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(TAP_FLASH_MS - 10));
    expect(opacity()).toBe('0.5');
    await act(async () => vi.advanceTimersByTimeAsync(20));
    expect(opacity()).toBe('1');
    expect(screen.getByTestId('resting')).toBeTruthy();
  });

  it('does not flash a press that was held long enough to be seen', async () => {
    vi.useFakeTimers();
    render(<Lit />);
    // the press shows after its delay; let go well after it showed
    await tap(screen.getByTestId('lit'), PRESS_DELAY_MS + QUICK_RELEASE_MS + 30);
    expect(opacity()).toBe('1');
  });

  it('forgets the flash when the control goes away first', async () => {
    vi.useFakeTimers();
    const { unmount } = render(<Lit />);
    await tap(screen.getByTestId('lit'), 0);
    // the flash's own timer is the one a tap adds beyond what the touch system keeps
    const lit = vi.getTimerCount();
    unmount();
    expect(vi.getTimerCount()).toBe(lit - 1);
  });
});

describe('a button that gives under the finger', () => {
  /** The hook, drawn, and every animation it starts from here on, in the order they were made. */
  function probe(): { hook: () => ReturnType<typeof usePressScale>; made: () => [string, unknown][]; sequence: ReturnType<typeof vi.spyOn> } {
    let hook: ReturnType<typeof usePressScale> | null = null;
    function Probe(): React.JSX.Element {
      hook = usePressScale();
      return <Animated.View />;
    }
    render(<Probe />);
    const timing = vi.spyOn(Animated, 'timing');
    const spring = vi.spyOn(Animated, 'spring');
    const sequence = vi.spyOn(Animated, 'sequence');
    const made = (): [string, unknown][] =>
      [
        ...timing.mock.calls.map((c, i) => ['timing', c[1].toValue, timing.mock.invocationCallOrder[i]!] as const),
        ...spring.mock.calls.map((c, i) => ['spring', c[1].toValue, spring.mock.invocationCallOrder[i]!] as const),
      ]
        .sort((a, b) => a[2] - b[2])
        .map(([kind, to]) => [kind, to]);
    return { hook: () => hook!, made, sequence };
  }

  it('gives all the way on a press let go at once, before it springs back', () => {
    const { hook, made, sequence } = probe();
    act(() => {
      hook().onPressIn();
      hook().onPressOut();
    });
    // the give as the finger lands, then on release the whole give again and only then the spring
    expect(made()).toEqual([
      ['timing', PRESS_SCALE],
      ['timing', PRESS_SCALE],
      ['spring', 1],
    ]);
    expect(sequence).toHaveBeenCalledTimes(1);
  });

  it('springs straight back from a press that was held', () => {
    vi.useFakeTimers();
    const { hook, made, sequence } = probe();
    act(() => hook().onPressIn());
    vi.advanceTimersByTime(QUICK_RELEASE_MS + 100);
    act(() => hook().onPressOut());
    expect(made()).toEqual([
      ['timing', PRESS_SCALE],
      ['spring', 1],
    ]);
    expect(sequence).not.toHaveBeenCalled();
  });
});

describe('the reach drawn for checking', () => {
  it('is drawn behind the control, out to its reach, as its last child', () => {
    vi.stubEnv('EXPO_PUBLIC_SHOW_REACH', '1');
    render(
      <Pressable testID="shown" onPress={press} style={styles.icon}>
        <View testID="face" />
      </Pressable>,
    );
    const control = screen.getByTestId('shown');
    expect(control.firstElementChild).toBe(screen.getByTestId('face'));
    const shim = control.lastElementChild as HTMLElement;
    expect(shim.dataset.reach).toBe('1');
    expect(getComputedStyle(shim).top).toBe('-9px');
    expect(getComputedStyle(shim).left).toBe('-9px');
  });

  it('is not there unless asked for', () => {
    render(
      <Pressable testID="plain" onPress={press} style={styles.icon}>
        <View testID="face" />
      </Pressable>,
    );
    expect(screen.getByTestId('plain').querySelector('[data-reach]')).toBeNull();
  });
});
