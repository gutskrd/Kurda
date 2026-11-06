/**
 * A recording played with its character beside it, the mouth moving with the
 * sound: what a learner will see, for the editor to check.
 *
 * The drawing is one inline SVG holding every layer at once — the body, and a
 * head group with every pair of eyes and every mouth, all but one of each
 * hidden. A frame loop reads where the recording is (`currentTime`, so the
 * mouth follows the sound however it buffers), asks `speakingFrame` what the
 * character looks like there, and shows that mouth and those eyes and turns
 * the head for the nod: a few attributes on what is already drawn, so nothing
 * re-renders while it plays. When the recording ends the character beams for
 * a moment, eyes smiling and a grin, as it does for a learner who got it
 * right. With reduced motion asked for, the head stays still; the mouth still
 * moves, since it goes with the sound.
 *
 * The timeline is the one stored with the recording, as the apps play it,
 * or the words spread over the recording's length (`voiceTimeline`) when
 * there is none — which it says, since that is what the apps do too.
 *
 * A character's drawing carries its own ids, so a page shows one preview of
 * each character at a time.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CHARACTER_NAMES,
  EYE_STATES,
  MOUTH_SHAPES,
  characterArt,
  speakingFrame,
  voiceTimeline,
  type LipsyncData,
  type LipsyncTimeline,
  type MouthShape,
  type SpeakerId,
  eyesFor,
  type EyeState,
} from '@kurda/shared';
import { useMediaQuery } from './hooks';
import { Icon } from './icons';

const PREFIX = 'adm-say';

const drawings = new Map<SpeakerId, string>();

/** How long the character beams once a recording has ended, in milliseconds. */
const BEAM_MS = 900;

/** The character's head and shoulders, every mouth and every pair of eyes in place and all but the ones at rest hidden. */
export function speakingSvg(speaker: SpeakerId): string {
  let svg = drawings.get(speaker);
  if (svg) return svg;
  const art = characterArt(speaker, PREFIX);
  const { x, y, w, h } = art.bust;
  const mouths = MOUTH_SHAPES.map((v) => `<g data-mouth="${v}"${v === 'rest' ? '' : ' display="none"'}>${art.mouths[v]}</g>`).join('');
  const eyes = EYE_STATES.map((state) => `<g data-eyes="${state}"${state === 'open' ? '' : ' display="none"'}>${eyesFor(art, state)}</g>`).join('');
  svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" focusable="false" aria-hidden="true">` +
    art.body +
    `<g data-head="">${art.head}${eyes}${mouths}${art.overlay}</g>` +
    '</svg>';
  drawings.set(speaker, svg);
  return svg;
}

export function SpeakingPreview({
  speaker,
  url,
  text,
  lipsync,
  durationMs = null,
  size = 88,
}: {
  speaker: SpeakerId;
  url: string;
  /** the words said: the mouth follows them when no timeline is stored */
  text: string;
  /** the stored timeline; null when there is none, left out when it is not known here */
  lipsync?: LipsyncData | null;
  durationMs?: number | null;
  /** the drawing's width and height, in pixels */
  size?: number;
}): React.JSX.Element {
  const name = CHARACTER_NAMES[speaker];
  const figure = useRef<HTMLSpanElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)', false);
  const markup = useMemo(() => ({ __html: speakingSvg(speaker) }), [speaker]);
  const bust = characterArt(speaker, PREFIX).bust;
  const timeline = useMemo<LipsyncTimeline | null>(
    () => voiceTimeline(lipsync ? { speaker, lipsync } : { speaker }, text, durationMs),
    [speaker, lipsync, text, durationMs],
  );
  // what the frame loop reads, kept current without restarting it; `measured` is
  // the words timed to the recording's length once the file says what it is, and
  // `beamUntil` when the smile a finished recording put on comes off
  const live = useRef<{ playing: boolean; reduced: boolean; timeline: LipsyncTimeline | null; measured: LipsyncTimeline | null; beamUntil: number }>({
    playing: false,
    reduced,
    timeline,
    measured: null,
    beamUntil: 0,
  });
  live.current.reduced = reduced;
  live.current.timeline = timeline;

  useEffect(() => {
    const svg = figure.current?.querySelector('svg');
    const el = audio.current;
    if (!svg || !el) return;
    const pivot = characterArt(speaker, PREFIX).headPivot;
    const mouths = new Map(MOUTH_SHAPES.map((v) => [v, svg.querySelector(`[data-mouth="${v}"]`)]));
    const eyes = new Map(EYE_STATES.map((state) => [state, svg.querySelector(`[data-eyes="${state}"]`)]));
    const head = svg.querySelector('[data-head]');
    const show = (part: Element | null | undefined, on: boolean): void => {
      if (on) part?.removeAttribute('display');
      else part?.setAttribute('display', 'none');
    };
    let shown: { mouth: MouthShape; eyes: EyeState; nod: number } = { mouth: 'rest', eyes: 'open', nod: 0 };
    let since: number | null = null;
    let frame = 0;
    const tick = (now: number): void => {
      since ??= now;
      const frameNow = speakingFrame({
        timeline: live.current.timeline ?? live.current.measured,
        ms: el.currentTime * 1000,
        playing: live.current.playing,
        sinceMs: now - since,
        reducedMotion: live.current.reduced,
      });
      // a recording just finished: the smile it earns, over the blinks and the resting mouth
      const beaming = !live.current.playing && now < live.current.beamUntil;
      const next: { mouth: MouthShape; eyes: EyeState; nod: number } = beaming ? { ...frameNow, mouth: 'grin', eyes: 'happy' } : frameNow;
      if (next.mouth !== shown.mouth) {
        show(mouths.get(shown.mouth), false);
        show(mouths.get(next.mouth), true);
      }
      if (next.eyes !== shown.eyes) {
        show(eyes.get(shown.eyes), false);
        show(eyes.get(next.eyes), true);
      }
      if (next.nod !== shown.nod) {
        if (next.nod === 0) head?.removeAttribute('transform');
        else head?.setAttribute('transform', `rotate(${next.nod} ${pivot.x} ${pivot.y})`);
      }
      shown = next;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [speaker]);

  // the recording's own events say when it plays; when its length is known, the words can be timed to it
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const set = (on: boolean) => (): void => {
      live.current.playing = on;
      setPlaying(on);
    };
    const onPlay = set(true);
    const onStop = set(false);
    const onEnd = (): void => {
      live.current.beamUntil = performance.now() + BEAM_MS;
      onStop();
    };
    const onMeta = (): void => {
      if (el.duration > 0) live.current.measured = voiceTimeline({ speaker }, text, el.duration * 1000);
    };
    const onError = (): void => {
      onStop();
      setProblem('This recording could not be played.');
    };
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onStop);
    el.addEventListener('ended', onEnd);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onStop);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('error', onError);
    };
  }, [speaker, text]);

  // a detached audio element goes on playing: stop it when the preview goes
  useEffect(() => {
    const el = audio.current;
    return () => {
      el?.pause();
    };
  }, []);

  const toggle = (): void => {
    const el = audio.current;
    if (!el) return;
    if (live.current.playing) {
      el.pause();
      try {
        el.currentTime = 0;
      } catch {
        // not seekable yet: it starts from where it stopped
      }
      return;
    }
    setProblem(null);
    void el.play().catch(() => {
      live.current.playing = false;
      setPlaying(false);
      setProblem('This recording could not be played.');
    });
  };

  return (
    <div className="speaking">
      <span ref={figure} className="speaking-figure" style={{ width: size, height: (size * bust.h) / bust.w }} dangerouslySetInnerHTML={markup} />
      <div className="speaking-side">
        <button type="button" className="speaking-play" onClick={toggle}>
          <Icon name={playing ? 'stop' : 'play'} size={16} />
          {playing ? 'Stop' : `Play with ${name}`}
        </button>
        {lipsync === null && <span className="subtle speaking-note">No timeline yet: the mouth is timed from the words.</span>}
        {problem && (
          <span className="field-error" role="alert">
            {problem}
          </span>
        )}
      </div>
      <audio ref={audio} src={url} preload="none" />
    </div>
  );
}
