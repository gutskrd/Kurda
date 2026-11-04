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

import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  ACTS,
  NOD_DEGREES,
  SWAY,
  TAP_RUN_MS,
  characterArt,
  encodeLipsync,
  eyeShift,
  leanToward,
  visemeAt,
  voiceTimeline,
  type RecordingVoice,
} from '@kurda/shared';
import { onHaptic, resetHaptics, type HapticEvent } from '../feedback/haptics';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { characterLayers, irisesMoved } from './layers';
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
const XEZO = characterLayers('xezo', 'bust');

function clock(at = 0, duration = 1, playing = true): PlaybackClock & { currentTime: number; duration: number; playing: boolean } {
  return { currentTime: at, duration, playing };
}

/** the mouth on screen now */
function mouthShown(): string | undefined {
  const layers = [...document.querySelectorAll('svg[data-markup]')].map((el) => el.getAttribute('data-markup'));
  return (Object.entries(HAMO.mouths) as Array<[string, string]>).find(([, xml]) => layers.includes(xml))?.[0];
}

/** the layers on screen now */
function shown(): string[] {
  return [...document.querySelectorAll('svg[data-markup]')].map((el) => el.getAttribute('data-markup') ?? '');
}

/** how far the head group is turned, and about which point */
function headTurn(): { angle: number; origin: string } {
  const head = [...document.querySelectorAll('svg[data-markup]')].find((el) => el.getAttribute('data-markup') === HAMO.bare)!;
  const group = head.parentElement as HTMLElement;
  return { angle: Number(/rotate\((-?[\d.]+)deg\)/.exec(group.style.transform)?.[1] ?? 0), origin: group.style.transformOrigin };
}

/** how far the view a layer of the drawing is in moves it, in points */
function moved(markup: string): { x: number; y: number } {
  const layer = [...document.querySelectorAll('svg[data-markup]')].find((el) => el.getAttribute('data-markup') === markup)!;
  const transform = (layer.parentElement as HTMLElement).style.transform;
  const by = (axis: 'X' | 'Y'): number => Number(new RegExp(`translate${axis}\\((-?[\\d.e-]+)px\\)`).exec(transform)?.[1] ?? 0);
  return { x: by('X'), y: by('Y') };
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
  it('says who it is to a screen reader, and draws the body, the bare head, the eyes, the brows, a mouth and the moustache in its two pieces', async () => {
    renderWithProviders(<SpeakingCharacter speaker="hamo" voice={SAID} player={null} playing={false} size={104} />);
    await settle();
    expect(screen.getByRole('img', { name: 'Said by Hamo' })).toBeTruthy();
    expect(new Set(drawn.markups)).toEqual(
      new Set([HAMO.body, HAMO.bare, HAMO.eyes.open, HAMO.brows.neutral, HAMO.mouths.rest, HAMO.moustache!.body, HAMO.moustache!.end]),
    );
    expect(mouthShown()).toBe('rest');
    // the whole head, with its brows drawn in, is never drawn on top of them
    expect(drawn.markups).not.toContain(HAMO.head);
    expect(drawn.markups).not.toContain(HAMO.overlay);
  });

  it('draws Xezo’s loose hair as a layer that swings about where it parts, and her brows over her bare head', async () => {
    renderWithProviders(<SpeakingCharacter speaker="xezo" player={null} playing={false} size={104} />);
    await settle();
    expect(drawn.markups).toContain(XEZO.bare);
    expect(drawn.markups).toContain(XEZO.hair!.art);
    expect(drawn.markups).toContain(XEZO.brows.neutral);
    expect(drawn.markups).not.toContain(XEZO.head);
    const hair = [...document.querySelectorAll('svg[data-markup]')].find((el) => el.getAttribute('data-markup') === XEZO.hair!.art)!;
    expect((hair.parentElement as HTMLElement).style.transformOrigin).toBe(`${XEZO.hair!.pivot.x * 100}% ${XEZO.hair!.pivot.y * 100}%`);
    // nothing blushes until something pleases her
    expect(drawn.markups).not.toContain(XEZO.cheeks);
  });

  it('keeps the shape of its frame from the first render, and leaves room in its tile around the head', async () => {
    renderWithProviders(<SpeakingCharacter speaker="hamo" player={null} playing={false} size={104} />);
    // the tile, in the bust's own proportions
    const tall = (104 * HAMO.frame.h) / HAMO.frame.w;
    expect(document.querySelector(`[style*="width: 104px"][style*="height: ${tall}px"]`)).not.toBeNull();
    // the drawing a little smaller, standing on its foot: no antler, ear or hair is cut off
    const svg = document.querySelector('svg[data-markup]')!;
    expect(Number(svg.getAttribute('width'))).toBeCloseTo(104 * 0.88);
    expect(Number(svg.getAttribute('height'))).toBeCloseTo(tall * 0.88);
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
    // a nod, and at most the head's own slow drift on top of it
    expect(moving.turns.every((deg) => Math.abs(deg) <= NOD_DEGREES + SWAY.degrees + 1e-6)).toBe(true);
    // the head's own pivot, where the neck meets it
    expect(moving.origin).toBe(`${HAMO.pivot.x * 100}% ${HAMO.pivot.y * 100}%`);

    const still = await speak(true);
    expect(still.mouth).toBe('a');
    expect(still.turns.every((deg) => deg === 0)).toBe(true);
  });

  it('draws the deer’s ears, pupils and nose as parts of their own, so they can move', async () => {
    const deer = characterLayers('hevalo', 'full');
    renderWithProviders(<SpeakingCharacter speaker="hevalo" player={null} playing={false} crop="full" height={300} />);
    await settle();
    const rig = deer.rig!;
    for (const part of [rig.crown, rig.earLeft, rig.earRight, rig.face, rig.whites, rig.pupilLeft, rig.pupilRight, deer.body, deer.overlay]) {
      expect(drawn.markups).toContain(part);
    }
    // drawn in its parts, not as the one head the people have
    expect(drawn.markups).not.toContain(deer.head);
    // as tall as asked, as wide as the figure is for that height
    const svg = [...document.querySelectorAll('svg[data-markup]')].find((el) => el.getAttribute('data-markup') === deer.body)!;
    expect(Number(svg.getAttribute('height'))).toBeCloseTo(300);
    expect(Number(svg.getAttribute('width'))).toBeCloseTo((300 * deer.frame.w) / deer.frame.h);
  });

  it('rests where there is nothing to do yet: eyes shut, said so, with z’s that a screen reader skips', async () => {
    const deer = characterLayers('hevalo', 'full');
    renderWithProviders(<SpeakingCharacter speaker="hevalo" player={null} playing={false} crop="full" height={170} resting />);
    await settle();
    expect(drawn.markups).toContain(deer.eyes.closed);
    expect(screen.getByRole('img', { name: 'Hevalo is resting' })).toBeTruthy();
    expect(screen.getAllByText('z').length).toBeGreaterThan(0);
    expect(screen.queryByRole('img', { name: /z/ })).toBeNull();
  });

  it('beams at a right answer: eyes smiling and mouth open, even with motion turned down', async () => {
    renderWithProviders(<SpeakingCharacter speaker="hamo" player={null} playing={false} size={104} reaction="cheer" />);
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(drawn.markups).toContain(HAMO.eyes.happy);
    expect(mouthShown()).toBe('a');
    // Hamo cheers with his brows up
    expect(shown()).toContain(HAMO.brows.raised);
  });

  it('winks when asked, one eye shut in a smile and a grin; Xezo blushes with it', async () => {
    const view = renderWithProviders(<SpeakingCharacter speaker="hamo" player={null} playing={false} size={104} reaction="wink" />);
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(shown()).toContain(HAMO.eyes.wink);
    expect(mouthShown()).toBe('grin');
    view.unmount();
    drawn.markups = [];
    renderWithProviders(<SpeakingCharacter speaker="xezo" player={null} playing={false} size={104} reaction="wink" />);
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(shown()).toContain(XEZO.eyes.wink);
    expect(shown()).toContain(XEZO.cheeks);
  });

  it('meets a miss its own way: Hamo with one brow raised, Xezo with a pout', async () => {
    const view = renderWithProviders(<SpeakingCharacter speaker="hamo" player={null} playing={false} size={104} reaction="hmm" />);
    await act(() => new Promise((r) => setTimeout(r, 700)));
    expect(shown()).toContain(HAMO.brows.one);
    expect(mouthShown()).toBe('mbp');
    view.unmount();
    renderWithProviders(<SpeakingCharacter speaker="xezo" player={null} playing={false} size={104} reaction="hmm" />);
    await act(() => new Promise((r) => setTimeout(r, 700)));
    expect(shown()).toContain(XEZO.brows.knit);
    expect([...document.querySelectorAll('svg[data-markup]')].some((el) => el.getAttribute('data-markup') === XEZO.mouths.u)).toBe(true);
    // and it passes: the brows come back to rest
    await act(() => new Promise((r) => setTimeout(r, ACTS.hmm.ms)));
    expect(shown()).toContain(XEZO.brows.neutral);
    expect(shown()).not.toContain(XEZO.brows.knit);
  });

  it('plays a chuckle only as Hamo, and a start with wide eyes, raised brows and a round mouth for anyone', async () => {
    const view = renderWithProviders(<SpeakingCharacter speaker="xezo" player={null} playing={false} size={104} reaction="chuckle" />);
    await act(() => new Promise((r) => setTimeout(r, 400)));
    // Xezo giggles instead: smiling eyes, a grin, a blush
    expect(shown()).toContain(XEZO.eyes.happy);
    expect(shown()).toContain(XEZO.cheeks);
    view.unmount();
    renderWithProviders(<SpeakingCharacter speaker="hamo" player={null} playing={false} size={104} reaction="surprised" />);
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(shown()).toContain(HAMO.eyes.wide);
    expect(shown()).toContain(HAMO.brows.raised);
    expect(mouthShown()).toBe('o');
  });

  it('greets a first tap, giggles at a second quick one, and at a third starts and then laughs with one light buzz', async () => {
    resetHaptics();
    const felt: HapticEvent[] = [];
    const stop = onHaptic((event) => felt.push(event));
    const again = vi.fn();
    renderWithProviders(<SpeakingCharacter speaker="hamo" player={null} playing={false} size={104} onPress={again} />);
    await settle();
    const figure = screen.getByRole('img', { name: 'Said by Hamo' });
    fireEvent.click(figure);
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(shown()).toContain(HAMO.eyes.happy);
    expect(mouthShown()).toBe('a');
    fireEvent.click(figure);
    await act(() => new Promise((r) => setTimeout(r, 300)));
    // a giggle: smiling eyes and a grin
    expect(shown()).toContain(HAMO.eyes.happy);
    expect(mouthShown()).toBe('grin');
    fireEvent.click(figure);
    await act(() => new Promise((r) => setTimeout(r, 300)));
    // a start, with a light buzz
    expect(shown()).toContain(HAMO.eyes.wide);
    expect(mouthShown()).toBe('o');
    expect(felt).toEqual(['tap', 'select']);
    // and then his chuckle
    await act(() => new Promise((r) => setTimeout(r, ACTS.surprised.ms + 100)));
    expect(shown()).toContain(HAMO.eyes.happy);
    expect(shown()).toContain(HAMO.brows.raised);
    // every tap still said it again
    expect(again).toHaveBeenCalledTimes(3);
    // a tap after the run is over greets again
    await act(() => new Promise((r) => setTimeout(r, TAP_RUN_MS)));
    fireEvent.click(figure);
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(mouthShown()).toBe('a');
    stop();
  });

  it('greets a tap, and then does what the screen asked (says it again)', async () => {
    const again = vi.fn();
    renderWithProviders(<SpeakingCharacter speaker="hamo" player={null} playing={false} size={104} onPress={again} />);
    await settle();
    fireEvent.click(screen.getByRole('img', { name: 'Said by Hamo' }));
    expect(again).toHaveBeenCalledTimes(1);
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(drawn.markups).toContain(HAMO.eyes.happy);
  });

  it('listens with its mouth still while it is quiet, whatever plays, and asks for no frames', async () => {
    const player = clock(0);
    renderWithProviders(<SpeakingCharacter speaker="hamo" voice={SAID} player={player} playing quiet size={104} source="a.wav" />);
    await settle();
    for (const at of [0.12, 0.3, 0.7]) {
      step(player, at);
      expect(mouthShown()).toBe('rest');
    }
    expect(frames.pending).toBe(0);
  });

  it('looks steadily where it is told: the irises moved within the eyes, and the head leaning that way', async () => {
    const art = characterArt('hamo');
    const view = renderWithProviders(<SpeakingCharacter speaker="hamo" player={null} playing={false} size={104} gaze={{ x: -1, y: 0 }} />);
    await settle();
    const left = irisesMoved(HAMO.eyes.open, eyeShift(art, { x: -1, y: 0 }));
    expect(left).toContain(`<g data-iris="left" transform="translate(${-art.irisReach!} 0)">`);
    expect(left).toContain(`<g data-iris="right" transform="translate(${-art.irisReach!} 0)">`);
    expect(drawn.markups).toContain(left);
    expect(drawn.markups).not.toContain(HAMO.eyes.open);
    expect(headTurn().angle).toBe(leanToward({ x: -1, y: 0 }));
    expect(headTurn().angle).toBeLessThan(0);

    // the same look given again draws nothing again, and turned round it is the same look in the drawing's own terms
    drawn.markups = [];
    view.rerender(<SpeakingCharacter speaker="hamo" player={null} playing={false} size={104} gaze={{ x: -1, y: 0 }} flip />);
    await settle();
    expect(drawn.markups).toEqual([]);
    expect(headTurn().angle).toBe(leanToward({ x: -1, y: 0 }));

    // the other way, and only the eyes are drawn again
    view.rerender(<SpeakingCharacter speaker="hamo" player={null} playing={false} size={104} gaze={{ x: 1, y: 0 }} flip />);
    await settle();
    expect(drawn.markups).toEqual([irisesMoved(HAMO.eyes.open, eyeShift(art, { x: 1, y: 0 }))]);
    expect(headTurn().angle).toBeGreaterThan(0);

    // told nothing, it looks ahead again
    view.rerender(<SpeakingCharacter speaker="hamo" player={null} playing={false} size={104} flip />);
    await settle();
    expect(drawn.markups).toContain(HAMO.eyes.open);
    expect(headTurn().angle).toBe(0);
  });

  it('turns the deer’s pupils where it is told to look', async () => {
    const deer = characterLayers('hevalo', 'full');
    const look = { x: 1, y: 0 };
    renderWithProviders(<SpeakingCharacter speaker="hevalo" player={null} playing={false} crop="full" height={300} gaze={look} />);
    await settle();
    const unit = 300 / deer.frame.h;
    const shift = eyeShift(characterArt('hevalo'), look);
    for (const [markup, eye] of [
      [deer.rig!.pupilLeft, shift.left],
      [deer.rig!.pupilRight, shift.right],
    ] as const) {
      expect(moved(markup).x).toBeCloseTo(eye.x * unit, 3);
      expect(moved(markup).y).toBeCloseTo(eye.y * unit, 3);
    }
    expect(shift.left.x).toBeGreaterThan(0);
  });

  it('takes no touch when there is nothing for a tap to do', async () => {
    renderWithProviders(<SpeakingCharacter speaker="hamo" player={null} playing={false} size={104} />);
    await settle();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

