import { AppState, Platform } from 'react-native';
import CORRECT_1 from '../../assets/sounds/correct-1.wav';
import CORRECT_2 from '../../assets/sounds/correct-2.wav';
import CORRECT_3 from '../../assets/sounds/correct-3.wav';
import CORRECT_4 from '../../assets/sounds/correct-4.wav';
import WRONG from '../../assets/sounds/wrong.wav';
import COMPLETE from '../../assets/sounds/complete.wav';
import REWARD from '../../assets/sounds/reward.wav';
import { loadSoundPref, soundsOn } from './soundPref';

/**
 * The app's chimes, by what they mean — the ear's half of haptics.ts.
 *
 *   correct   a right answer: two bright notes. A run of right answers
 *             climbs a step each time (`step` 0–3), so the run itself is
 *             heard — the small pull to keep it going is the pull to keep
 *             answering, which is the learning
 *   wrong     a miss: two low, muffled notes, quieter than a right answer.
 *             Never a buzzer; the person getting it wrong is often a child
 *   complete  a lesson finished: four notes rising to the octave
 *   reward    something earned — a goal met, a streak kept, a badge, a gift
 *             opened: a quick high shimmer
 *
 * Nothing else makes a sound: not taps, not messages arriving, not anything
 * that happens by itself. A sound nobody caused is a sound pulling at them.
 *
 * Quiet while the app is in the background, when Settings → Sounds is off,
 * and in the web build and tests (no native audio). Never two within 90 ms,
 * so a celebration that fires twice is heard once. The sounds are made by
 * scripts/generate-sounds.mjs.
 */
export type SoundEvent = 'correct' | 'wrong' | 'complete' | 'reward';

const FILES = {
  'correct-1': CORRECT_1,
  'correct-2': CORRECT_2,
  'correct-3': CORRECT_3,
  'correct-4': CORRECT_4,
  wrong: WRONG,
  complete: COMPLETE,
  reward: REWARD,
};
type SoundFile = keyof typeof FILES;

/** Which file an event plays: a right answer by how far into a run it is. */
export function soundFile(event: SoundEvent, step = 0): SoundFile {
  if (event === 'correct') return `correct-${Math.min(4, Math.max(1, step + 1))}` as SoundFile;
  return event;
}

interface Player {
  seekTo(seconds: number): Promise<void>;
  play(): void;
  volume: number;
}
type CreatePlayer = (source: number) => Player;

let create: CreatePlayer | null | undefined;
function creator(): CreatePlayer | null {
  if (create !== undefined) return create;
  create = null;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return create;
  try {
    // required here rather than imported: the web bundle and the tests must never evaluate a native module
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    create = (require('expo-audio') as { createAudioPlayer: CreatePlayer }).createAudioPlayer;
  } catch {
    create = null;
  }
  return create;
}

/** One player per sound, made the first time it is wanted and kept: a chime must not wait to load. */
const players = new Map<SoundFile, Player>();
let last = 0;
let started = false;
const listeners = new Set<(file: SoundFile) => void>();

export function playSound(event: SoundEvent, step = 0): void {
  if (!started) {
    started = true;
    void loadSoundPref();
  }
  if (!soundsOn() || AppState.currentState !== 'active') return;
  const now = Date.now();
  if (now - last < 90) return;
  last = now;
  const file = soundFile(event, step);
  for (const l of listeners) l(file);
  const make = creator();
  if (!make) return;
  try {
    let player = players.get(file);
    if (!player) {
      player = make(FILES[file]);
      players.set(file, player);
    }
    void player.seekTo(0).catch(() => undefined);
    player.play();
  } catch {
    // a chime that cannot play is not worth interrupting anything for
  }
}

/** Told of every sound that would play (after the rules above) — for tests, and nothing else. */
export function onSound(listener: (file: SoundFile) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Forget the last sound's time, so a test's sounds are not paced against the one before. */
export function resetSounds(): void {
  last = 0;
}
