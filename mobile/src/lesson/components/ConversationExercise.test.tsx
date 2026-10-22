// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { encodeLipsync, type RecordingVoice } from '@kurda/shared';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { FakeAudio, fakeFrames, type Frames } from '../../characters/testing/audio';
import { characterLayers } from '../../characters/layers';
import type { Exercise } from '../types';
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

/** Rojda greets Azad; the middle line is not recorded yet, and only the first is said by a character. */
function conversation(extra: Partial<Exercise> = {}): Exercise {
  return {
    id: 'c1',
    type: 'conversation',
    title: 'Li kafeyê',
    speakers: [{ name: 'Rojda', character: 'xezo' }, { name: 'Azad' }],
    lines: [
      { speaker: 0, text: 'Silav, tu çawa yî?', en: 'Hi, how are you?' },
      { speaker: 1, text: 'Ez baş im, spas.', en: 'I’m well, thanks.' },
      { speaker: 0, text: 'Ez jî baş im.' },
    ],
    lineAudio: [SILAV, null, BAS],
    lineVoices: [XEZO, null, null],
    prompt: 'Rojda çawa ye?',
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
});

async function settle(): Promise<void> {
  await act(async () => undefined);
}

function show(exercise: Exercise, onSelect: (i: number) => void = () => undefined) {
  return renderWithProviders(<ConversationExercise exercise={exercise} choice={null} onSelect={onSelect} disabled={false} />);
}

/** the shape of the mouth Xezo shows now, in her tile */
function mouth(): string | undefined {
  const drawn = [...document.querySelectorAll('svg[data-markup]')].map((el) => el.getAttribute('data-markup'));
  return Object.entries(characterLayers('xezo', 'bust').mouths).find(([, xml]) => drawn.includes(xml))?.[0];
}

describe('a conversation in a lesson', () => {
  it('shows who says each line, in order, with what it is about and the question after it', async () => {
    show(conversation());
    await settle();
    expect(screen.getByText('Listen to the conversation, then answer')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Li kafeyê' })).toBeTruthy();
    const said = ['Silav, tu çawa yî?', 'Ez baş im, spas.', 'Ez jî baş im.'].map((text) => screen.getByText(text));
    // in the order they are said
    expect(said[0]!.compareDocumentPosition(said[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(said[1]!.compareDocumentPosition(said[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText('Rojda')).toHaveLength(2);
    expect(screen.getAllByText('Azad')).toHaveLength(1);
    expect(screen.getByText('Rojda çawa ye?')).toBeTruthy();
    // a play button for each recorded line, and none for the one not recorded yet
    expect(screen.getByRole('button', { name: 'Play line 1, said by Rojda' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play line 3, said by Rojda' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play line 2, said by Azad' })).toBeNull();
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
    expect(screen.queryByRole('button', { name: 'Play conversation' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Play line/ })).toBeNull();
  });

  it('plays every recorded line in order, lighting the one heard and passing over the one not recorded', async () => {
    show(conversation());
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Play conversation' }));
    await settle();
    expect(FakeAudio.of(SILAV)!.paused).toBe(false);
    expect(within(screen.getByTestId('conversation-heard')).getByText('Silav, tu çawa yî?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();

    act(() => FakeAudio.of(SILAV)!.finish());
    await settle();
    expect(FakeAudio.of(BAS)!.paused).toBe(false);
    expect(within(screen.getByTestId('conversation-heard')).getByText('Ez jî baş im.')).toBeTruthy();
    // one sound at a time
    expect(FakeAudio.made.filter((a) => !a.paused)).toHaveLength(1);

    act(() => FakeAudio.of(BAS)!.finish());
    await settle();
    expect(screen.queryByTestId('conversation-heard')).toBeNull();
    expect(screen.getByRole('button', { name: 'Play conversation' })).toBeTruthy();
  });

  it('stops when asked, and when the exercise goes', async () => {
    const view = show(conversation());
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Play conversation' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await settle();
    expect(FakeAudio.of(SILAV)!.paused).toBe(true);
    expect(screen.queryByTestId('conversation-heard')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Play line 3, said by Rojda' }));
    await settle();
    expect(FakeAudio.of(BAS)!.paused).toBe(false);
    view.unmount();
    expect(FakeAudio.of(BAS)!.paused).toBe(true);
  });

  it('shows the character saying a line it has a voice for, while it plays, and the initial again after', async () => {
    show(conversation());
    await settle();
    expect(screen.queryByRole('img', { name: 'Said by Xezo' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Play line 1, said by Rojda' }));
    await settle();
    expect(screen.getByRole('img', { name: 'Said by Xezo' })).toBeTruthy();
    const clip = FakeAudio.of(SILAV)!;
    clip.currentTime = 0.2;
    act(() => frames.step());
    expect(mouth()).toBe('a');

    act(() => clip.finish());
    await settle();
    expect(screen.queryByRole('img', { name: 'Said by Xezo' })).toBeNull();

    // a line with no voice of its own plays with nobody drawn saying it
    fireEvent.click(screen.getByRole('button', { name: 'Play line 3, said by Rojda' }));
    await settle();
    expect(FakeAudio.of(BAS)!.paused).toBe(false);
    expect(screen.queryByRole('img', { name: /^Said by/ })).toBeNull();
  });

  it('answers the question as a multiple-choice item is answered: by the option tapped', async () => {
    const onSelect = vi.fn();
    show(conversation(), onSelect);
    await settle();
    fireEvent.click(screen.getByRole('radio', { name: 'Baş e' }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
