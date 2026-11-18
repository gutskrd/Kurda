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
 * The app's Pressable: React Native's own, with a short press delay, a reach that forgives a slightly missed tap,
 * and a press that is always visible.
 *
 * Like system lists, a touch shows as pressed only after staying put for `PRESS_DELAY_MS`, so scrolling does not
 * flicker the controls under the finger; a quick tap still flashes as it lands. Controls outside anything that
 * scrolls (the tab bar) that must answer at once pass `pressDelay={0}`.
 *
 * Every control answers over at least `MIN_REACH` (a11y.ts), computed from the size its style declares
 * (`resolveReach`) and fixed from the first render, since React Native counts a child's hitSlop into its parent's
 * bounds only at the parent's layout. Neighbours closer than that share the gap through a `ReachGroup`, because
 * where reaches overlap the later one takes the tap.
 */
export const PRESS_DELAY_MS = 110;

/** How long a tap too quick to see stays lit, as on the website (web/src/lib/press.ts `TAP_FLASH_MS`). */
export const TAP_FLASH_MS = 120;

/**
 * A release this soon after the press showed means it was never seen. React Native's Pressable holds a press for at
 * least 130 ms on a phone, so this only catches instant releases (the web build).
 */
export const QUICK_RELEASE_MS = 50;

/**
 * How far a control answers past what it draws. `auto` (the default) pads each side up to `MIN_REACH`; `open` also
 * reaches `REACH_OPEN` past every edge, for controls with nothing near (back, close, an empty state's action); `none`
 * answers only over what is drawn.
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
 * Controls closer together than their reach: each reaches at most half the gap toward its neighbours, so reaches
 * meet in the middle and never overlap. `gap` is the horizontal space and `rowGap` the vertical; an undefined side is
 * not capped. It draws nothing, so layout is unchanged. Nested groups apply the tighter cap on each side.
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

/** A fresh start for content drawn elsewhere: a Modal's content is not beside its opener's controls, so their caps do not apply. */
export function ReachReset({ children }: { children: ReactNode }): React.JSX.Element {
  return <ReachContext.Provider value={null}>{children}</ReachContext.Provider>;
}

/** The caps of the nearest `ReachGroup`, or null. */
export function useReachLimit(): ReachLimit {
  return useContext(ReachContext);
}

/** The state a style is read in for its size: at rest, as first drawn. */
const RESTING = { pressed: false, hovered: false, focused: false };

const numeric = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A control's drawn size from its style: width or minWidth, height or minHeight, when they are numbers. */
function drawnSize(style: PressableProps['style']): { width: number | null; height: number | null } {
  const flat: ViewStyle = StyleSheet.flatten(typeof style === 'function' ? style(RESTING) : style) ?? {};
  return { width: numeric(flat.width) ?? numeric(flat.minWidth), height: numeric(flat.height) ?? numeric(flat.minHeight) };
}

/**
 * The hitSlop a Pressable gets, computed once: a caller's own `hitSlop` wins uncapped; `reach="none"` gets none; by
 * default a press that answers at once (`pressDelay={0}`) or a control without `onPress` gets none; otherwise the
 * size (`reachSize` or the style's numbers) gives `reachSlop`, capped by the group. `disabled` changes nothing,
 * since a reach that came and went with it would be clipped at the parent's edge.
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

/** A development aid: with `EXPO_PUBLIC_SHOW_REACH=1` every reach is tinted. Read per render so tests can enable it; builds inline the variable. */
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
  // The same four numbers keep the same object, so the reach is not re-sent to the native view every render.
  const slop = useMemo(() => resolved, [typeof resolved, top, bottom, left, right]);

  /*
   * A tap whose press would otherwise never show. The press shows only after `pressDelay`, so a quicker tap shows it
   * on release, and where release is instant (the web build) it would last no frame, so it stays lit for
   * `TAP_FLASH_MS`. Only styles or children that read `pressed` can show it, so only those wait. A scroll still cancels
   * the press before it shows.
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

  // The web build's Pressable takes the same delay under its own name.
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
 * The reach, drawn: a tinted dashed box out to the hitSlop's edges, behind the control's content and always its last
 * child (tests read the first). The web build ignores hitSlop, so there the box also takes touches and the page
 * answers as a phone would; on a phone it is only an outline.
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
