import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo, timing } from './animate';
import { ENTRANCE, duration } from './motion';

/** Which way a set of slides is turning: on to a later one, or back to an earlier. */
export type SlideDirection = 'forward' | 'back';

/** How far a slide that is leaving travels before it is gone, in points. */
const LEAVE = 40;

const Leaving = createContext(false);

/**
 * Whether what asks is drawn in a slide on its way out.
 *
 * A slide that is leaving is still on screen for a moment, and whatever is
 * in it still has its callbacks in hand. Something that should not act for
 * a slide that is going (an exercise answering for the one after it) asks
 * here and lets go of them.
 */
export function useSlideLeaving(): boolean {
  return useContext(Leaving);
}

/**
 * One slide giving way to the next, with a direction.
 *
 * The intro's slides used to swap between two frames: the language list
 * gone, the welcome there, nothing to say which way anybody went. Now the
 * slide that was showing moves out the way the reader is going — to the
 * start side going on, to the end side going back, the other way round in a
 * language read from the right — and fades as it goes, while the one
 * arriving rises into its place on the standard spring, the way a row rises
 * into a list. Under Reduce Motion the two cross-fade and nothing travels.
 *
 * `id` names the slide showing; when it changes, the children drawn last
 * are kept as they were and sent off, and the new children come in. The
 * slide showing is always the live children, so it goes on updating — a
 * language chosen on the first slide is shown chosen — and only the one
 * leaving is a still of itself.
 *
 * A slide that showed nothing has nothing to send off: whatever was already
 * leaving goes on leaving, and the next slide arrives over it.
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
  /** read from the right: forward is to the left */
  mirrored?: boolean;
  /**
   * The slide that leaves is the one that was showing, kept mounted until it
   * has gone, rather than a still mounted afresh from what it last drew.
   *
   * A still is right for a slide that is a picture of its props: the intro,
   * a step of signing in. It is wrong for one that keeps something of its
   * own or does something as it mounts, like a lesson's exercise: mounted
   * again, the tiles laid on its line would be back in the bank, its clip
   * would load a second time, and what it does on mounting would be done
   * for the exercise after it. Held, it leaves exactly as it stood, and
   * `useSlideLeaving` tells what is in it that it is going.
   */
  held?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const [turn, setTurn] = useState<{ id: string; leaving: { id: string; node: ReactNode; shift: number } | null }>({ id, leaving: null });
  const last = useRef<ReactNode>(children);
  if (turn.id !== id) {
    // the slide shown until now leaves, as it was last drawn, the way the reader is going
    const shift = (direction === 'forward' ? -1 : 1) * (mirrored ? -1 : 1) * LEAVE;
    const empty = last.current === null || last.current === undefined || last.current === false;
    setTurn({ id, leaving: empty ? turn.leaving : { id: turn.id, node: last.current, shift } });
  }
  last.current = children;
  const leaving = turn.leaving;
  /*
   * Keyed by role as well as by slide, so the slide that was arriving is not
   * turned into the one leaving: it is let go and a still of it mounts in its
   * place. A held slide is keyed by the slide alone, which is what keeps it:
   * the same pane is told it is now the one going out.
   */
  const paneKey = (role: 'in' | 'out', slide: string): string => (held ? `slide-${slide}` : `${role}-${slide}`);

  return (
    <View style={[styles.stack, style]}>
      {leaving ? (
        <Pane key={paneKey('out', leaving.id)} role="out" shift={leaving.shift} onDone={() => setTurn((t) => (t.leaving?.id === leaving.id ? { ...t, leaving: null } : t))}>
          {leaving.node}
        </Pane>
      ) : null}
      {/* the first slide is simply there: the screen it is on has an arrival of its own */}
      <Pane key={paneKey('in', id)} role="in" animate={leaving !== null}>
        {children}
      </Pane>
    </View>
  );
}

/**
 * One slide, arriving or leaving. It plays as it mounts, and a still never
 * changes its mind; a held slide changes it once, from arriving to leaving,
 * and goes out from wherever its arrival had got to.
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

  useEffect(() => {
    if (role === 'in') {
      if (!animate) return;
      const run = reduce ? timing(p, 1, duration.base) : springTo(p, 1, 'standard');
      run.start();
      return () => run.stop();
    }
    const run = timing(p, 0, duration.base);
    run.start(({ finished }) => {
      if (finished) onDone?.();
    });
    return () => run.stop();
    // as it mounts, and once more if a held slide is turned from arriving to leaving
  }, [role]);

  const motion = reduce
    ? { opacity: p }
    : role === 'in'
      ? { opacity: p, transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [ENTRANCE.distance * 2, 0] }) }] }
      : { opacity: p, transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [shift, 0] }) }] };
  // a leaving slide says which side it leaves by, for the tests: nothing on screen reads it
  const id = role === 'in' ? 'slide-in' : shift < 0 ? 'slide-out-start' : 'slide-out-end';
  // a slide on its way out is not there to be touched, or read out by a screen reader beside the one arriving
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
