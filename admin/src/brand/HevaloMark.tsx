import { useEffect, useRef, useState } from 'react';
import { BLINK_STEPS, HABITS, type EyeState } from '@kurda/shared';
import { ICON_EYES, PEEK_EYES, followPointer, nudge, type Gaze } from './eyes';
import { Lids, type LidLook } from './Lids';

/**
 * The pictures: the app's icon, square; or Hevalo's head and neck cut out
 * (`peek`, 744 by 710), for standing behind the sign-in card and looking over
 * it. Neither has pupils of its own.
 */
const ART: Record<'icon' | 'peek', { sizes: readonly number[]; file: string; ratio: number; eyes: typeof ICON_EYES; lids: LidLook }> = {
  // the icon's whites glow softly well past their middle (74 by 83 of the 360 for a white of 58 by 68): its lids reach over the glow
  icon: { sizes: [96, 192, 288], file: 'hevalo', ratio: 1, eyes: ICON_EYES, lids: { cover: 1.28, centre: '#d49f68', edge: '#cd935a', soft: true } },
  peek: { sizes: [180, 360, 540], file: 'hevalo-peek', ratio: 810 / 744, eyes: PEEK_EYES, lids: { cover: 1, centre: '#d6a268', edge: '#cf955b', soft: false } },
};

/**
 * How Hevalo is: looking about (idle), eyes shut (shy: a password is being
 * typed), one eye open a crack (peek: the password is shown), pleased (happy),
 * a shake of the head (sad: that did not work), or thinking it over.
 */
export type MarkMood = 'idle' | 'shy' | 'peek' | 'happy' | 'sad' | 'thinking';

/** The eyes each mood has, the left's then the right's, in the Hevalo character's own states. */
const MOOD_EYES: Record<MarkMood, readonly [EyeState, EyeState]> = {
  idle: ['open', 'open'],
  shy: ['closed', 'closed'],
  peek: ['closed', 'half'],
  happy: ['happy', 'happy'],
  sad: ['half', 'half'],
  thinking: ['open', 'open'],
};

const stillWanted = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Hevalo, whose eyes follow the pointer (eyes.ts): the app's icon, or its
 * head and neck (`art`). The pictures have
 * no pupils of their own: they are drawn over them where the icon has them,
 * so they can move. `size` is how
 * wide it is shown, in pixels. Decorative beside the name it stands for, so
 * hidden from assistive technology.
 *
 * A `lively` one, the sign-in's, also has lids, drawn and timed as the
 * Hevalo character's are (Lids.tsx): it blinks now and then, half shut, shut
 * and half shut again, and an eye never jumps from open to shut or back
 * without passing half shut; it floats, leans
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
  art = 'icon',
}: {
  /** how wide it is shown, in pixels */
  size: number;
  className?: string;
  mood?: MarkMood;
  gaze?: Gaze;
  lively?: boolean;
  art?: keyof typeof ART;
}): React.JSX.Element {
  const picture = ART[art];
  const root = useRef<HTMLSpanElement>(null);
  const left = useRef<HTMLSpanElement>(null);
  const right = useRef<HTMLSpanElement>(null);
  // where a blink is: nothing, or a step of it
  const [blink, setBlink] = useState<EyeState | null>(null);
  const [poked, setPoked] = useState(0);
  const shown: MarkMood = poked && mood === 'idle' ? 'happy' : mood;
  // read on every frame, so the eyes follow a gaze that moves without starting again
  const looking = useRef<{ mood: MarkMood; gaze?: Gaze }>({ mood: shown, gaze });
  looking.current = { mood: shown, gaze };

  useEffect(() => {
    if (!left.current || !right.current) return undefined;
    return followPointer(left.current, right.current, {
      eyes: picture.eyes,
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
  }, [lively, picture]);

  useEffect(() => nudge(), [shown, gaze]);

  // a blink every few seconds, now and then a double one, while it is looking about: half shut, shut, half shut
  useEffect(() => {
    if (!lively || shown !== 'idle' || stillWanted()) return undefined;
    let timer = 0;
    const steps = (then: () => void): void => {
      setBlink('half');
      timer = window.setTimeout(() => {
        setBlink('closed');
        timer = window.setTimeout(() => {
          setBlink('half');
          timer = window.setTimeout(() => {
            setBlink(null);
            then();
          }, BLINK_STEPS.half);
        }, BLINK_STEPS.shut);
      }, BLINK_STEPS.half);
    };
    const next = (): void => {
      const [least, most] = HABITS.blink;
      timer = window.setTimeout(
        () => steps(() => (Math.random() < HABITS.doubleBlink ? (timer = window.setTimeout(() => steps(next), 120)) : next())),
        least + Math.random() * (most - least),
      );
    };
    next();
    return () => {
      window.clearTimeout(timer);
      setBlink(null);
    };
  }, [lively, shown]);

  const eyes = useEyes(blink ? [blink, blink] : MOOD_EYES[shown]);

  // a tap is a little hop
  useEffect(() => {
    if (!poked) return undefined;
    const timer = window.setTimeout(() => setPoked(0), 750);
    return () => window.clearTimeout(timer);
  }, [poked]);

  const classes = ['hevalo-mark', art === 'peek' && 'is-peek', lively && 'is-lively', className].filter(Boolean).join(' ');
  const height = Math.round(size * picture.ratio);
  const sources = picture.sizes.map((w) => `/brand/${picture.file}-${w}.webp ${w}w`).join(', ');
  return (
    <span
      ref={root}
      className={classes}
      data-mood={shown}
      style={art === 'peek' ? ({ '--peek-width': `${size}px` } as React.CSSProperties) : { width: size, height: size }}
      aria-hidden="true"
      onPointerDown={lively && !stillWanted() ? () => setPoked((n) => n + 1) : undefined}
    >
      <span className="hevalo-head">
        <img
          src={`/brand/${picture.file}-${picture.sizes[1]}.webp`}
          srcSet={sources}
          sizes={`${size}px`}
          width={size}
          height={height}
          alt=""
          draggable={false}
          decoding="async"
        />
        <span className="hevalo-eye is-left">
          <span ref={left} className="hevalo-pupil" />
        </span>
        <span className="hevalo-eye is-right">
          <span ref={right} className="hevalo-pupil" />
        </span>
        {lively && (
          <>
            <Lids side="left" state={eyes[0]} width={picture.eyes.width} height={picture.eyes.height} look={picture.lids} />
            <Lids side="right" state={eyes[1]} width={picture.eyes.width} height={picture.eyes.height} look={picture.lids} />
          </>
        )}
      </span>
    </span>
  );
}

/**
 * The eyes as shown on the way to `target`: an eye going from open to shut or
 * pleased, or back, is half shut for a moment first, as in a blink; for
 * whoever asks for less motion it goes straight there.
 */
function useEyes(target: readonly [EyeState, EyeState]): readonly [EyeState, EyeState] {
  const [shownEyes, setShownEyes] = useState(target);
  const now = useRef(target);
  const key = target.join(' ');
  useEffect(() => {
    const via = (from: EyeState, to: EyeState): EyeState => (from !== to && from !== 'half' && to !== 'half' ? 'half' : to);
    const step: [EyeState, EyeState] = [via(now.current[0], target[0]), via(now.current[1], target[1])];
    const show = (eyes: readonly [EyeState, EyeState]): void => {
      now.current = eyes;
      setShownEyes(eyes);
    };
    if (stillWanted() || (step[0] === target[0] && step[1] === target[1])) {
      show(target);
      return undefined;
    }
    show(step);
    const timer = window.setTimeout(() => show(target), BLINK_STEPS.half);
    return () => window.clearTimeout(timer);
    // the target is read through its key, so a new array with the same eyes changes nothing
  }, [key]);
  return shownEyes;
}
