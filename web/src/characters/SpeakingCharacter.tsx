import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  CHARACTER_NAMES,
  VISEMES,
  characterArt,
  speakingFrame,
  voiceTimeline,
  type CharacterArt,
  type CharacterBox,
  type CharacterId,
  type LipsyncTimeline,
  type RecordingVoice,
  type SpeakingFrame,
} from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { prefersReducedMotion } from '../lib/motion';
import './characters.css';

/** Where the recording plays: the element itself, a ref to it, or a function that finds it. */
export type AudioSource = HTMLAudioElement | null | { readonly current: HTMLAudioElement | null } | (() => HTMLAudioElement | null);

/** Paused this long, the frame loop stops; the blinks go on with a cheap timer. */
const IDLE_MS = 1200;
/** How often the timer looks at the eyes while nobody speaks: often enough never to miss a blink (BLINK_MS). */
const BLINK_TICK_MS = 60;

/**
 * The drawing is made once per character under this prefix, and each
 * character on screen takes a copy with the prefix swapped for its own.
 * `characterArt` keeps a drawing for every prefix it is asked for, so asking
 * with a new one for every exercise of a session would keep a drawing for
 * each of them too.
 */
const TEMPLATE = 'sctpl';

const box = (b: CharacterBox): string => `${b.x} ${b.y} ${b.w} ${b.h}`;

/**
 * One inline SVG holding every layer: the body, then the head's group with
 * both pairs of eyes and all ten mouths, every one hidden but the shown one,
 * so speaking only flips an attribute on two groups.
 */
function drawing(art: CharacterArt, prefix: string, frame: CharacterBox): string {
  const own = (part: string): string => part.split(`${TEMPLATE}-`).join(`${prefix}-`);
  const hidden = ' visibility="hidden"';
  return (
    // standing on the bottom of its box: a bust's shoulders meet the edge, whatever room is left above
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box(frame)}" width="100%" height="100%" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">` +
    own(art.body) +
    `<g data-sc="head">` +
    own(art.head) +
    `<g data-eyes="open">${own(art.eyes.open)}</g>` +
    `<g data-eyes="closed"${hidden}>${own(art.eyes.closed)}</g>` +
    VISEMES.map((v) => `<g data-mouth="${v}"${v === 'rest' ? '' : hidden}>${own(art.mouths[v])}</g>`).join('') +
    own(art.overlay) +
    '</g></svg>'
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
  /** head and shoulders, or the whole figure */
  crop?: 'bust' | 'full';
  /** the height in pixels; left out, the stylesheet sizes it and the drawing keeps its shape */
  size?: number;
  /** a play button beside it already says what is heard: the picture is left out of the accessibility tree */
  decorative?: boolean;
  className?: string;
}

/**
 * A character saying a recording: Hevalo, Hamo or Xezo, mouth moving in time
 * with the sound the screen is already playing.
 *
 * The drawing is one inline SVG, built once. While the recording plays, a
 * frame loop reads where it is (`currentTime`, so a slowed recording stays in
 * step) and asks the shared `speakingFrame` what the face looks like, then
 * shows that mouth and those eyes and turns the head for the nod — attributes
 * on a few groups, never a React render. The loop stops when the recording
 * has been paused a moment, when the character is off screen or the tab is
 * hidden, and when it goes; a blink now and then runs on a timer meanwhile.
 *
 * The mouth follows the timeline an editor saved with the recording, or one
 * made from `text` once the recording's length is known; with neither it
 * stays at rest. A reader who asked for less motion gets no nod, but the
 * mouth still moves: it is part of what is being said.
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
  className,
}: SpeakingCharacterProps): React.JSX.Element {
  const t = useT();
  const id = useId();
  const prefix = `sc${id.replace(/[^A-Za-z0-9]/g, '')}`;
  const art = useMemo(() => characterArt(speaker, TEMPLATE), [speaker]);
  const frame = crop === 'full' ? art.viewBox : art.bust;
  const markup = useMemo(() => ({ __html: drawing(art, prefix, frame) }), [art, prefix, frame]);
  const root = useRef<HTMLSpanElement>(null);
  const source = useRef(audio);
  source.current = audio;
  // blinks count from when the character came on screen, not from each new recording
  const born = useRef<number | null>(null);
  const [talking, setTalking] = useState(false);

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    born.current ??= performance.now();
    const bornAt = born.current;
    const head = host.querySelector('[data-sc="head"]');
    const mouths = new Map<string, Element>();
    host.querySelectorAll('[data-mouth]').forEach((g) => mouths.set(g.getAttribute('data-mouth') ?? '', g));
    const eyes = { open: host.querySelector('[data-eyes="open"]'), closed: host.querySelector('[data-eyes="closed"]') };
    const pivot = `${art.headPivot.x} ${art.headPivot.y}`;

    // ---- drawing ----
    let shown: SpeakingFrame = { mouth: 'rest', eyes: 'open', nod: 0 };
    const show = (el: Element | null | undefined, on: boolean): void => {
      if (on) el?.removeAttribute('visibility');
      else el?.setAttribute('visibility', 'hidden');
    };
    const draw = (next: SpeakingFrame, force = false): void => {
      if (force || next.mouth !== shown.mouth) {
        if (force) mouths.forEach((g, v) => show(g, v === next.mouth));
        else {
          show(mouths.get(shown.mouth), false);
          show(mouths.get(next.mouth), true);
        }
      }
      if (force || next.eyes !== shown.eyes) {
        show(eyes.open, next.eyes === 'open');
        show(eyes.closed, next.eyes === 'closed');
      }
      if (force || next.nod !== shown.nod) {
        if (next.nod === 0) head?.removeAttribute('transform');
        else head?.setAttribute('transform', `rotate(${next.nod} ${pivot})`);
      }
      shown = next;
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

    const reduced = { now: prefersReducedMotion() };
    const query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const onMotion = (): void => {
      reduced.now = query?.matches === true;
    };
    query?.addEventListener?.('change', onMotion);

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
      if (!awake() || blinker) return;
      blinker = window.setInterval(() => {
        // a recording started on an element this has not heard from yet
        bind();
        if (speaking()) wake();
        else draw(face(false));
      }, BLINK_TICK_MS);
    }
    const resume = (): void => {
      bind();
      if (!awake()) {
        stopLoop();
        stopBlinking();
      } else if (speaking()) wake();
      else if (!loop) blink();
    };

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
    resume();

    return () => {
      stopLoop();
      stopBlinking();
      unbind();
      watcher?.disconnect();
      document.removeEventListener('visibilitychange', resume);
      query?.removeEventListener?.('change', onMotion);
    };
  }, [markup, art, src, text, voice, decorative]);

  const name = CHARACTER_NAMES[speaker];
  const style: React.CSSProperties = { aspectRatio: `${frame.w} / ${frame.h}` };
  if (size) {
    style.height = size;
    style.width = (size * frame.w) / frame.h;
  }
  return (
    <span
      ref={root}
      className={`speaking-character${className ? ` ${className}` : ''}`}
      data-speaker={speaker}
      style={style}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': talking ? t('character.speaking', { name }) : name })}
      dangerouslySetInnerHTML={markup}
    />
  );
}
