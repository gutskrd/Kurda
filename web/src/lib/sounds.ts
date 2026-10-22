/**
 * The lesson's chimes on the website — the same four moments, and the same
 * notes, as the phone's (mobile/src/feedback/sounds.ts), drawn by the browser
 * itself with Web Audio rather than played from files:
 *
 *   correct   two bright notes, a fifth apart. A run of right answers climbs
 *             a step each time (`step` 0–3), so the run can be heard
 *   wrong     two low, muffled notes, quieter: never a buzzer
 *   complete  four notes rising to the octave, the last left to ring
 *
 * Only ever started by the reader's own answer (which is what a browser lets
 * play), never two within 90 ms, and not when Settings → Sounds → Lesson
 * sounds is off on this device. Nothing else on the site makes a sound but
 * the gift chime (gifts/motion.ts).
 */
export type LessonSound = 'correct' | 'wrong' | 'complete';

const KEY = 'hevalo_lesson_sounds';

/** Settings → Sounds → Lesson sounds. On unless turned off on this device. */
export function lessonSoundsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setLessonSounds(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    // private browsing without storage: the choice lasts as long as the page
  }
}

/** Semitones from A4 to Hz. */
const hz = (n: number): number => 440 * 2 ** (n / 12);

/** A right answer's pair of notes, by how far into a run it is: E5–B5, F♯5–C♯6, G♯5–D♯6, B5–F♯6. */
export const CORRECT_NOTES: readonly (readonly [number, number])[] = [
  [hz(7), hz(14)],
  [hz(9), hz(16)],
  [hz(11), hz(18)],
  [hz(14), hz(21)],
];

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;
let last = 0;
const listeners = new Set<(sound: string) => void>();

function context(): AudioContext | null {
  const Ctor: AudioCtor | undefined =
    (window as unknown as { AudioContext?: AudioCtor }).AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** One struck note: a sine with a quieter octave (or none, muffled), a 6 ms rise and a soft fall. */
function bell(c: AudioContext, at: number, freq: number, level: number, tail: number, octave = 0.3): void {
  for (const [mult, amp] of [
    [1, 1],
    [2, octave],
  ] as const) {
    if (amp === 0) continue;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level * amp, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + tail);
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + tail + 0.05);
  }
}

/** Which chime a moment is, by name — what a test hears. */
export function soundName(sound: LessonSound, step = 0): string {
  return sound === 'correct' ? `correct-${Math.min(4, Math.max(1, step + 1))}` : sound;
}

export function playLessonSound(sound: LessonSound, step = 0): void {
  if (!lessonSoundsOn()) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  const now = Date.now();
  if (now - last < 90) return;
  last = now;
  for (const l of listeners) l(soundName(sound, step));
  try {
    const c = context();
    if (!c) return;
    const at = c.currentTime + 0.02;
    if (sound === 'correct') {
      const [a, b] = CORRECT_NOTES[Math.min(3, Math.max(0, step))]!;
      bell(c, at, a, 0.1, 0.45);
      bell(c, at + 0.085, b, 0.12, 0.8);
    } else if (sound === 'wrong') {
      bell(c, at, hz(-12), 0.09, 0.35, 0.05);
      bell(c, at + 0.11, hz(-16), 0.09, 0.45, 0.05);
    } else {
      [hz(3), hz(7), hz(10)].forEach((f, i) => bell(c, at + i * 0.09, f, 0.09, 0.55));
      bell(c, at + 0.27, hz(15), 0.12, 1.4);
    }
  } catch {
    // a browser that will not make a sound is a quiet lesson, not a broken one
  }
}

/** Told of every chime that would play (after the rules above) — for tests, and nothing else. */
export function onLessonSound(listener: (sound: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Forget the last chime's time — for tests, whose answers come faster than anybody's. */
export function resetLessonSounds(): void {
  last = 0;
}
