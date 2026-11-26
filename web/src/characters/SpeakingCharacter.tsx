import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BLINK_STEPS,
  BREATH,
  BROW_STATES,
  CHARACTER_HABITS,
  CHARACTER_NAMES,
  HABITS,
  MOUTH_SHAPES,
  RESTING,
  SWAY,
  TAP_RUN_MS,
  actFor,
  between,
  characterArt,
  cropBody,
  cropBox,
  eyeShift,
  eyesFor,
  eyesMiddle,
  glanceTarget,
  leanToward,
  lookToward,
  partInDepth,
  pickAct,
  reactionAct,
  rigLayer,
  rigNeck,
  sampleKeys,
  skullClip,
  speakingFrame,
  tapActs,
  voiceTimeline,
  type ActName,
  type BrowState,
  type CharacterArt,
  type CharacterBox,
  type CharacterCrop,
  type CharacterId,
  type CharacterPoint,
  type CharacterReaction,
  type CheekState,
  type EyeState,
  type Keys,
  type LipsyncTimeline,
  type MouthShape,
  type RecordingVoice,
  type SpeakingFrame,
} from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { prefersReducedMotion } from '../lib/motion';
import './characters.css';

/** Where the recording plays: the element itself, a ref to it, or a function that finds it. */
type AudioSource = HTMLAudioElement | null | { readonly current: HTMLAudioElement | null } | (() => HTMLAudioElement | null);

export type { CharacterReaction } from '@kurda/shared';

/** Paused this long, the frame loop stops; the blinks go on with a cheap timer. */
const IDLE_MS = 1200;
/** How often the timer updates the eyes while nobody speaks, often enough never to miss a blink's closed frame. */
const BLINK_TICK_MS = 60;
/** How long the eyes keep looking where a finger left the screen (ms). */
const LINGER_MS = 1500;

/**
 * Each character's drawing is made once under this prefix and copied with the prefix swapped per instance, since
 * `characterArt` caches a drawing for every prefix it is asked for.
 */
const TEMPLATE = 'sctpl';

const box = (b: CharacterBox): string => `${b.x} ${b.y} ${b.w} ${b.h}`;
const px = (p: CharacterPoint): string => `${p.x}px ${p.y}px`;
/** A group that turns or grows about `p`, in the drawing's own units. */
const about = (p: CharacterPoint): string => ` style="transform-origin:${px(p)}"`;

/**
 * Where a figure stands and its height for hopping: its feet, or for the head-and-neck crop at a window, the foot of
 * the box shown.
 */
function ground(art: CharacterArt, frame: CharacterBox, crop: CharacterCrop): { y: number; height: number } {
  const stand = crop === 'head' ? frame : art.viewBox;
  return { y: stand.y + stand.h, height: stand.h };
}

/**
 * One inline SVG with every layer: the body, then the head with every eye state, brow, blush and all twelve mouths,
 * all hidden but the shown one, so speech and expressions only flip attributes. The deer's ears, pupils and nose,
 * Xezo's loose hair and the near end of Hamo's moustache are separate groups so they can move. Resting adds three
 * "z"s for the stylesheet to float.
 */
function drawing(art: CharacterArt, prefix: string, frame: CharacterBox, crop: CharacterCrop, resting: boolean, mirrored: boolean, turnable = false): string {
  const own = (part: string): string => part.split(`${TEMPLATE}-`).join(`${prefix}-`);
  const hidden = ' visibility="hidden"';
  const feet = { x: frame.x + frame.w / 2, y: ground(art, frame, crop).y };
  const rig = art.rig;
  const states: EyeState[] = ['half', 'closed', 'happy', 'wink', 'wide'];
  // The deer's eyes are always whites and pupils, with a lid over them for a blink or a smile.
  const eyes = rig
    ? own(rig.look.whites) +
      `<g data-pupil="left">${own(rig.look.left.art)}</g><g data-pupil="right">${own(rig.look.right.art)}</g>` +
      '<g data-eyes="open"></g>' +
      states.map((s) => `<g data-eyes="${s}"${hidden}>${own(s === 'half' ? rig.look.half : eyesFor(art, s))}</g>`).join('')
    : `<g data-eyes="open">${own(art.eyes.open)}</g>` + states.map((s) => `<g data-eyes="${s}"${hidden}>${own(eyesFor(art, s))}</g>`).join('');
  // The brows (the deer's lids) over the eyes, and the cheeks if they blush.
  const face =
    BROW_STATES.map((b) => `<g data-brows="${b}"${b === 'neutral' ? '' : hidden}>${own(art.brows?.states[b] ?? '')}</g>`).join('') +
    (art.cheeks ? `<g data-cheeks="blush"${hidden}>${own(art.cheeks.blush)}</g>` : '');
  const hair = art.hair ? `<g data-sc="hair"${about(art.hair.pivot)}>${own(art.hair.art)}</g>` : '';
  const ear = (side: 'left' | 'right', inner = own(rig!.ears[side].art)): string => `<g data-sc="ear-${side}"${about(rig!.ears[side].pivot)}>${inner}</g>`;
  // Drawn to turn, the antlers and ears are groups the page turns (shared head-turn.ts), and every shape of the face is
  // a piece the page places as the whole head turns (head-round.ts).
  const round = turnable && rig?.antlers && rig.faceLayers ? rig.antlers : null;
  const turned = (name: string, inner: string): string => `<g data-turn="${name}">${inner}</g>`;
  // Turning, every shape of his face rides on its piece of his head (`data-piece`), placed by the page as he turns,
  // what lies on his face kept within his outline; the ears and antlers show their depth (`data-sink`), and the neck
  // rides round under the head (`data-neck`).
  const clipId = `${prefix}-turnface`;
  const deep = (name: string, part: 'ear' | 'antler', markup: string): string => partInDepth(own(markup), part, `${clipId}-${name}`);
  const head = round
    ? turned('antler-left', deep('antler-left', 'antler', round.left.art)) +
      turned('antler-right', deep('antler-right', 'antler', round.right.art)) +
      turned('ear-left', ear('left', deep('ear-left', 'ear', rig!.ears.left.art))) +
      turned('ear-right', ear('right', deep('ear-right', 'ear', rig!.ears.right.art))) +
      skullClip(clipId) +
      rigLayer(own(rig!.faceLayers!.outline), 'outline', clipId)
    : rig
      ? own(rig.crown) + ear('left') + ear('right') + own(rig.face)
      : own(art.brows?.bare ?? art.head) + hair;
  const nose = rig
    ? `<g data-sc="nose"${about(rig.sniff)}>${own(art.overlay)}</g>`
    : art.moustache
      ? own(art.moustache.body) + `<g data-sc="lift"${about(art.moustache.end.pivot)}>${own(art.moustache.end.art)}</g>`
      : own(art.overlay);
  const mouths = MOUTH_SHAPES.map((v) => `<g data-mouth="${v}"${v === 'rest' ? '' : hidden}>${own(art.mouths[v])}</g>`).join('');
  // A soft shadow on the ground under a standing figure.
  const shadow =
    crop === 'full'
      ? `<defs><radialGradient id="${prefix}-ground"><stop offset="0" stop-color="#2a1408" stop-opacity="0.3"/><stop offset="1" stop-color="#2a1408" stop-opacity="0"/></radialGradient></defs>` +
        `<ellipse data-sc="shadow" cx="${feet.x}" cy="${feet.y - frame.h * 0.012}" rx="${frame.w * 0.4}" ry="${frame.h * 0.022}" fill="url(#${prefix}-ground)"${about(feet)}/>`
      : '';
  // Above and beside the head, measured on the head (the bust), on the side it faces away from. Outside the figure's
  // groups, so they neither breathe nor dip with it, nor turn into mirrored letters.
  const eyesAt = eyesMiddle(art);
  const zFrom = eyesAt.x + art.bust.w * RESTING.zAt.x;
  const zX = mirrored ? 2 * frame.x + frame.w - zFrom : zFrom;
  const snooze = resting
    ? '<g class="sc-snooze">' +
      [0, 1, 2]
        .map(
          () =>
            `<text class="sc-z" x="${zX}" y="${eyesAt.y - art.bust.h * RESTING.zAt.y}" font-size="${art.bust.h * RESTING.zRise * 0.5}" text-anchor="middle">z</text>`,
        )
        .join('') +
      '</g>'
    : '';
  return (
    // Standing on the bottom of its box, so a bust's shoulders meet the edge.
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box(frame)}" width="100%" height="100%" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">` +
    // Mirrored about the middle of its box, so a slightly turned face turns the other way.
    (mirrored ? `<g transform="matrix(-1 0 0 1 ${2 * frame.x + frame.w} 0)">` : '<g>') +
    shadow +
    `<g class="sc-breathe"${about(feet)}><g data-sc="wiggle"${about(feet)}><g data-sc="hop"${about(feet)}>` +
    (round && crop === 'head' ? rigNeck(own(cropBody(art, crop))) : own(cropBody(art, crop))) +
    `<g data-sc="head"><g class="sc-drift"${about(art.headPivot)}><g data-sc="tilt"${about(art.headPivot)}>` +
    head +
    (round
      ? rigLayer(own(rig!.faceLayers!.features), 'fur', clipId) + rigLayer(eyes + face, 'eyes', clipId) + rigLayer(mouths + nose, 'fur', clipId)
      : eyes + face + mouths + nose) +
    '</g></g></g></g></g></g></g>' +
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

/** The hop: rise and stretch on one group, sampled at every key of either. */
function hopFrames(rise: Keys | undefined, stretch: Keys | undefined, height: number): Keyframe[] {
  const times = [...new Set([...(rise ?? []).map(([t]) => t), ...(stretch ?? []).map(([t]) => t)])].sort((a, b) => a - b);
  return times.map((t) => {
    const up = rise ? sampleKeys(rise, t) : 0;
    const tall = stretch ? sampleKeys(stretch, t) : 1;
    // A crouch widens a little and a stretch narrows, as something soft does.
    const wide = 1 + (1 - tall) * 0.6;
    return { offset: t, transform: `translateY(${-up * height}px) scale(${wide}, ${tall})`, easing: 'ease-in-out' };
  });
}

export interface SpeakingCharacterProps {
  speaker: CharacterId;
  /** The element the screen plays the recording through; the character never plays audio itself. */
  audio: AudioSource;
  /**
   * The recording this character says; while the element plays another, it listens with its mouth at rest. Omit it
   * when the element only plays this character's recording.
   */
  src?: string | null;
  /** The words being said, for moving the mouth when no timeline was saved with the recording. */
  text?: string | null;
  voice?: RecordingVoice | null;
  /** The whole figure, head to waist, head and shoulders, or head and neck (HevaloWindow). */
  crop?: CharacterCrop;
  /** The height in pixels; when omitted the stylesheet sizes it and the drawing keeps its shape. */
  size?: number;
  /** A play button beside it already says what is heard, so the picture is hidden from assistive technology. */
  decorative?: boolean;
  /**
   * Reacts on mount with one and each time it changes: `cheer` and `hmm` for answers, the rest of shared
   * `CharacterReaction` for other moments, each played the character's own way.
   */
  reaction?: CharacterReaction | null;
  /**
   * An act to play now (shared `ACTS`, by name), and again each time `at` changes: a scene's beat beside the road, where
   * the same act comes round again.
   */
  cue?: { act: ActName; at: number } | null;
  /**
   * Asleep where there is nothing to do yet (shared `RESTING`): eyes shut, head dipped, slower breath and drifting
   * "z"s, with no blinks, glances or pointer-following. A click still wakes it for its greeting.
   */
  resting?: boolean;
  /**
   * Where it keeps looking, from -1 to 1 each way in its drawing's terms (shared `lookAcross`), at whoever it talks
   * with; its head leans that way and it neither glances nor follows the pointer.
   */
  gaze?: CharacterPoint | null;
  /** Mirrored (shared `standTogether`), so a slightly turned face turns toward the others. */
  mirrored?: boolean;
  /** Never speaks, whatever the element plays; it listens while another character speaks. */
  quiet?: boolean;
  /**
   * Holds still between words, as under Reduce Motion. For a drawing inside a turned 3D phone, where browsers render
   * moving content at a lower resolution.
   */
  still?: boolean;
  /**
   * Called after the greeting a click or tap gets, usually to replay. Quick taps in a row get a giggle, then a start
   * and a laugh (shared `tapActs`).
   */
  onPress?: () => void;
  /**
   * Draws the head ready to turn aside, for a character drawn for it (the deer): the antlers and ears as `data-turn`
   * groups and every shape of the face as a `data-piece` group, whose transforms the page sets as the head turns
   * (usePeekMotion). Untouched, they face us.
   */
  turnable?: boolean;
  className?: string;
}

/**
 * A character (Hevalo, Hamo or Xezo) whose mouth moves in time with the recording the screen plays. The drawing is one
 * inline SVG built once. While the recording plays, a frame loop reads `currentTime` (so slowed playback stays in
 * step), asks shared `speakingFrame` for the face and flips attributes on a few groups, never re-rendering React. The
 * loop stops when paused for a moment, off screen, in a hidden tab or unmounted; blinks run on a timer meanwhile.
 *
 * Between words it breathes and drifts (a stylesheet animation while on screen), glances about, has its own habits
 * (shared `CHARACTER_HABITS`) and follows the pointer. Clicks and `reaction` play acts (shared `actFor`) as web
 * animations. Under Reduce Motion none of that moves, but the mouth still speaks and reactions still change the face.
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
  cue = null,
  resting = false,
  gaze = null,
  mirrored = false,
  quiet = false,
  still = false,
  onPress,
  turnable = false,
  className,
}: SpeakingCharacterProps): React.JSX.Element {
  const t = useT();
  const id = useId();
  const prefix = `sc${id.replace(/[^A-Za-z0-9]/g, '')}`;
  const art = useMemo(() => characterArt(speaker, TEMPLATE), [speaker]);
  const frame = cropBox(art, crop);
  const markup = useMemo(
    () => ({ __html: drawing(art, prefix, frame, crop, resting, mirrored, turnable) }),
    [art, prefix, frame, crop, resting, mirrored, turnable],
  );
  // As two numbers, so a new object for the same look changes nothing.
  const gazeX = gaze?.x ?? null;
  const gazeY = gaze?.y ?? null;
  const root = useRef<HTMLSpanElement>(null);
  const source = useRef(audio);
  source.current = audio;
  // Blinks count from when the character appeared, not from each new recording.
  const born = useRef<number | null>(null);
  const [talking, setTalking] = useState(false);
  /** Plays an act; set by the effect below and a no-op until it has run. */
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
    const browGroups = new Map<string, Element>();
    host.querySelectorAll('[data-brows]').forEach((g) => browGroups.set(g.getAttribute('data-brows') ?? '', g));
    const cheeks = q('[data-cheeks="blush"]');
    // The deer's pupils or a person's irises, which move when it looks at something.
    const pupils = art.rig
      ? { left: q<SVGGElement>('[data-pupil="left"]'), right: q<SVGGElement>('[data-pupil="right"]') }
      : { left: q<SVGGElement>('[data-iris="left"]'), right: q<SVGGElement>('[data-iris="right"]') };
    const pivot = `${art.headPivot.x} ${art.headPivot.y}`;
    // Where it looks when nothing else draws its eyes, and the matching head lean.
    const steady: CharacterPoint | null = gazeX === null || gazeY === null ? null : { x: gazeX, y: gazeY };
    const lean = steady ? leanToward(steady) : 0;

    const reduced = { now: still || prefersReducedMotion() };
    const query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

    // ---- What an act holds, over speech and blinks ----
    const held: { eyes: EyeState | null; mouth: MouthShape | null; brows: BrowState | null; cheeks: CheekState | null } = {
      eyes: null,
      mouth: null,
      brows: null,
      cheeks: null,
    };

    // ---- Drawing ----
    let shown: { mouth: MouthShape; eyes: EyeState; nod: number; brows: BrowState; blush: boolean } = { mouth: 'rest', eyes: 'open', nod: 0, brows: 'neutral', blush: false };
    const show = (el: Element | null | undefined, on: boolean): void => {
      if (on) el?.removeAttribute('visibility');
      else el?.setAttribute('visibility', 'hidden');
    };
    const draw = (next: SpeakingFrame, force = false): void => {
      const mouth: MouthShape = next.mouth === 'rest' && held.mouth ? held.mouth : next.mouth;
      // Asleep the eyes stay shut, except for the face a greeting puts on.
      const eyes = held.eyes ?? (resting ? 'closed' : next.eyes);
      const brows = held.brows ?? 'neutral';
      const blush = held.cheeks === 'blush';
      // The head stays dipped to one side, or leans toward whoever it talks with.
      const nod = next.nod + (resting ? RESTING.dip : 0) + lean;
      if (force || mouth !== shown.mouth) {
        if (force) mouths.forEach((g, v) => show(g, v === mouth));
        else {
          show(mouths.get(shown.mouth), false);
          show(mouths.get(mouth), true);
        }
      }
      if (force || eyes !== shown.eyes) eyeGroups.forEach((g, state) => show(g, state === eyes));
      if (force || brows !== shown.brows) browGroups.forEach((g, state) => show(g, state === brows));
      if (force || blush !== shown.blush) show(cheeks, blush);
      if (force || nod !== shown.nod) {
        if (nod === 0) head?.removeAttribute('transform');
        else head?.setAttribute('transform', `rotate(${nod} ${pivot})`);
      }
      shown = { mouth, eyes, nod, brows, blush };
    };
    // The same markup may still show the last recording's face.
    draw({ mouth: 'rest', eyes: 'open', nod: 0 }, true);

    // ---- The recording ----
    const wanted = src ? absolute(src) : null;
    let el: HTMLAudioElement | null = null;
    const mine = (a: HTMLAudioElement): boolean => !quiet && (!src || a.src === src || a.src === wanted);
    const speaking = (): boolean => !!el && mine(el) && !el.paused && !el.ended;
    let timeline: LipsyncTimeline | null = voiceTimeline(voice, text, null);
    // A timeline made from the words needs the recording's length first.
    let measuring = timeline === null && !!text?.trim();
    const measure = (): void => {
      if (!measuring || !el || !mine(el) || !(el.readyState >= 1)) return;
      const seconds = el.duration;
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      timeline = voiceTimeline(voice, text, seconds * 1000);
      measuring = false;
    };

    // ---- The loops ----
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
      // Nothing to blink with the eyes shut.
      if (!awake() || blinker || resting) return;
      blinker = window.setInterval(() => {
        // A recording started on an element not yet bound.
        bind();
        if (speaking()) wake();
        else draw(face(false));
      }, BLINK_TICK_MS);
    }

    // ---- Looking ----
    let following = false;
    // Looking at nothing in particular means its steady gaze, if any.
    const look = (where: CharacterPoint | null): void => {
      if (!pupils.left || !pupils.right) return;
      const at = where ?? steady;
      if (!at) {
        pupils.left.style.transform = '';
        pupils.right.style.transform = '';
        return;
      }
      const shift = eyeShift(art, at);
      pupils.left.style.transform = `translate(${shift.left.x}px, ${shift.left.y}px)`;
      pupils.right.style.transform = `translate(${shift.right.x}px, ${shift.right.y}px)`;
    };
    look(null);
    const middle = eyesMiddle(art);
    const aim = (x: number, y: number): void => {
      if (!awake()) return;
      const r = host.getBoundingClientRect();
      if (r.width === 0) return;
      // Where the eyes are on the page, through the box the drawing fills (it keeps its shape, so the box is the frame).
      const ex = r.left + ((middle.x - frame.x) / frame.w) * r.width;
      const ey = r.top + ((middle.y - frame.y) / frame.h) * r.height;
      following = true;
      look(lookToward(x - ex, y - ey, Math.max(r.width, r.height) * 1.2));
    };
    // ---- Moving: acts as web animations, the rest as a stylesheet animation ----
    const can = (g: Element | null): g is Element & { animate: Element['animate'] } => !!g && typeof (g as Element).animate === 'function';
    const groups = {
      hop: q('[data-sc="hop"]'),
      wiggle: q('[data-sc="wiggle"]'),
      tilt: q('[data-sc="tilt"]'),
      earLeft: q('[data-sc="ear-left"]'),
      earRight: q('[data-sc="ear-right"]'),
      nose: q('[data-sc="nose"]'),
      lift: q('[data-sc="lift"]'),
      hair: q('[data-sc="hair"]'),
      shadow: q('[data-sc="shadow"]'),
    };
    const running: Animation[] = [];
    const holds: number[] = [];
    // When the current act ends, so a habit waits for it even when it moves nothing under Reduce Motion.
    let actUntil = 0;
    const stopAct = (): void => {
      running.splice(0).forEach((a) => a.cancel());
      holds.splice(0).forEach((h) => window.clearTimeout(h));
      actUntil = 0;
      held.eyes = null;
      held.mouth = null;
      held.brows = null;
      held.cheeks = null;
    };
    const run = (g: Element | null, keyframes: Keyframe[], ms: number): void => {
      if (!can(g) || keyframes.length < 2) return;
      running.push(g.animate(keyframes, { duration: ms, fill: 'none' }));
    };
    const redraw = (): void => draw(speaking() ? face(true) : face(false));
    const act = (name: ActName): void => {
      const a = actFor(speaker, name);
      stopAct();
      actUntil = performance.now() + a.ms;
      if (!reduced.now) {
        if (art.rig) {
          if (a.earLeft) run(groups.earLeft, frames(a.earLeft, (v) => `rotate(${v}deg)`), a.ms);
          if (a.earRight) run(groups.earRight, frames(a.earRight, (v) => `rotate(${-v}deg)`), a.ms);
          if (a.sniff) run(groups.nose, frames(a.sniff, (v) => `scale(${v})`), a.ms);
        }
        if (a.rise || a.stretch) run(groups.hop, hopFrames(a.rise, a.stretch, ground(art, frame, crop).height), a.ms);
        if (a.rise && groups.shadow) run(groups.shadow, frames(a.rise, (v) => `scale(${1 - v * 4}, 1)`), a.ms);
        if (a.tilt) run(groups.tilt, frames(a.tilt, (v) => `rotate(${v}deg)`), a.ms);
        if (a.wiggle) run(groups.wiggle, frames(a.wiggle, (v) => `rotate(${v}deg)`), a.ms);
        if (a.lift) run(groups.lift, frames(a.lift, (v) => `rotate(${v}deg)`), a.ms);
        if (a.hair) run(groups.hair, frames(a.hair, (v) => `rotate(${v}deg)`), a.ms);
        // Pupils or irises alike; one with a steady gaze keeps its eyes there.
        if (a.look && !steady) {
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
      hold(a.brows, (v) => (held.brows = v));
      hold(a.cheeks, (v) => (held.cheeks = v));
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
    // It follows the pointer only when it has nothing of its own to look at.
    const gazing = !!art.rig && !resting && !steady;
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

    // ---- Habits ----
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
    const busy = (): boolean => performance.now() < actUntil || running.some((a) => a.playState === 'running');
    const startHabits = (): void => {
      stopHabits();
      if (!awake() || reduced.now || resting) return;
      // The deer glances about, unless he has a steady gaze.
      if (art.rig && !steady) {
        every(HABITS.glance, () => {
          if (following || busy()) return;
          look(glanceTarget());
          habits.push(window.setTimeout(() => (following ? undefined : look(null)), between(HABITS.glanceHold)));
        });
      }
      // Each character's own habits.
      for (const habit of CHARACTER_HABITS[speaker]) every(habit.every, () => (busy() ? undefined : act(pickAct(habit))));
    };

    // The breath and drift run only while on screen and without Reduce Motion.
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
      reduced.now = still || query?.matches === true;
      alive();
      startHabits();
    };
    query?.addEventListener?.('change', onMotion);

    // ---- Listening to the element ----
    // `data-speaking` lets the surrounding place light up while it speaks, without a render.
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
    // The element can appear after the character, since the app's player is created on first play.
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

    // ---- On screen or not ----
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
  }, [markup, art, frame, crop, src, text, voice, decorative, resting, quiet, still, gazeX, gazeY, speaker]);

  // A reaction plays when given and each time it changes; the deer pricks up his ears on arriving.
  const arrived = useRef(false);
  useEffect(() => {
    const wait = window.setTimeout(() => {
      if (reaction) play.current(reactionAct(speaker, reaction));
      else if (!arrived.current && art.rig && !resting) play.current('arrive');
      arrived.current = true;
    }, reaction ? 120 : 160);
    return () => window.clearTimeout(wait);
  }, [reaction, art, resting, speaker]);

  // A cue plays as given, once for each beat it is given on.
  const cueAct = cue?.act ?? null;
  const cueAt = cue?.at ?? null;
  useEffect(() => {
    if (cueAct) play.current(cueAct);
  }, [cueAct, cueAt]);

  const name = CHARACTER_NAMES[speaker];
  const style = {
    aspectRatio: `${frame.w} / ${frame.h}`,
    // The breath and drift timings from the shared numbers, for the stylesheet's animations.
    '--sc-breath-ms': `${resting ? RESTING.breathMs : BREATH.ms}ms`,
    '--sc-breath': `${1 + (resting ? RESTING.depth : BREATH.depth)}`,
    '--sc-sway-ms': `${SWAY.ms}ms`,
    '--sc-sway': `${SWAY.degrees}deg`,
    '--sc-blink-ms': `${BLINK_STEPS.shut}ms`,
    // The "z"s: how often, and how far up and aside each goes, in the drawing's units.
    '--sc-z-ms': `${RESTING.zMs}ms`,
    '--sc-z-rise': `${-art.bust.h * RESTING.zRise}px`,
    '--sc-z-drift': `${(mirrored ? -1 : 1) * art.bust.h * RESTING.zRise * 0.45}px`,
  } as React.CSSProperties;
  if (size) {
    style.height = size;
    style.width = (size * frame.w) / frame.h;
  }
  // Clicks close together form one run: a greeting, a giggle, then a start and a laugh.
  const taps = useRef({ count: 0, at: 0 });
  const greet = onPress
    ? () => {
        const now = Date.now();
        const count = now - taps.current.at < TAP_RUN_MS ? taps.current.count + 1 : 1;
        taps.current = { count, at: now };
        const [first, then] = tapActs(speaker, count);
        play.current(first ?? 'greet');
        if (first && then) window.setTimeout(() => play.current(then), actFor(speaker, first).ms);
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
