import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo, timing } from './animate';
import { ENTRANCE, duration } from './motion';

/** Which way slides are turning: on to a later one, or back. */
export type SlideDirection = 'forward' | 'back';

/** How far a leaving slide travels before it is gone, in points. */
const LEAVE = 40;

const Leaving = createContext(false);

/**
 * Whether the caller is inside a leaving slide, so something that must not act for a departing slide (an exercise
 * answering for the next one) can drop its callbacks.
 */
export function useSlideLeaving(): boolean {
  return useContext(Leaving);
}

/**
 * One slide giving way to the next, with a direction. The outgoing slide moves out toward the reading direction (the
 * start side going forward, the end side going back, mirrored for right-to-left) and fades, while the incoming one
 * rises into place on the interface spring. Under Reduce Motion they cross-fade.
 *
 * When `id` changes, the last-drawn children are kept as they were and sent off while the new children come in. The
 * showing slide is always the live children, so it keeps updating; only the leaving one is a still. If nothing was
 * showing, whatever was already leaving continues and the next slide arrives over it.
 */
export function SlideSwap({
  id,
  direction,
  mirrored = false,
  held = false,
  children,
  style,
}: {
  id: string;
  direction: SlideDirection;
  /** Right-to-left: forward is to the left. */
  mirrored?: boolean;
  /**
   * The leaving slide is the one that was showing, kept mounted until gone, rather than a still remounted from its last
   * render. A still suits slides that just picture their props (the intro, a sign-in step); slides with their own state
   * or mount effects, like a lesson's exercise, would otherwise reset and re-run them for the next exercise. Held, it
   * leaves exactly as it stood, and `useSlideLeaving` tells its contents.
   */
  held?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const [turn, setTurn] = useState<{ id: string; leaving: { id: string; node: ReactNode; shift: number } | null }>({ id, leaving: null });
  const last = useRef<ReactNode>(children);
  if (turn.id !== id) {
    // The previously shown slide leaves as last drawn, toward the reading direction.
    const shift = (direction === 'forward' ? -1 : 1) * (mirrored ? -1 : 1) * LEAVE;
    const empty = last.current === null || last.current === undefined || last.current === false;
    // Nothing new to send off: whatever was leaving continues, unless it is the very slide now coming back.
    const before = turn.leaving?.id === id ? null : turn.leaving;
    setTurn({ id, leaving: empty ? before : { id: turn.id, node: last.current, shift } });
  }
  last.current = children;
  const leaving = turn.leaving;
  /*
   * Keyed by role and slide, so an arriving slide is not turned into the leaving one: it is released and a still of
   * it mounts instead. A held slide is keyed by the slide alone, so the same pane is told it is now leaving.
   */
  const paneKey = (role: 'in' | 'out', slide: string): string => (held ? `slide-${slide}` : `${role}-${slide}`);

  return (
    <View style={[styles.stack, style]}>
      {leaving ? (
        <Pane key={paneKey('out', leaving.id)} role="out" shift={leaving.shift} onDone={() => setTurn((t) => (t.leaving?.id === leaving.id ? { ...t, leaving: null } : t))}>
          {leaving.node}
        </Pane>
      ) : null}
      {/* The first slide simply appears, since its screen has its own arrival. */}
      <Pane key={paneKey('in', id)} role="in" animate={leaving !== null}>
        {children}
      </Pane>
    </View>
  );
}

/**
 * One slide, arriving or leaving, animating on mount; a still never changes direction. A held slide does: turned
 * from arriving to leaving it goes out from wherever its arrival had reached, and back again likewise.
 */
function Pane({
  role,
  shift = 0,
  animate = true,
  onDone,
  children,
}: {
  role: 'in' | 'out';
  shift?: number;
  animate?: boolean;
  onDone?: () => void;
  children: ReactNode;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const p = useRef(new Animated.Value(role === 'in' && animate ? 0 : 1)).current;
  // Whether the slide is fully in: the first slide from the start; one that began leaving not until it has fully returned.
  const there = useRef(!(role === 'in' && animate));

  useEffect(() => {
    if (role === 'in') {
      if (there.current) return;
      const run = reduce ? timing(p, 1, duration.base) : springTo(p, 1, 'chrome');
      run.start(({ finished }) => {
        if (finished) there.current = true;
      });
      return () => run.stop();
    }
    there.current = false;
    const run = timing(p, 0, duration.base);
    run.start(({ finished }) => {
      if (finished) onDone?.();
    });
    return () => run.stop();
    // On mount, and again each time a held slide changes direction.
  }, [role]);

  const motion = reduce
    ? { opacity: p }
    : role === 'in'
      ? { opacity: p, transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [ENTRANCE.distance * 2, 0] }) }] }
      : { opacity: p, transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [shift, 0] }) }] };
  // A leaving slide names its exit side for tests; nothing on screen reads it.
  const id = role === 'in' ? 'slide-in' : shift < 0 ? 'slide-out-start' : 'slide-out-end';
  // A leaving slide cannot be touched or read by screen readers beside the arriving one.
  const out = role === 'out';
  return (
    <Animated.View
      style={[out ? styles.out : styles.pane, motion]}
      pointerEvents={out ? 'none' : 'auto'}
      accessibilityElementsHidden={out}
      importantForAccessibility={out ? 'no-hide-descendants' : 'auto'}
      aria-hidden={out}
      testID={id}
    >
      <Leaving.Provider value={out}>{children}</Leaving.Provider>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: { flex: 1 },
  pane: { flex: 1 },
  out: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
