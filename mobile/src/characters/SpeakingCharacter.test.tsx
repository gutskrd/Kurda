// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// every drawing the character asks react-native-svg for, in order
const drawn = vi.hoisted(() => ({ markups: [] as string[] }));

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', async () => {
  const { createElement } = await import('react');
  return {
    SvgXml: ({ xml, width, height }: { xml: string; width: number; height: number }) => {
      drawn.markups.push(xml);
      return createElement('svg', { width, height, 'data-markup': xml });
    },
  };
});
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));

import { act, cleanup, screen } from '@testing-library/react';
import { AppState, type AppStateStatus } from 'react-native';
import { encodeLipsync, visemeAt, voiceTimeline, type RecordingVoice } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { characterLayers } from './layers';
import { SpeakingCharacter, type PlaybackClock } from './SpeakingCharacter';
import { fakeFrames, type Frames } from './testing/audio';

// a word said over a second: the lips pressed, then wide open, then rounded
const SAID: RecordingVoice = {
  speaker: 'hamo',
  lipsync: encodeLipsync({
    durationMs: 1000,
    cues: [
      { startMs: 0, viseme: 'rest' },
      { startMs: 100, viseme: 'mbp' },
      { startMs: 250, viseme: 'a' },
      { startMs: 600, viseme: 'o' },
      { startMs: 900, viseme: 'rest' },
    ],
  }),
};

const HAMO = characterLayers('hamo', 'bust');

function clock(at = 0, duration = 1, playing = true): PlaybackClock & { currentTime: number; duration: number; playing: boolean } {
  return { currentTime: at, duration, playing };
}

/** the mouth on screen now */
function mouthShown(): string | undefined {
  const layers = [...document.querySelectorAll('svg[data-markup]')].map((el) => el.getAttribute('data-markup'));
  return (Object.entries(HAMO.mouths) as Array<[string, string]>).find(([, xml]) => layers.includes(xml))?.[0];
}

/** how far the head group is turned, and about which point */
function headTurn(): { angle: number; origin: string } {
  const head = [...document.querySelectorAll('svg[data-markup]')].find((el) => el.getAttribute('data-markup') === HAMO.head)!;
  const group = head.parentElement as HTMLElement;
  return { angle: Number(/rotate\((-?[\d.]+)deg\)/.exec(group.style.transform)?.[1] ?? 0), origin: group.style.transformOrigin };
}

let frames: Frames;

beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: true });
  frames = fakeFrames();
  drawn.markups = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  await act(async () => undefined);
}

function step(player: ReturnType<typeof clock>, seconds: number): void {
  player.currentTime = seconds;
  act(() => frames.step());
}

describe('SpeakingCharacter', () => {
  it('says who it is to a screen reader, and draws the body, the head, the eyes, a mouth and the moustache', async () => {
    renderWithProviders(<SpeakingCharacter speaker="hamo" voice={SAID} player={null} playing={false} size={104} />);
    await settle();
    expect(screen.getByRole('img', { name: 'Said by Hamo' })).toBeTruthy();
    expect(new Set(drawn.markups)).toEqual(new Set([HAMO.body, HAMO.head, HAMO.eyes.open, HAMO.mouths.rest, HAMO.overlay]));
    expect(mouthShown()).toBe('rest');
  });

  it('keeps the shape of its frame from the first render, in the bust’s own proportions', async () => {
    renderWithProviders(<SpeakingCharacter speaker="hamo" player={null} playing={false} size={104} />);
    const svg = document.querySelector('svg[data-markup]')!;
    expect(svg.getAttribute('width')).toBe('104');
    expect(Number(svg.getAttribute('height'))).toBeCloseTo((104 * HAMO.frame.h) / HAMO.frame.w);
  });

  it('moves the mouth with the recording, and draws only the mouth again, only when its shape changes', async () => {
    const player = clock(0);
    renderWithProviders(<SpeakingCharacter speaker="hamo" voice={SAID} player={player} playing size={104} source="a.wav" />);
    await settle();
    drawn.markups = [];

    step(player, 0.12);
    expect(mouthShown()).toBe('mbp');
    expect(drawn.markups).toEqual([HAMO.mouths.mbp]);

    // the same shape a frame later: nothing is drawn again
    step(player, 0.2);
    step(player, 0.24);
    expect(drawn.markups).toEqual([HAMO.mouths.mbp]);

    step(player, 0.3);
    step(player, 0.7);
    expect(drawn.markups).toEqual([HAMO.mouths.mbp, HAMO.mouths.a, HAMO.mouths.o]);
    expect(mouthShown()).toBe('o');
  });

  it('follows the player’s own clock, so a slower recording keeps its place', async () => {
    const player = clock(0);
    renderWithProviders(<SpeakingCharacter speaker="hamo" voice={SAID} player={player} playing size={104} />);
    await settle();
    step(player, 0.3);
    expect(mouthShown()).toBe('a');
    // still on the open vowel however many frames pass, until the recording itself moves on
    for (let i = 0; i < 5; i++) step(player, 0.3);
    expect(mouthShown()).toBe('a');
  });

  it('rests its mouth when the recording pauses, and stops asking for frames', async () => {
    const player = clock(0);
    const view = renderWithProviders(<SpeakingCharacter speaker="hamo" voice={SAID} player={player} playing size={104} />);
    await settle();
    step(player, 0.3);
    expect(mouthShown()).toBe('a');
    view.rerender(<SpeakingCharacter speaker="hamo" voice={SAID} player={player} playing={false} size={104} />);
    await settle();
    expect(mouthShown()).toBe('rest');
    expect(frames.pending).toBe(0);
  });

  it('moves the mouth from the words once the recording’s length is known, when no timeline was saved', async () => {
    const player = clock(0, Number.NaN);
    const voice: RecordingVoice = { speaker: 'hamo' };
    renderWithProviders(<SpeakingCharacter speaker="hamo" voice={voice} text="Ez baş im" player={player} playing size={104} source="b.wav" />);
    await settle();

    // no length yet, so no timeline: the mouth waits at rest
    step(player, 0.4);
    expect(mouthShown()).toBe('rest');

    player.duration = 1.2;
    step(player, 0.4);
    await settle();
    const made = voiceTimeline(voice, 'Ez baş im', 1200)!;
    const open = made.cues.find((c) => c.viseme !== 'rest')!;
    step(player, (open.startMs + 1) / 1000);
    expect(mouthShown()).toBe(visemeAt(made, open.startMs + 1));
    expect(mouthShown()).not.toBe('rest');
  });

  it('uses the saved timeline over the words when it has one', async () => {
    const player = clock(0);
    renderWithProviders(<SpeakingCharacter speaker="hamo" voice={SAID} text="Ez baş im" player={player} playing size={104} />);
    await settle();
    step(player, 0.7);
    expect(mouthShown()).toBe('o');
  });

  it('starts again from the new recording’s own length when the recording changes', async () => {
    const player = clock(0, 1);
    const voice: RecordingVoice = { speaker: 'hamo' };
    const view = renderWithProviders(<SpeakingCharacter speaker="hamo" voice={voice} text="av" player={player} playing size={104} source="one.wav" />);
    await settle();
    step(player, 0.1);
    await settle();
    player.duration = Number.NaN;
    view.rerender(<SpeakingCharacter speaker="hamo" voice={voice} text="av" player={player} playing size={104} source="two.wav" />);
    await settle();
    // the second recording's length is not known yet, so the first one's timeline must not be used for it
    step(player, 0.1);
    expect(mouthShown()).toBe('rest');
  });

  it('stops when it is taken off the screen', async () => {
    const player = clock(0);
    const view = renderWithProviders(<SpeakingCharacter speaker="hamo" voice={SAID} player={player} playing size={104} />);
    await settle();
    expect(frames.pending).toBe(1);
    view.unmount();
    expect(frames.pending).toBe(0);
  });

  it('stops while the app is in the background and carries on when it is back', async () => {
    const listeners: Array<(state: AppStateStatus) => void> = [];
    vi.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: AppStateStatus) => void);
      return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
    });
    const player = clock(0);
    renderWithProviders(<SpeakingCharacter speaker="hamo" voice={SAID} player={player} playing size={104} />);
    await settle();
    step(player, 0.3);
    expect(mouthShown()).toBe('a');

    act(() => listeners.forEach((l) => l('background')));
    await settle();
    expect(frames.pending).toBe(0);
    expect(mouthShown()).toBe('rest');

    act(() => listeners.forEach((l) => l('active')));
    await settle();
    expect(frames.pending).toBe(1);
    step(player, 0.7);
    expect(mouthShown()).toBe('o');
  });

  it('nods while it speaks, about the neck, and not at all under Reduce Motion, where the mouth still moves', async () => {
    const speak = async (reduce: boolean): Promise<{ turns: number[]; origin: string; mouth: string | undefined }> => {
      patchReactNativeWeb({ reduceMotion: reduce });
      const player = clock(0);
      const view = renderWithProviders(<SpeakingCharacter speaker="hamo" voice={SAID} player={player} playing size={104} />);
      await settle();
      const turns: number[] = [];
      for (const at of [0.3, 0.35, 0.4, 0.45, 0.5]) {
        step(player, at);
        turns.push(headTurn().angle);
      }
      const result = { turns, origin: headTurn().origin, mouth: mouthShown() };
      view.unmount();
      return result;
    };
    const moving = await speak(false);
    expect(moving.mouth).toBe('a');
    expect(moving.turns.some((deg) => deg !== 0)).toBe(true);
    expect(moving.turns.every((deg) => Math.abs(deg) <= 1.2)).toBe(true);
    // the head's own pivot, where the neck meets it
    expect(moving.origin).toBe(`${HAMO.pivot.x * 100}% ${HAMO.pivot.y * 100}%`);

    const still = await speak(true);
    expect(still.mouth).toBe('a');
    expect(still.turns.every((deg) => deg === 0)).toBe(true);
  });
});
