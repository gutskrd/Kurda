import { useEffect, useRef, useState } from 'react';
import { followPointer, nudge, type Gaze } from './eyes';

const SOURCES = [96, 192, 288].map((size) => `/brand/hevalo-${size}.webp ${size}w`).join(', ');

/**
 * How Hevalo is: looking about (idle), eyes shut (shy: a password is being
 * typed), one eye open a crack (peek: the password is shown), pleased (happy),
 * a shake of the head (sad: that did not work), or thinking it over.
 */
export type MarkMood = 'idle' | 'shy' | 'peek' | 'happy' | 'sad' | 'thinking';

const stillWanted = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Hevalo's icon, whose eyes follow the pointer (eyes.ts). The pictures have
 * no pupils of their own: they are drawn over them where the icon has them,
 * so they can move. `size` is how
 * wide it is shown, in pixels. Decorative beside the name it stands for, so
 * hidden from assistive technology.
 *
 * A `lively` one, the sign-in's, also has lids, so it blinks now and then
 * and can shut its eyes or squint; it floats, leans
 * towards what it looks at, hops when tapped, and takes its `mood`; `gaze`
 * gives it something to look at other than the pointer. For whoever asks for
 * less motion it keeps still, its eyes still closing for a password.
 */
export function HevaloMark({
  size,
  className,
  mood = 'idle',
  gaze,
  lively = false,
}: {
  size: number;
  className?: string;
  mood?: MarkMood;
  gaze?: Gaze;
  lively?: boolean;
}): React.JSX.Element {
  const root = useRef<HTMLSpanElement>(null);
  const left = useRef<HTMLSpanElement>(null);
  const right = useRef<HTMLSpanElement>(null);
  const [blinking, setBlinking] = useState(false);
  const [poked, setPoked] = useState(0);
  const shown: MarkMood = poked && mood === 'idle' ? 'happy' : mood;
  // read on every frame, so the eyes follow a gaze that moves without starting again
  const looking = useRef<{ mood: MarkMood; gaze?: Gaze }>({ mood: shown, gaze });
  looking.current = { mood: shown, gaze };

  useEffect(() => {
    if (!left.current || !right.current) return undefined;
    return followPointer(left.current, right.current, {
      tilt: lively ? root.current : null,
      gaze: () => {
        const { mood: now, gaze: given } = looking.current;
        const box = root.current?.getBoundingClientRect();
        // down at its feet when sorry, up and away when thinking, straight out when pleased
        if (box && now === 'sad') return { x: box.left + box.width / 2, y: box.bottom + box.height * 3 };
        if (box && now === 'thinking') return { x: box.right + box.width * 2, y: box.top - box.height * 1.5 };
        if (now === 'happy') return null;
        return given?.();
      },
    });
  }, [lively]);

  useEffect(() => nudge(), [shown, gaze]);

  // a blink every few seconds, now and then a double one, while it is looking about
  useEffect(() => {
    if (!lively || shown !== 'idle' || stillWanted()) return undefined;
    let timer = 0;
    const next = (): void => {
      timer = window.setTimeout(
        () => {
          setBlinking(true);
          const twice = Math.random() < 0.25;
          timer = window.setTimeout(() => {
            setBlinking(false);
            if (!twice) return next();
            timer = window.setTimeout(() => {
              setBlinking(true);
              timer = window.setTimeout(() => {
                setBlinking(false);
                next();
              }, 120);
            }, 160);
          }, 130);
        },
        2600 + Math.random() * 3400,
      );
    };
    next();
    return () => {
      window.clearTimeout(timer);
      setBlinking(false);
    };
  }, [lively, shown]);

  // a tap is a little hop
  useEffect(() => {
    if (!poked) return undefined;
    const timer = window.setTimeout(() => setPoked(0), 750);
    return () => window.clearTimeout(timer);
  }, [poked]);

  const classes = ['hevalo-mark', lively && 'is-lively', blinking && 'is-blinking', className].filter(Boolean).join(' ');
  return (
    <span
      ref={root}
      className={classes}
      data-mood={shown}
      style={{ width: size, height: size }}
      aria-hidden="true"
      onPointerDown={lively && !stillWanted() ? () => setPoked((n) => n + 1) : undefined}
    >
      <span className="hevalo-head">
        <img src="/brand/hevalo-192.webp" srcSet={SOURCES} sizes={`${size}px`} width={size} height={size} alt="" draggable={false} decoding="async" />
        <span className="hevalo-eye is-left">
          <span ref={left} className="hevalo-pupil" />
        </span>
        <span className="hevalo-eye is-right">
          <span ref={right} className="hevalo-pupil" />
        </span>
        {lively && (
          <>
            <span className="hevalo-lids is-left">
              <span className="hevalo-lid is-top" />
              <span className="hevalo-lid is-bottom" />
            </span>
            <span className="hevalo-lids is-right">
              <span className="hevalo-lid is-top" />
              <span className="hevalo-lid is-bottom" />
            </span>
          </>
        )}
      </span>
    </span>
  );
}
