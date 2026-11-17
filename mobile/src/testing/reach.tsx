import { vi } from 'vitest';
import type { Insets } from 'react-native';
import type * as Real from '../theme/Pressable';
import type { AppPressableProps, ReachLimit } from '../theme/Pressable';

/**
 * A control's reach, in a component test.
 *
 * react-native-web drops `hitSlop` before anything reaches the page, so a
 * test of a primitive cannot read its reach from the DOM. This stands in for
 * `theme/Pressable`: every Pressable is still the real one, drawn as it
 * always is, and as it renders it is noted down under its testID or label
 * with the caps of the `ReachGroup` it sits in. `reachOf(name)` then works
 * its reach out with the real `resolveReach`, so a test checks the very
 * numbers a phone would be given.
 *
 *   vi.mock('../theme/Pressable', () => import('../testing/reach'));
 *   import { reachOf } from '../testing/reach';
 *   expect(reachOf('Close')).toEqual({ top: 9, bottom: 9, left: 9, right: 9 });
 *
 * The path in `vi.mock` is the test file's own way to `theme/Pressable`.
 */

const real = await vi.importActual<typeof Real>('../theme/Pressable');

// everything else the module has, unchanged; Pressable.test.tsx checks that nothing is missing
export const { PRESS_DELAY_MS, TAP_FLASH_MS, QUICK_RELEASE_MS, ReachGroup, ReachReset, useReachLimit, resolveReach } = real;
export type { AppPressableProps, Reach, ReachLimit, ReachSize } from '../theme/Pressable';

interface Drawn {
  props: AppPressableProps;
  limit: ReachLimit;
}

const drawn = new Map<string, Drawn>();

/** The name a pressable is found by: its testID, else what a screen reader calls it. */
function nameOf(props: AppPressableProps): string | undefined {
  return props.testID ?? props.accessibilityLabel ?? props['aria-label'] ?? undefined;
}

export function Pressable(props: AppPressableProps): React.JSX.Element {
  const limit = real.useReachLimit();
  const name = nameOf(props);
  if (name !== undefined) drawn.set(name, { props, limit });
  return <real.Pressable {...props} />;
}

function find(name: string): Drawn {
  const found = drawn.get(name);
  if (!found) throw new Error(`no pressable named "${name}" has been drawn; drawn so far: ${[...drawn.keys()].join(', ') || 'none'}`);
  return found;
}

/** The hitSlop the named pressable is given as it was last drawn: what a phone would answer over past its edges. */
export function reachOf(name: string): Insets | number | undefined {
  const { props, limit } = find(name);
  return real.resolveReach({ ...props, pressDelay: props.pressDelay ?? real.PRESS_DELAY_MS }, limit);
}

/** The props the named pressable was last drawn with, for a test that checks what a primitive passed on. */
export function pressablePropsOf(name: string): AppPressableProps {
  return find(name).props;
}

/** The caps of the group the named pressable sits in, or null. */
export function reachLimitOf(name: string): ReachLimit {
  return find(name).limit;
}

/** Forget every pressable drawn so far, between tests. */
export function forgetReach(): void {
  drawn.clear();
}
