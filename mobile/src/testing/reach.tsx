import { vi } from 'vitest';
import type { Insets } from 'react-native';
import type * as Real from '../theme/Pressable';
import type { AppPressableProps, ReachLimit } from '../theme/Pressable';

/**
 * Reads a control's reach in component tests. react-native-web drops `hitSlop` before it reaches the DOM, so this
 * stands in for `theme/Pressable`: it renders the real Pressable and records each one under its testID or label
 * with its `ReachGroup` caps, and `reachOf(name)` resolves the reach with the real `resolveReach`.
 *
 *   vi.mock('../theme/Pressable', () => import('../testing/reach'));
 *   import { reachOf } from '../testing/reach';
 *   expect(reachOf('Close')).toEqual({ top: 9, bottom: 9, left: 9, right: 9 });
 */

const real = await vi.importActual<typeof Real>('../theme/Pressable');

// Everything else from the module, unchanged; Pressable.test.tsx checks nothing is missing.
export const { PRESS_DELAY_MS, TAP_FLASH_MS, QUICK_RELEASE_MS, ReachGroup, ReachReset, useReachLimit, resolveReach } = real;
export type { AppPressableProps, Reach, ReachLimit, ReachSize } from '../theme/Pressable';

interface Drawn {
  props: AppPressableProps;
  limit: ReachLimit;
}

const drawn = new Map<string, Drawn>();

/** The name a pressable is found by: its testID, else its accessibility label. */
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

/** The hitSlop the named pressable was last drawn with. */
export function reachOf(name: string): Insets | number | undefined {
  const { props, limit } = find(name);
  return real.resolveReach({ ...props, pressDelay: props.pressDelay ?? real.PRESS_DELAY_MS }, limit);
}

/** The props the named pressable was last drawn with. */
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
