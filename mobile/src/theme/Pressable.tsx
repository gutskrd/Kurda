import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import {
  Platform,
  Pressable as NativePressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type Insets,
  type PressableProps,
  type PressableStateCallbackType,
  type ViewStyle,
} from 'react-native';
import { REACH_OPEN, reachSlop, type HitSlop } from '../a11y/a11y';

/**
 * The app's Pressable: React Native's own, with the moment a press shows
 * held back a little after the finger lands, a reach that answers a finger a
 * little off the mark, and a press that is always seen.
 *
 * A finger that lands on a button to scroll the list it sits in used to
 * light the button up at once, so every scroll flickered the rows and
 * buttons under it. The systems' own lists wait a beat before they show a
 * press (a scroll view on iOS delays its content's touches; Android has its
 * tap timeout), and in that beat a finger that is scrolling has moved and
 * the press is called off. This does the same: a touch shows as pressed only
 * once it has stayed put for `PRESS_DELAY_MS`, and a quick tap still shows,
 * for an instant, as it lands. A press that has to answer the moment the
 * finger is down, outside anything that scrolls (the tab bar, a card held to
 * be read), passes `pressDelay={0}`.
 *
 * A fingertip lands a few points from where the eye aimed, so every control
 * answers over at least `MIN_REACH` (a11y.ts), worked out here from the size
 * its style already declares (`resolveReach`). It is fixed from the first
 * render: React Native counts a child's hitSlop into its parent's bounds only
 * when the parent lays out, so a reach that arrived later (from a
 * measurement, or with `disabled`) would be cut off at the parent's edge.
 * Neighbours closer than that share the gap between them through a
 * `ReachGroup`, because where two reaches overlap the later one takes the tap.
 */
export const PRESS_DELAY_MS = 110;

/** How long a tap too quick to see stays lit: the website's own (web/src/lib/press.ts `TAP_FLASH_MS`). */
export const TAP_FLASH_MS = 120;

/**
 * A release this soon after the press showed means the press was never seen.
 * React Native's own Pressable holds a press for at least 130 ms on a phone,
 * so there this only catches what lets go at once (the browser build).
 */
export const QUICK_RELEASE_MS = 50;

/**
 * How far a control answers past what it draws. `auto` (the default) pads
 * each side up to `MIN_REACH`; `open` also reaches `REACH_OPEN` past every
 * edge, for a control with nothing near it (back, close, an empty state's
 * action); `none` answers only over what is drawn.
 */
export type Reach = 'auto' | 'open' | 'none';

/** The drawn size of a control whose style does not state it, for its reach. */
export interface ReachSize {
  width?: number;
  height?: number;
}

/** The most each side may reach, from the nearest `ReachGroup`; null caps nothing. */
export type ReachLimit = Partial<HitSlop> | null;

export type AppPressableProps = PressableProps & {
  ref?: Ref<View>;
  pressDelay?: number;
  reach?: Reach;
  reachSize?: ReachSize;
};

const ReachContext = createContext<ReachLimit>(null);

/** The tighter of two caps, side by side; a side neither caps stays uncapped. */
function tighter(outer: ReachLimit, inner: ReachLimit): ReachLimit {
  if (!outer) return inner;
  if (!inner) return outer;
  const side = (a: number | undefined, b: number | undefined): number | undefined => (a === undefined ? b : b === undefined ? a : Math.min(a, b));
  return {
    top: side(outer.top, inner.top),
    bottom: side(outer.bottom, inner.bottom),
    left: side(outer.left, inner.left),
    right: side(outer.right, inner.right),
  };
}

/**
 * Controls that stand closer together than their reach: each one reaches at
 * most half of the gap toward its neighbours, so two reaches meet in the
 * middle of the gap and never overlap. `gap` is the space between them side
 * by side and `rowGap` the space between rows; a side left undefined is not
 * capped here. It draws nothing of its own, so it changes no layout. Inside
 * another group the tighter cap of the two holds on each side, because the
 * controls at the edge of the inner group are still near the outer one's.
 */
export function ReachGroup({ gap, rowGap, children }: { gap?: number; rowGap?: number; children: ReactNode }): React.JSX.Element {
  const outer = useContext(ReachContext);
  const limit = useMemo(() => {
    const across = gap === undefined ? undefined : gap / 2;
    const down = rowGap === undefined ? undefined : rowGap / 2;
    return tighter(outer, { top: down, bottom: down, left: across, right: across });
  }, [outer, gap, rowGap]);
  return <ReachContext.Provider value={limit}>{children}</ReachContext.Provider>;
}

/**
 * A fresh start for what is drawn somewhere else: a Modal's content is not
 * beside the controls of the screen it was opened from, so their group's caps
 * do not reach into it.
 */
export function ReachReset({ children }: { children: ReactNode }): React.JSX.Element {
  return <ReachContext.Provider value={null}>{children}</ReachContext.Provider>;
}

/** The caps of the nearest `ReachGroup`, or null. */
export function useReachLimit(): ReachLimit {
  return useContext(ReachContext);
}

/** The state a style is read in for its size: at rest, as it is first drawn. */
const RESTING = { pressed: false, hovered: false, focused: false };

const numeric = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** What a style says the control is drawn at: its width or minWidth, its height or minHeight, when they are numbers. */
function drawnSize(style: PressableProps['style']): { width: number | null; height: number | null } {
  const flat: ViewStyle = StyleSheet.flatten(typeof style === 'function' ? style(RESTING) : style) ?? {};
  return { width: numeric(flat.width) ?? numeric(flat.minWidth), height: numeric(flat.height) ?? numeric(flat.minHeight) };
}

/**
 * The hitSlop a Pressable gets, worked out once from what it already says:
 *
 * 1. a `hitSlop` the caller wrote wins as it is, uncapped;
 * 2. `reach="none"` gets none;
 * 3. by default, a press that answers at once (`pressDelay={0}`, which sets
 *    its own) or a control with no `onPress` (a long-press-only row, often
 *    2pt from the next) gets none;
 * 4. otherwise the size is `reachSize`, or the numbers its style declares,
 *    and the reach is `reachSlop` of it, capped by the group.
 *
 * `disabled` changes nothing: a reach that came and went with it would be
 * cut off at the parent's edge (see the header).
 */
export function resolveReach(
  props: Pick<AppPressableProps, 'hitSlop' | 'reach' | 'reachSize' | 'pressDelay' | 'onPress' | 'style'>,
  limit: ReachLimit,
): Insets | number | undefined {
  if (props.hitSlop !== undefined) return props.hitSlop ?? undefined;
  const reach = props.reach ?? 'auto';
  if (reach === 'none') return undefined;
  if (reach === 'auto' && (props.pressDelay === 0 || props.onPress == null)) return undefined;
  const drawn = drawnSize(props.style);
  const slop = reachSlop(props.reachSize?.width ?? drawn.width, props.reachSize?.height ?? drawn.height, {
    edge: reach === 'open' ? REACH_OPEN : 0,
    limit,
  });
  return slop.top || slop.bottom || slop.left || slop.right ? slop : undefined;
}

/** The four sides of a hitSlop, however it was written. */
function sides(slop: Insets | number | undefined): [number, number, number, number] {
  if (slop === undefined) return [0, 0, 0, 0];
  if (typeof slop === 'number') return [slop, slop, slop, slop];
  return [slop.top ?? 0, slop.bottom ?? 0, slop.left ?? 0, slop.right ?? 0];
}

/**
 * A development aid: with `EXPO_PUBLIC_SHOW_REACH=1` every reach is tinted.
 * Read as it renders rather than once, so a test can turn it on; a build
 * inlines the variable, so the check costs nothing there.
 */
function showReach(): boolean {
  return process.env.EXPO_PUBLIC_SHOW_REACH === '1';
}

export function Pressable({
  ref,
  pressDelay = PRESS_DELAY_MS,
  reach,
  reachSize,
  hitSlop,
  style,
  children,
  onPressIn,
  onPressOut,
  ...props
}: AppPressableProps): React.JSX.Element {
  const limit = useReachLimit();
  const resolved = resolveReach({ hitSlop, reach, reachSize, pressDelay, onPress: props.onPress, style }, limit);
  const [top, bottom, left, right] = sides(resolved);
  // the same four numbers keep the same object, so the reach is not re-sent to the native view every render
  const slop = useMemo(() => resolved, [typeof resolved, top, bottom, left, right]);

  /*
   * A tap whose press would otherwise never be seen. The press shows only
   * after `pressDelay`, so a quicker tap shows it as it lets go, and where
   * the release follows at once (the browser build) the press would last no
   * frame at all. It stays lit for `TAP_FLASH_MS`, the website's flash. Only
   * a style or children that read `pressed` can show it, so only those wait.
   * A scroll still calls the press off before it shows, so nothing lights.
   */
  const readsPressed = typeof style === 'function' || typeof children === 'function';
  const [flash, setFlash] = useState(false);
  const pressedAt = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );
  const lit = (state: PressableStateCallbackType): PressableStateCallbackType => (flash && !state.pressed ? { ...state, pressed: true } : state);
  const handlers = readsPressed
    ? {
        onPressIn: (e: GestureResponderEvent): void => {
          pressedAt.current = Date.now();
          onPressIn?.(e);
        },
        onPressOut: (e: GestureResponderEvent): void => {
          if (Date.now() - pressedAt.current < QUICK_RELEASE_MS) {
            if (flashTimer.current) clearTimeout(flashTimer.current);
            setFlash(true);
            flashTimer.current = setTimeout(() => {
              flashTimer.current = null;
              setFlash(false);
            }, TAP_FLASH_MS);
          }
          onPressOut?.(e);
        },
      }
    : { onPressIn, onPressOut };

  const overlay = showReach() && slop !== undefined ? <ReachShim top={top} bottom={bottom} left={left} right={right} /> : null;
  const drawn =
    typeof children === 'function'
      ? (state: PressableStateCallbackType): ReactNode =>
          overlay ? (
            <>
              {children(lit(state))}
              {overlay}
            </>
          ) : (
            children(lit(state))
          )
      : overlay
        ? (
            <>
              {children}
              {overlay}
            </>
          )
        : children;

  // the browser build's Pressable takes the same wait under its own name
  const web = Platform.OS === 'web' ? ({ delayPressIn: pressDelay } as Record<string, number>) : null;
  return (
    <NativePressable
      unstable_pressDelay={pressDelay}
      {...web}
      {...props}
      {...handlers}
      hitSlop={slop}
      style={typeof style === 'function' ? (state) => style(lit(state)) : style}
      ref={ref}
    >
      {drawn}
    </NativePressable>
  );
}

/**
 * The reach, drawn: a tinted, dashed box out to the edges of the hitSlop,
 * behind the control's own content and always its last child (tests read a
 * control's first). The browser build ignores hitSlop, so there the box also
 * takes touches, and the page answers as a phone would and can be probed; on
 * a phone it is only an outline.
 */
function ReachShim({ top, bottom, left, right }: { top: number; bottom: number; left: number; right: number }): React.JSX.Element {
  return (
    <View
      {...({ dataSet: { reach: '1' } } as object)}
      accessible={false}
      aria-hidden
      style={[styles.shim, { top: -top, bottom: -bottom, left: -left, right: -right }]}
    />
  );
}

const styles = StyleSheet.create({
  shim: {
    pointerEvents: Platform.OS === 'web' ? 'auto' : 'none',
    position: 'absolute',
    zIndex: -1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#ff0080',
    backgroundColor: 'rgba(255,0,128,0.12)',
  },
});
