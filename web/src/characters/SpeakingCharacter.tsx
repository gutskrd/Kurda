import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ACTS,
  BLINK_STEPS,
  BREATH,
  CHARACTER_NAMES,
  HABITS,
  RESTING,
  SWAY,
  VISEMES,
  between,
  characterArt,
  cropBox,
  eyesFor,
  eyesMiddle,
  glanceTarget,
  lookToward,
  pupilShift,
  sampleKeys,
  speakingFrame,
  voiceTimeline,
  type ActName,
  type CharacterArt,
  type CharacterBox,
  type CharacterCrop,
  type CharacterId,
  type CharacterPoint,
  type EyeState,
  type Keys,
  type LipsyncTimeline,
  type RecordingVoice,
  type SpeakingFrame,
  type Viseme,
} from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { prefersReducedMotion } from '../lib/motion';
import './characters.css';

/** Where the recording plays: the element itself, a ref to it, or a function that finds it. */
export type AudioSource = HTMLAudioElement | null | { readonly current: HTMLAudioElement | null } | (() => HTMLAudioElement | null);

/** Something a character reacts to: an answer that was right, or one that was not yet. */
export type CharacterReaction = 'cheer' | 'hmm';

/** Paused this long, the frame loop stops; the blinks go on with a cheap timer. */
const IDLE_MS = 1200;
/** How often the timer looks at the eyes while nobody speaks: often enough never to miss the shut part of a blink. */
const BLINK_TICK_MS = 60;
/** How long the eyes keep looking where a finger left the screen (ms). */
const LINGER_MS = 1500;

/**
 * The drawing is made once per character under this prefix, and each
 * character on screen takes a copy with the prefix swapped for its own.
 * `characterArt` keeps a drawing for every prefix it is asked for, so asking
 * with a new one for every exercise of a session would keep a drawing for
 * each of them too.
 */
const TEMPLATE = 'sctpl';

const box = (b: CharacterBox): string => `${b.x} ${b.y} ${b.w} ${b.h}`;
const px = (p: CharacterPoint): string => `${p.x}px ${p.y}px`;
/** A group that turns or grows about `p`, in the drawing's own units. */
const about = (p: CharacterPoint): string => ` style="transform-origin:${px(p)}"`;

/**
 * One inline SVG holding every layer: the body, then the head's group with
 * every pair of eyes and all ten mouths, every one hidden but the shown one,
 * so speaking only flips an attribute on two groups. The deer's ears, pupils
 * and nose are groups of their own, so they can move. Resting, three "z"s
 * wait beside the head for the stylesheet to float them up.
 */
function drawing(art: CharacterArt, prefix: string, frame: CharacterBox, crop: CharacterCrop, resting: boolean): string {
  const own = (part: string): string => part.split(`${TEMPLATE}-`).join(`${prefix}-`);
  const hidden = ' visibility="hidden"';
  const feet = { x: frame.x + frame.w / 2, y: art.viewBox.y + art.viewBox.h };
  const rig = art.rig;
  const states: EyeState[] = ['half', 'closed', 'happy'];
  // the deer's eyes are whites and pupils always, with a lid over them for a blink or a smile
  const eyes = rig
    ? own(rig.look.whites) +
      `<g data-pupil="left">${own(rig.look.left.art)}</g><g data-pupil="right">${own(rig.look.right.art)}</g>` +
      '<g data-eyes="open"></g>' +
      states.map((s) => `<g data-eyes="${s}"${hidden}>${own(s === 'half' ? rig.look.half : eyesFor(art, s))}</g>`).join('')
    : `<g data-eyes="open">${own(art.eyes.open)}</g>` + states.map((s) => `<g data-eyes="${s}"${hidden}>${own(eyesFor(art, s))}</g>`).join('');
  const head = rig
    ? own(rig.crown) +
      `<g data-sc="ear-left"${about(rig.ears.left.pivot)}>${own(rig.ears.left.art)}</g>` +
      `<g data-sc="ear-right"${about(rig.ears.right.pivot)}>${own(rig.ears.right.art)}</g>` +
      own(rig.face)
    : own(art.head);
  const nose = rig ? `<g data-sc="nose"${about(rig.sniff)}>${own(art.overlay)}</g>` : own(art.overlay);
  // a soft shadow on the ground under a standing figure
  const shadow =
    crop === 'full'
      ? `<defs><radialGradient id="${prefix}-ground"><stop offset="0" stop-color="#2a1408" stop-opacity="0.3"/><stop offset="1" stop-color="#2a1408" stop-opacity="0"/></radialGradient></defs>` +
        `<ellipse data-sc="shadow" cx="${feet.x}" cy="${feet.y - frame.h * 0.012}" rx="${frame.w * 0.4}" ry="${frame.h * 0.022}" fill="url(#${prefix}-ground)"${about(feet)}/>`
      : '';
  // just above the eyes and to the side, outside the figure's groups so they neither breathe nor dip with it
  const eyesAt = eyesMiddle(art);
  const snooze = resting
    ? '<g class="sc-snooze">' +
      [0, 1, 2]
        .map(
          () =>
            `<text class="sc-z" x="${eyesAt.x + frame.w * 0.16}" y="${eyesAt.y - frame.h * 0.05}" font-size="${frame.h * 0.075}" text-anchor="middle">z</text>`,
        )
        .join('') +
      '</g>'
    : '';
  return (
    // standing on the bottom of its box: a bust's shoulders meet the edge, whatever room is left above
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box(frame)}" width="100%" height="100%" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">` +
    shadow +
    `<g class="sc-breathe"${about(feet)}><g data-sc="hop"${about(feet)}>` +
    own(art.body) +
    `<g data-sc="head"><g class="sc-drift"${about(art.headPivot)}><g data-sc="tilt"${about(art.headPivot)}>` +
    head +
    eyes +
    VISEMES.map((v) => `<g data-mouth="${v}"${v === 'rest' ? '' : hidden}>${own(art.mouths[v])}</g>`).join('') +
    nose +
    '</g></g></g></g></g>' +
    snooze +
    '</svg>'
  );
}

function resolve(audio: AudioSource): HTMLAudioElement | null {
  if (!audio) return null;
  if (typeof audio === 'function') return audio();
  if ('current' in audio) return audio.current;
  return audio;
}

function absolute(src: string): string {
  try {
    return new URL(src, document.baseURI).href;
  } catch {
    return src;
  }
}

/** A track's keys as the frames of a web animation, each value written by `write`. */
function frames(keys: Keys, write: (v: number) => string): Keyframe[] {
  return keys.map(([t, v]) => ({ offset: t, transform: write(v), easing: 'ease-in-out' }));
}

/** The hop: rise and stretch together on one group, sampled at every key either has. */
function hopFrames(rise: Keys | undefined, stretch: Keys | undefined, height: number): Keyframe[] {
  const times = [...new Set([...(rise ?? []).map(([t]) => t), ...(stretch ?? []).map(([t]) => t)])].sort((a, b) => a - b);
  return times.map((t) => {
    const up = rise ? sampleKeys(rise, t) : 0;
    const tall = stretch ? sampleKeys(stretch, t) : 1;
    // a crouch spreads a little and a stretch narrows, as something soft does
    const wide = 1 + (1 - tall) * 0.6;
    return { offset: t, transform: `translateY(${-up * height}px) scale(${wide}, ${tall})`, easing: 'ease-in-out' };
  });
}

export interface SpeakingCharacterProps {
  speaker: CharacterId;
  /** the element the screen already plays the recording through; the character never plays one of its own */
  audio: AudioSource;
  /**
   * The recording this character says. While the element plays another one
   * the character listens, mouth at rest. Leave it out when the element only
   * ever plays this character's recording.
   */
  src?: string | null;
  /** the words being said, for moving the mouth when no timeline was saved with the recording */
  text?: string | null;
  voice?: RecordingVoice | null;
  /** the whole figure, head to waist, or head and shoulders */
  crop?: CharacterCrop;
  /** the height in pixels; left out, the stylesheet sizes it and the drawing keeps its shape */
  size?: number;
  /** a play button beside it already says what is heard: the picture is left out of the accessibility tree */
  decorative?: boolean;
  /** what it has just seen: it reacts each time this changes, and when it arrives with one */
  reaction?: CharacterReaction | null;
  /**
   * Asleep, where there is nothing to do yet (shared `RESTING`): eyes shut,
   * the head dipped, a slower and deeper breath, and a "z" drifting up now
   * and then. No blinks, glances or twitches, and it does not follow the
   * pointer; a click still wakes it for its greeting.
   */
  resting?: boolean;
  /** a click or a tap on the character: it greets you, and then this (say it again, usually) */
  onPress?: () => void;
  className?: string;
}

/**
 * A character saying a recording: Hevalo, Hamo or Xezo, mouth moving in time
 * with the sound the screen is already playing — and, between the words,
 * alive.
 *
 * The drawing is one inline SVG, built once. While the recording plays, a
 * frame loop reads where it is (`currentTime`, so a slowed recording stays in
 * step) and asks the shared `speakingFrame` what the face looks like, then
 * shows that mouth and those eyes and turns the head for the nod — attributes
 * on a few groups, never a React render. The loop stops when the recording
 * has been paused a moment, when the character is off screen or the tab is
 * hidden, and when it goes; a blink now and then runs on a timer meanwhile.
 *
 * Between the words it breathes and its head drifts (a stylesheet animation,
 * running only while it is on screen), it glances about, and the deer
 * twitches an ear or sniffs (shared `HABITS`). Its eyes follow the pointer or
 * a finger. A click gets a greeting and then `onPress`; `reaction` gets a
 * cheer for a right answer and a curious tilt of the head for one that was
 * not yet (shared `ACTS`), played as web animations on the groups. A reader
 * who asked for less motion gets none of that movement: the mouth still
 * moves, since it is part of what is being said, and a reaction still
 * changes the face.
 */
export function SpeakingCharacter({
  speaker,
  audio,
  src = null,
  text = null,
  voice = null,
  crop = 'bust',
  size,
  decorative = false,
  reaction = null,
  resting = false,
  onPress,
  className,
}: SpeakingCharacterProps): React.JSX.Element {
  const t = useT();
  const id = useId();
  const prefix = `sc${id.replace(/[^A-Za-z0-9]/g, '')}`;
  const art = useMemo(() => characterArt(speaker, TEMPLATE), [speaker]);
  const frame = cropBox(art, crop);
  const markup = useMemo(() => ({ __html: drawing(art, prefix, frame, crop, resting) }), [art, prefix, frame, crop, resting]);
  const root = useRef<HTMLSpanElement>(null);
  const source = useRef(audio);
  source.current = audio;
  // blinks count from when the character came on screen, not from each new recording
  const born = useRef<number | null>(null);
  const [talking, setTalking] = useState(false);
  /** set by the effect below: plays an act; a no-op until it has run */
  const play = useRef<(name: ActName) => void>(() => undefined);
  const press = useRef(onPress);
  press.current = onPress;

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    born.current ??= performance.now();
    const bornAt = born.current;
    const q = <T extends Element>(selector: string): T | null => host.querySelector<T>(selector);
    const head = q('[data-sc="head"]');
    const mouths = new Map<string, Element>();
    host.querySelectorAll('[data-mouth]').forEach((g) => mouths.set(g.getAttribute('data-mouth') ?? '', g));
    const eyeGroups = new Map<string, Element>();
    host.querySelectorAll('[data-eyes]').forEach((g) => eyeGroups.set(g.getAttribute('data-eyes') ?? '', g));
    const pupils = { left: q<SVGGElement>('[data-pupil="left"]'), right: q<SVGGElement>('[data-pupil="right"]') };
    const pivot = `${art.headPivot.x} ${art.headPivot.y}`;

    const reduced = { now: prefersReducedMotion() };
    const query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

    // ---- what an act holds, over what speech and the blinks say ----
    const held: { eyes: EyeState | null; mouth: Viseme | null } = { eyes: null, mouth: null };

    // ---- drawing ----
    let shown: SpeakingFrame = { mouth: 'rest', eyes: 'open', nod: 0 };
    const show = (el: Element | null | undefined, on: boolean): void => {
      if (on) el?.removeAttribute('visibility');
      else el?.setAttribute('visibility', 'hidden');
    };
    const draw = (next: SpeakingFrame, force = false): void => {
      const mouth = next.mouth === 'rest' && held.mouth ? held.mouth : next.mouth;
      // asleep the eyes stay shut, but for the face a greeting puts on
      const eyes = held.eyes ?? (resting ? 'closed' : next.eyes);
      // and the head stays dipped to one side
      const nod = next.nod + (resting ? RESTING.dip : 0);
      if (force || mouth !== shown.mouth) {
        if (force) mouths.forEach((g, v) => show(g, v === mouth));
        else {
          show(mouths.get(shown.mouth), false);
          show(mouths.get(mouth), true);
        }
      }
      if (force || eyes !== shown.eyes) eyeGroups.forEach((g, state) => show(g, state === eyes));
      if (force || nod !== shown.nod) {
        if (nod === 0) head?.removeAttribute('transform');
        else head?.setAttribute('transform', `rotate(${nod} ${pivot})`);
      }
      shown = { mouth, eyes, nod };
    };
    // the same markup may still show the last recording's face
    draw(shown, true);

    // ---- the recording ----
    const wanted = src ? absolute(src) : null;
    let el: HTMLAudioElement | null = null;
    const mine = (a: HTMLAudioElement): boolean => !src || a.src === src || a.src === wanted;
    const speaking = (): boolean => !!el && mine(el) && !el.paused && !el.ended;
    let timeline: LipsyncTimeline | null = voiceTimeline(voice, text, null);
    // a timeline made from the words needs the recording's length first
    let measuring = timeline === null && !!text?.trim();
    const measure = (): void => {
      if (!measuring || !el || !mine(el) || !(el.readyState >= 1)) return;
      const seconds = el.duration;
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      timeline = voiceTimeline(voice, text, seconds * 1000);
      measuring = false;
    };

    // ---- the loops ----
    let loop = 0;
    let blinker = 0;
    let idleSince: number | null = null;
    let onScreen = true;
    const awake = (): boolean => onScreen && !document.hidden;

    const face = (playing: boolean): SpeakingFrame =>
      speakingFrame({
        timeline,
        ms: el && playing ? el.currentTime * 1000 : 0,
        playing,
        sinceMs: performance.now() - bornAt,
        reducedMotion: reduced.now,
      });

    const stopBlinking = (): void => {
      if (blinker) window.clearInterval(blinker);
      blinker = 0;
    };
    const stopLoop = (): void => {
      if (loop) cancelAnimationFrame(loop);
      loop = 0;
    };
    const tick = (): void => {
      loop = 0;
      measure();
      const playing = speaking();
      draw(face(playing));
      const now = performance.now();
      if (playing) idleSince = null;
      else idleSince ??= now;
      if (idleSince !== null && now - idleSince >= IDLE_MS) {
        idleSince = null;
        blink();
        return;
      }
      loop = requestAnimationFrame(tick);
    };
    const wake = (): void => {
      if (!awake()) return;
      stopBlinking();
      idleSince = null;
      if (!loop) loop = requestAnimationFrame(tick);
    };
    function blink(): void {
      // nothing to blink with the eyes shut
      if (!awake() || blinker || resting) return;
      blinker = window.setInterval(() => {
        // a recording started on an element this has not heard from yet
        bind();
        if (speaking()) wake();
        else draw(face(false));
      }, BLINK_TICK_MS);
    }

    // ---- looking ----
    let following = false;
    const look = (where: CharacterPoint | null): void => {
      if (!pupils.left || !pupils.right) return;
      if (!where) {
        pupils.left.style.transform = '';
        pupils.right.style.transform = '';
        return;
      }
      const shift = pupilShift(art, where, 1);
      pupils.left.style.transform = `translate(${shift.left.x}px, ${shift.left.y}px)`;
      pupils.right.style.transform = `translate(${shift.right.x}px, ${shift.right.y}px)`;
    };
    const middle = eyesMiddle(art);
    const aim = (x: number, y: number): void => {
      if (!awake()) return;
      const r = host.getBoundingClientRect();
      if (r.width === 0) return;
      // where the eyes are on the page, through the box the drawing fills (it keeps its shape, so the box is the frame)
      const ex = r.left + ((middle.x - frame.x) / frame.w) * r.width;
      const ey = r.top + ((middle.y - frame.y) / frame.h) * r.height;
      following = true;
      look(lookToward(x - ex, y - ey, Math.max(r.width, r.height) * 1.2));
    };
    // ---- moving: acts as web animations, the rest as a stylesheet animation ----
    const can = (g: Element | null): g is Element & { animate: Element['animate'] } => !!g && typeof (g as Element).animate === 'function';
    const groups = {
      hop: q('[data-sc="hop"]'),
      tilt: q('[data-sc="tilt"]'),
      earLeft: q('[data-sc="ear-left"]'),
      earRight: q('[data-sc="ear-right"]'),
      nose: q('[data-sc="nose"]'),
      shadow: q('[data-sc="shadow"]'),
    };
    const running: Animation[] = [];
    const holds: number[] = [];
    const stopAct = (): void => {
      running.splice(0).forEach((a) => a.cancel());
      holds.splice(0).forEach((h) => window.clearTimeout(h));
      held.eyes = null;
      held.mouth = null;
    };
    const run = (g: Element | null, keyframes: Keyframe[], ms: number): void => {
      if (!can(g) || keyframes.length < 2) return;
      running.push(g.animate(keyframes, { duration: ms, fill: 'none' }));
    };
    const redraw = (): void => draw(speaking() ? face(true) : face(false));
    const act = (name: ActName): void => {
      const a = ACTS[name];
      stopAct();
      if (!reduced.now) {
        if (art.rig) {
          if (a.earLeft) run(groups.earLeft, frames(a.earLeft, (v) => `rotate(${v}deg)`), a.ms);
          if (a.earRight) run(groups.earRight, frames(a.earRight, (v) => `rotate(${-v}deg)`), a.ms);
          if (a.sniff) run(groups.nose, frames(a.sniff, (v) => `scale(${v})`), a.ms);
        }
        if (a.rise || a.stretch) run(groups.hop, hopFrames(a.rise, a.stretch, art.viewBox.h), a.ms);
        if (a.rise && groups.shadow) run(groups.shadow, frames(a.rise, (v) => `scale(${1 - v * 4}, 1)`), a.ms);
        if (a.tilt) run(groups.tilt, frames(a.tilt, (v) => `rotate(${v}deg)`), a.ms);
        if (a.look && art.rig) {
          look(a.look);
          holds.push(window.setTimeout(() => (following ? undefined : look(null)), a.ms * 0.8));
        }
      }
      const hold = <T,>(spans: readonly (readonly [number, number, T])[] | undefined, set: (v: T | null) => void): void => {
        for (const [from, to, value] of spans ?? []) {
          holds.push(window.setTimeout(() => (set(value), redraw()), from * a.ms));
          holds.push(window.setTimeout(() => (set(null), redraw()), to * a.ms));
        }
      };
      hold(a.eyes, (v) => (held.eyes = v));
      hold(a.mouth, (v) => (held.mouth = v));
    };
    play.current = act;

    let release = 0;
    const onPointer = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch') aim(e.clientX, e.clientY);
    };
    const onTouch = (e: TouchEvent): void => {
      const touch = e.touches[0];
      if (!touch) return;
      window.clearTimeout(release);
      aim(touch.clientX, touch.clientY);
    };
    const onLift = (): void => {
      window.clearTimeout(release);
      release = window.setTimeout(() => {
        following = false;
        look(null);
      }, LINGER_MS);
    };
    const onLeave = (): void => {
      following = false;
      look(null);
    };
    const gazing = !!art.rig && !resting;
    const listen = (on: boolean): void => {
      if (!gazing) return;
      const method = on ? 'addEventListener' : 'removeEventListener';
      window[method]('pointermove', onPointer as EventListener, { passive: true } as AddEventListenerOptions);
      window[method]('touchstart', onTouch as EventListener, { passive: true } as AddEventListenerOptions);
      window[method]('touchmove', onTouch as EventListener, { passive: true } as AddEventListenerOptions);
      window[method]('touchend', onLift, { passive: true } as AddEventListenerOptions);
      window[method]('touchcancel', onLift, { passive: true } as AddEventListenerOptions);
      document.documentElement[method]('pointerleave', onLeave);
    };

    // ---- habits ----
    let habits: number[] = [];
    const stopHabits = (): void => {
      habits.forEach((h) => window.clearTimeout(h));
      habits = [];
    };
    const every = (range: readonly [number, number], fn: () => void): void => {
      const next = (): void => {
        habits.push(
          window.setTimeout(() => {
            fn();
            next();
          }, between(range)),
        );
      };
      next();
    };
    const startHabits = (): void => {
      stopHabits();
      if (!awake() || reduced.now || !art.rig || resting) return;
      every(HABITS.glance, () => {
        if (following || running.some((a) => a.playState === 'running')) return;
        look(glanceTarget());
        habits.push(window.setTimeout(() => (following ? undefined : look(null)), between(HABITS.glanceHold)));
      });
      every(HABITS.twitch, () => (running.some((a) => a.playState === 'running') ? undefined : act(Math.random() < 0.5 ? 'twitchLeft' : 'twitchRight')));
      every(HABITS.sniff, () => (running.some((a) => a.playState === 'running') ? undefined : act('sniff')));
    };

    // the breath and the drift run only while the character can be seen and the reader wants motion
    const alive = (): void => {
      host.classList.toggle('is-alive', awake() && !reduced.now);
    };

    const resume = (): void => {
      bind();
      alive();
      if (!awake()) {
        stopLoop();
        stopBlinking();
        stopHabits();
      } else {
        if (speaking()) wake();
        else if (!loop) blink();
        if (habits.length === 0) startHabits();
      }
    };

    const onMotion = (): void => {
      reduced.now = query?.matches === true;
      alive();
      startHabits();
    };
    query?.addEventListener?.('change', onMotion);

    // ---- listening to the element ----
    // `data-speaking` lets the place it sits in light up while it speaks, with no render
    const onStart = (): void => {
      if (!el || !mine(el)) return;
      measure();
      host.setAttribute('data-speaking', '');
      if (!decorative) setTalking(true);
      wake();
    };
    const onStop = (): void => {
      host.removeAttribute('data-speaking');
      if (!decorative) setTalking(false);
    };
    const onLength = (): void => measure();
    // the element can come later than the character (the app's player is made on the first play)
    const bind = (): void => {
      const next = resolve(source.current);
      if (next === el) return;
      unbind();
      el = next;
      if (!el) return;
      el.addEventListener('play', onStart);
      el.addEventListener('playing', onStart);
      el.addEventListener('pause', onStop);
      el.addEventListener('ended', onStop);
      el.addEventListener('emptied', onStop);
      el.addEventListener('loadedmetadata', onLength);
      el.addEventListener('durationchange', onLength);
      if (speaking()) onStart();
    };
    function unbind(): void {
      if (!el) return;
      el.removeEventListener('play', onStart);
      el.removeEventListener('playing', onStart);
      el.removeEventListener('pause', onStop);
      el.removeEventListener('ended', onStop);
      el.removeEventListener('emptied', onStop);
      el.removeEventListener('loadedmetadata', onLength);
      el.removeEventListener('durationchange', onLength);
    }
    bind();
    measure();
    if (!speaking()) onStop();

    // ---- on screen or not ----
    const watcher =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            const entry = entries[entries.length - 1];
            if (!entry) return;
            onScreen = entry.isIntersecting;
            resume();
          })
        : null;
    watcher?.observe(host);
    document.addEventListener('visibilitychange', resume);
    listen(true);
    resume();

    return () => {
      stopLoop();
      stopBlinking();
      stopHabits();
      stopAct();
      window.clearTimeout(release);
      listen(false);
      unbind();
      watcher?.disconnect();
      document.removeEventListener('visibilitychange', resume);
      query?.removeEventListener?.('change', onMotion);
      play.current = () => undefined;
    };
  }, [markup, art, frame, src, text, voice, decorative, resting]);

  // a reaction plays when it is given, and each time it changes; the deer pricks up his ears on arriving
  const arrived = useRef(false);
  useEffect(() => {
    const wait = window.setTimeout(() => {
      if (reaction) play.current(reaction);
      else if (!arrived.current && art.rig && !resting) play.current('arrive');
      arrived.current = true;
    }, reaction ? 120 : 160);
    return () => window.clearTimeout(wait);
  }, [reaction, art, resting]);

  const name = CHARACTER_NAMES[speaker];
  const style = {
    aspectRatio: `${frame.w} / ${frame.h}`,
    // the breath and the drift, from the shared numbers, for the stylesheet's animations
    '--sc-breath-ms': `${resting ? RESTING.breathMs : BREATH.ms}ms`,
    '--sc-breath': `${1 + (resting ? RESTING.depth : BREATH.depth)}`,
    '--sc-sway-ms': `${SWAY.ms}ms`,
    '--sc-sway': `${SWAY.degrees}deg`,
    '--sc-blink-ms': `${BLINK_STEPS.shut}ms`,
    // the "z"s: how often, and how far up and aside each goes, in the drawing's own units
    '--sc-z-ms': `${RESTING.zMs}ms`,
    '--sc-z-rise': `${-frame.h * RESTING.zRise}px`,
    '--sc-z-drift': `${frame.h * RESTING.zRise * 0.45}px`,
  } as React.CSSProperties;
  if (size) {
    style.height = size;
    style.width = (size * frame.w) / frame.h;
  }
  const greet = onPress
    ? () => {
        play.current('greet');
        press.current?.();
      }
    : undefined;
  return (
    <span
      ref={root}
      className={`speaking-character${onPress ? ' is-pressable' : ''}${resting ? ' is-resting' : ''}${className ? ` ${className}` : ''}`}
      data-speaker={speaker}
      data-crop={crop}
      style={style}
      onClick={greet}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': resting ? t('characters.resting', { name }) : talking ? t('character.speaking', { name }) : name })}
      dangerouslySetInnerHTML={markup}
    />
  );
}
