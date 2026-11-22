// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { characterArt, encodeLipsync, type RecordingVoice, type SpeakerId } from '@kurda/shared';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { FakeAudio, fakeFrames, type Frames } from '../../characters/testing/audio';
import { characterLayers } from '../../characters/layers';
import { sameIds } from '../../reports/testing/sameIds';
import type { Exercise } from '../types';
import { resetAutoplayPref, setAutoplay } from '../../feedback/autoplayPref';
import { ConversationExercise } from './ConversationExercise';

const SILAV = 'https://media.test/silav.wav';
const BAS = 'https://media.test/bas.wav';
const XEZO: RecordingVoice = {
  speaker: 'xezo',
  lipsync: encodeLipsync({
    durationMs: 800,
    cues: [
      { startMs: 0, viseme: 'rest' },
      { startMs: 100, viseme: 'a' },
      { startMs: 500, viseme: 'rest' },
    ],
  }),
};

/** Xezo greets Hamo; the middle line has no recording yet, and only the first has a mouth timeline. */
function conversation(extra: Partial<Exercise> = {}): Exercise {
  return {
    id: 'c1',
    type: 'conversation',
    title: 'Li kafeyê',
    speakers: [
      { name: 'Xezo', character: 'xezo' },
      { name: 'Hamo', character: 'hamo' },
    ],
    lines: [
      { speaker: 0, text: 'Silav, tu çawa yî?', en: 'Hi, how are you?' },
      { speaker: 1, text: 'Ez baş im, spas.', en: 'I’m well, thanks.' },
      { speaker: 0, text: 'Ez jî baş im.' },
    ],
    lineAudio: [SILAV, null, BAS],
    lineVoices: [XEZO, null, null],
    prompt: 'Xezo çawa ye?',
    options: ['Westiyayî ye', 'Baş e'],
    ...extra,
  };
}

let frames: Frames;

beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: true });
  FakeAudio.made = [];
  vi.stubGlobal('Audio', FakeAudio);
  frames = fakeFrames();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAutoplayPref();
  localStorage.removeItem('kurda_locale_v1');
});

async function settle(): Promise<void> {
  await act(async () => undefined);
}

function show(exercise: Exercise, onSelect: (i: number) => void = () => undefined) {
  return renderWithProviders(<ConversationExercise exercise={exercise} choice={null} onSelect={onSelect} disabled={false} />);
}

function markups(): string[] {
  return [...document.querySelectorAll('svg[data-markup]')].map((el) => el.getAttribute('data-markup') ?? '');
}

/** The mouth shape `who` shows now on the stage. */
function mouth(who: SpeakerId): string | undefined {
  const drawn = markups();
  return Object.entries(sameIds(characterLayers(who, 'full')).mouths).find(([, xml]) => drawn.includes(xml))?.[0];
}

/** How far a person's left iris is moved on the stage, in drawing units; 0 where drawn. */
function irisShift(who: 'xezo' | 'hamo'): number {
  const open = sameIds(characterLayers(who, 'full')).eyes.open;
  const eyes = markups().find((xml) => xml.replace(/ transform="translate\([^)]*\)"/g, '') === open);
  return Number(/data-iris="left" transform="translate\((-?[\d.]+) /.exec(eyes ?? '')?.[1] ?? 0);
}

/** Whether `who` is drawn mirrored on the stage. */
function turnedRound(who: SpeakerId): boolean {
  const body = sameIds(characterLayers(who, 'full')).body;
  const drawn = [...document.querySelectorAll('svg[data-markup]')].find((el) => el.getAttribute('data-markup') === body);
  for (let el = drawn?.parentElement; el; el = el.parentElement) if (getComputedStyle(el).transform.includes('scaleX(-1)')) return true;
  return false;
}

describe('a conversation in a lesson', () => {
  it('shows who says each line, in order, with what it is about and the question after it', async () => {
    show(conversation());
    await settle();
    expect(screen.getByText('Listen to the conversation, then answer')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Li kafeyê' })).toBeTruthy();
    const said = ['Silav, tu çawa yî?', 'Ez baş im, spas.', 'Ez jî baş im.'].map((text) => screen.getByText(text));
    // In the order they are said.
    expect(said[0]!.compareDocumentPosition(said[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(said[1]!.compareDocumentPosition(said[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText('Xezo')).toHaveLength(2);
    expect(screen.getAllByText('Hamo')).toHaveLength(1);
    expect(screen.getByText('Xezo çawa ye?')).toBeTruthy();
    // A play button per recorded line, and none for the unrecorded one.
    expect(screen.getByRole('button', { name: 'Play line 1, said by Xezo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play line 3, said by Xezo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play line 2, said by Hamo' })).toBeNull();
  });

  it('shows the learner’s own lines as theirs, named in their language, with nothing to play, and keeps them off the stage', async () => {
    show(
      conversation({
        speakers: [
          { name: 'Hamo', character: 'hamo' },
          { name: 'Tu', character: null, learner: true },
        ],
        lines: [
          { speaker: 0, text: 'Bi xêr hatî!' },
          { speaker: 1, text: 'Bi xêr bimînî!' },
        ],
        lineAudio: [SILAV, null],
        lineVoices: [null, null],
      }),
    );
    await settle();
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('Bi xêr bimînî!')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play line 1, said by Hamo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Play line 2/ })).toBeNull();
    // Hamo alone stands on the stage, facing the learner.
    const bodies = markups().filter((xml) => xml === sameIds(characterLayers('hamo', 'full')).body);
    expect(bodies).toHaveLength(1);
  });

  it('shows the English meaning on asking, and hides it again', async () => {
    show(conversation());
    await settle();
    expect(screen.queryByText('Hi, how are you?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show translation' }));
    expect(screen.getByText('Hi, how are you?')).toBeTruthy();
    expect(screen.getByText('I’m well, thanks.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide translation' }));
    expect(screen.queryByText('Hi, how are you?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show translation' })).toBeTruthy();
  });

  it('offers no translation when no line has one, and asks for a reading when nothing is recorded', async () => {
    const lines = conversation().lines!.map(({ speaker, text }) => ({ speaker, text }));
    show(conversation({ lines, lineAudio: undefined, lineVoices: undefined }));
    await settle();
    expect(screen.getByText('Read the conversation, then answer')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show translation' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^(Play the first line|Next line|Start again)$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Play line/ })).toBeNull();
  });

  it('plays the first line by itself, then one more line per tap, lighting the one heard and passing over the one not recorded', async () => {
    show(conversation());
    await waitFor(() => expect(FakeAudio.of(SILAV)?.paused).toBe(false));
    expect(within(screen.getByTestId('conversation-heard')).getByText('Silav, tu çawa yî?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next line' })).toBeTruthy();

    // The first line ends and nothing follows it until the learner asks.
    act(() => FakeAudio.of(SILAV)!.finish());
    await settle();
    expect(FakeAudio.made.filter((a) => !a.paused)).toHaveLength(0);
    expect(screen.queryByTestId('conversation-heard')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Next line' }));
    await settle();
    expect(FakeAudio.of(BAS)!.paused).toBe(false);
    expect(within(screen.getByTestId('conversation-heard')).getByText('Ez jî baş im.')).toBeTruthy();
    // One sound at a time.
    expect(FakeAudio.made.filter((a) => !a.paused)).toHaveLength(1);

    // After the last line, the button starts again from the first.
    act(() => FakeAudio.of(BAS)!.finish());
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }));
    await settle();
    expect(within(screen.getByTestId('conversation-heard')).getByText('Silav, tu çawa yî?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next line' })).toBeTruthy();
  });

  it('waits for the learner to say their own line, then plays the answer to it', async () => {
    show(
      conversation({
        speakers: [
          { name: 'Hamo', character: 'hamo' },
          { name: 'Tu', character: null, learner: true },
        ],
        lines: [
          { speaker: 0, text: 'Bi xêr hatî!' },
          { speaker: 1, text: 'Xêra Xwedê li we bê!' },
          { speaker: 0, text: 'Tu çawa yî?' },
        ],
        lineAudio: [SILAV, null, BAS],
        lineVoices: [null, null, null],
      }),
    );
    await waitFor(() => expect(FakeAudio.of(SILAV)?.paused).toBe(false));
    act(() => FakeAudio.of(SILAV)!.finish());
    await settle();
    // The learner's turn: their line waits for them, and Hamo says nothing more until they have said it.
    expect(within(screen.getByTestId('conversation-turn')).getByText('Xêra Xwedê li we bê!')).toBeTruthy();
    expect(FakeAudio.made.filter((a) => !a.paused)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'I said it' }));
    await settle();
    expect(FakeAudio.of(BAS)!.paused).toBe(false);
    expect(screen.queryByTestId('conversation-turn')).toBeNull();
    act(() => FakeAudio.of(BAS)!.finish());
    await settle();
    expect(screen.getByRole('button', { name: 'Start again' })).toBeTruthy();
  });

  it('waits for a tap when lines do not play by themselves, goes on from a line played by its own button, and stops when the exercise goes', async () => {
    await setAutoplay(false);
    const view = show(conversation());
    await settle();
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(FakeAudio.made.filter((a) => !a.paused)).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Play the first line' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Play line 3, said by Xezo' }));
    await settle();
    expect(FakeAudio.of(BAS)!.paused).toBe(false);
    expect(screen.getByRole('button', { name: 'Start again' })).toBeTruthy();
    view.unmount();
    expect(FakeAudio.of(BAS)!.paused).toBe(true);
  });

  it('stands every part’s character together on a stage above the lines, a picture a screen reader passes over', async () => {
    show(conversation());
    await settle();
    const stage = screen.getByTestId('conversation-stage');
    const figures = within(stage).getAllByRole('img', { hidden: true });
    expect(figures.map((el) => el.getAttribute('aria-label'))).toEqual(['Said by Xezo', 'Said by Hamo']);
    // The lines below already say who says what.
    expect(screen.queryByRole('img', { name: /^Said by/ })).toBeNull();
    expect(stage.compareDocumentPosition(screen.getByText('Silav, tu çawa yî?')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Each drawn whole, for the stage's foot to cut at the waist.
    for (const who of ['xezo', 'hamo'] as const) expect(markups()).toContain(sameIds(characterLayers(who, 'full')).body);
    // The initials stay beside the lines.
    expect(screen.getAllByText('X')).toHaveLength(2);
    expect(screen.getAllByText('H')).toHaveLength(1);
  });

  it('has the line’s own character say it with the sound, while the other listens with its mouth still', async () => {
    show(conversation());
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Play line 1, said by Xezo' }));
    await settle();
    const clip = FakeAudio.of(SILAV)!;
    clip.currentTime = 0.2;
    act(() => frames.step());
    expect(mouth('xezo')).toBe('a');
    expect(mouth('hamo')).toBe('rest');

    act(() => clip.finish());
    await settle();
    expect(mouth('xezo')).toBe('rest');
    expect(frames.pending).toBe(0);
  });

  it('has the line’s own character say it, whoever its recording was saved under', async () => {
    // Xezo's line, recorded with the timeline saved under Hamo.
    show(conversation({ lineVoices: [{ ...XEZO, speaker: 'hamo' }, null, null] }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Play line 1, said by Xezo' }));
    await settle();
    const clip = FakeAudio.of(SILAV)!;
    for (const at of [0.2, 0.3, 0.4]) {
      clip.currentTime = at;
      act(() => frames.step());
      expect(mouth('xezo')).toBe('a');
      expect(mouth('hamo')).toBe('rest');
    }
  });

  it('has them look at each other, the way round the screen reads', async () => {
    const view = show(conversation());
    await settle();
    // Xezo on the left looks right at Hamo; Hamo, drawn already turned a little left, looks left at her.
    expect(irisShift('xezo')).toBeCloseTo(characterArt('xezo').irisReach!);
    expect(irisShift('hamo')).toBeCloseTo(-characterArt('hamo').irisReach!);
    expect(turnedRound('hamo')).toBe(false);
    view.unmount();

    // A Soranî course on an English screen: the lines start on the left, and so does Xezo.
    const sorani = show(conversation({ dialect: 'ckb' }));
    await settle();
    expect(turnedRound('hamo')).toBe(false);
    sorani.unmount();

    // A right-to-left screen: Xezo stands on the right where her lines start, and Hamo on the left is mirrored to face her.
    localStorage.setItem('kurda_locale_v1', 'ckb');
    show(conversation({ dialect: 'ckb' }));
    await waitFor(() => expect(turnedRound('hamo')).toBe(true));
    expect(turnedRound('xezo')).toBe(false);
    expect(irisShift('xezo')).toBeCloseTo(-characterArt('xezo').irisReach!);
    // Looking right as seen, which is his own left when mirrored.
    expect(irisShift('hamo')).toBeCloseTo(-characterArt('hamo').irisReach!);
  });

  it('turns everyone to whoever says the line, in a conversation of three', async () => {
    const deer = 'https://media.test/deer.wav';
    show(
      conversation({
        speakers: [
          { name: 'Xezo', character: 'xezo' },
          { name: 'Hamo', character: 'hamo' },
          { name: 'Hevalo', character: 'hevalo' },
        ],
        lines: [
          { speaker: 0, text: 'Silav, tu çawa yî?' },
          { speaker: 1, text: 'Ez baş im, spas.' },
          { speaker: 2, text: 'Ez jî li vir im!' },
        ],
        lineAudio: [SILAV, null, deer],
        lineVoices: [XEZO, null, null],
      }),
    );
    await settle();
    expect(within(screen.getByTestId('conversation-stage')).getAllByRole('img', { hidden: true })).toHaveLength(3);
    // Before anyone speaks, Xezo and Hamo, in the first two places, look at each other.
    expect(irisShift('xezo')).toBeGreaterThan(0);
    expect(irisShift('hamo')).toBeLessThan(0);

    // Hevalo, on the right, says his line, and both look his way.
    fireEvent.click(screen.getByRole('button', { name: 'Play line 3, said by Hevalo' }));
    await settle();
    expect(FakeAudio.of(deer)!.paused).toBe(false);
    expect(irisShift('xezo')).toBeGreaterThan(0);
    expect(irisShift('hamo')).toBeGreaterThan(0);
    // And keep looking at him once he has said it.
    act(() => FakeAudio.of(deer)!.finish());
    await settle();
    expect(irisShift('hamo')).toBeGreaterThan(0);
  });

  it('reads as before, with no stage, when a part has no character to play it', async () => {
    // Stored before every part had to have a character.
    const speakers = [{ name: 'Xezo', character: 'xezo' }, { name: 'Hamo' }] as unknown as Exercise['speakers'];
    show(conversation({ speakers }));
    await settle();
    expect(screen.queryByTestId('conversation-stage')).toBeNull();
    expect(screen.getByText('Silav, tu çawa yî?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play line 1, said by Xezo' })).toBeTruthy();
  });

  it('answers the question as a multiple-choice item is answered: by the option tapped', async () => {
    const onSelect = vi.fn();
    show(conversation(), onSelect);
    await settle();
    fireEvent.click(screen.getByRole('radio', { name: 'Baş e' }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
