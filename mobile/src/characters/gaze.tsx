import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

/** Where a finger is on the screen, in the window's points; null when there is none. */
export type GazePoint = { x: number; y: number } | null;

export interface GazeSource {
  /** told of every finger that touches or moves, and of null a moment after the last one lifts */
  subscribe(listener: (point: GazePoint) => void): () => void;
}

const GazeContext = createContext<GazeSource | null>(null);

/** How long the characters keep looking where a finger left the screen (ms). */
export const GAZE_LINGER_MS = 1500;

/**
 * Lets the characters on screen see a finger: wrap the app in it, and a
 * character's eyes follow wherever somebody touches — a button, the field
 * they are typing in, the character itself — and wander back a moment after
 * the finger lifts.
 *
 * It only listens. The raw touch events bubble up to it from whatever was
 * touched, so it never takes a touch, never stands in a scroll's way and
 * needs nothing from the screens inside it. With no character on screen
 * nobody is listening, and a touch costs a function call.
 */
export function GazeArea({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const listeners = useRef(new Set<(point: GazePoint) => void>());
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  const source = useMemo<GazeSource>(
    () => ({
      subscribe(listener) {
        listeners.current.add(listener);
        return () => {
          listeners.current.delete(listener);
        };
      },
    }),
    [],
  );
  const tell = (point: GazePoint): void => {
    for (const listener of listeners.current) listener(point);
  };
  const touch = (e: GestureResponderEvent): void => {
    if (listeners.current.size === 0) return;
    if (release.current) clearTimeout(release.current);
    release.current = null;
    const { pageX, pageY } = e.nativeEvent;
    if (Number.isFinite(pageX) && Number.isFinite(pageY)) tell({ x: pageX, y: pageY });
  };
  const lift = (): void => {
    if (listeners.current.size === 0) return;
    if (release.current) clearTimeout(release.current);
    release.current = setTimeout(() => {
      release.current = null;
      tell(null);
    }, GAZE_LINGER_MS);
  };
  return (
    <GazeContext.Provider value={source}>
      <View style={style} onTouchStart={touch} onTouchMove={touch} onTouchEnd={lift} onTouchCancel={lift}>
        {children}
      </View>
    </GazeContext.Provider>
  );
}

/** The finger the characters can see, or null outside a `GazeArea`. */
export function useGaze(): GazeSource | null {
  return useContext(GazeContext);
}
