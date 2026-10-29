// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { onHaptic, resetHaptics } from '../../feedback/haptics';
import type { HapticEvent } from '../../feedback/hapticPacing';
import { FakeAudio } from '../../characters/testing/audio';
import { resetAnswerMode } from '../answerModePref';
import type { Exercise } from '../types';
import { TranslateExercise } from './TranslateExercise';
import { ListeningExercise } from './ListeningExercise';

const translate: Exercise = {
  id: 'tr',
  type: 'translate',
  prompt: 'Bibore, xatirê te!',
  bank: ['Excuse', 'goodbye', 'me', 'water'],
};

let felt: HapticEvent[] = [];
let said: string[] = [];
let stopFeeling: () => void = () => undefined;
beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: true });
  localStorage.clear();
  resetAnswerMode();
  resetHaptics();
  felt = [];
  said = [];
  stopFeeling = onHaptic((e) => felt.push(e));
  (AccessibilityInfo as unknown as { announceForAccessibility: (words: string) => void }).announceForAccessibility = (words) => said.push(words);
});
afterEach(() => {
  stopFeeling();
  cleanup();
  vi.unstubAllGlobals();
});

/** The exercise as the lesson holds it: the answer text kept above it, and shown so a test can read it. */
function Held({ exercise }: { exercise: Exercise }): React.JSX.Element {
  const [text, setText] = useState('');
  const props = { exercise, text, onChangeText: setText, disabled: false, dialect: exercise.dialect };
  return (
    <>
      {exercise.type === 'listening' ? <ListeningExercise {...props} onSkip={() => undefined} /> : <TranslateExercise {...props} />}
      <output data-testid="answer">{text}</output>
    </>
  );
}

const answer = (): string => screen.getByTestId('answer').textContent ?? '';
const line = (): HTMLElement => screen.getByTestId('word-line');
const bank = (): HTMLElement => screen.getByTestId('word-bank');

describe('an answer built from word tiles', () => {
  it('lays a tile on the line when it is tapped, leaving a ghost in its place, and sends the line as the answer', async () => {
    renderWithProviders(<Held exercise={translate} />);
    await act(async () => undefined);
    fireEvent.click(within(bank()).getByRole('button', { name: 'Excuse' }));
    resetHaptics();
    fireEvent.click(within(bank()).getByRole('button', { name: 'me' }));
    expect(answer()).toBe('Excuse me');
    expect(within(line()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Excuse', 'me']);
    // the bank keeps every place, the ones laid hidden behind their ghosts
    expect(within(bank()).queryByRole('button', { name: 'Excuse' })).toBeNull();
    expect(bank().children).toHaveLength(4);
    expect(felt).toEqual(['tap', 'tap']);
    expect(said.at(-1)).toBe('Your answer: Excuse me');
  });

  it('takes a tile off the line back to its place when it is tapped there', async () => {
    renderWithProviders(<Held exercise={translate} />);
    await act(async () => undefined);
    fireEvent.click(within(bank()).getByRole('button', { name: 'Excuse' }));
    fireEvent.click(within(bank()).getByRole('button', { name: 'me' }));
    fireEvent.click(within(line()).getByRole('button', { name: 'Excuse' }));
    expect(answer()).toBe('me');
    expect(within(bank()).getByRole('button', { name: 'Excuse' })).toBeTruthy();
    fireEvent.click(within(line()).getByRole('button', { name: 'me' }));
    expect(answer()).toBe('');
    expect(said.at(-1)).toBe('Your answer is empty');
  });

  it('can be typed instead, and this device remembers which', async () => {
    const first = renderWithProviders(<Held exercise={translate} />);
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Use keyboard' }));
    expect(screen.getByLabelText('Your translation')).toBeTruthy();
    expect(screen.queryByTestId('word-bank')).toBeNull();
    await waitFor(() => expect(localStorage.getItem('hevalo_lesson_answer_mode')).toBe('keyboard'));
    first.unmount();

    // the next one opens with the keyboard too, and the tiles are a tap away
    renderWithProviders(<Held exercise={translate} />);
    await act(async () => undefined);
    expect(screen.getByLabelText('Your translation')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use word tiles' }));
    expect(screen.getByTestId('word-bank')).toBeTruthy();
    await waitFor(() => expect(localStorage.getItem('hevalo_lesson_answer_mode')).toBeNull());
  });

  it('is typed, as it always was, when the item comes with no tiles', async () => {
    renderWithProviders(<Held exercise={{ ...translate, bank: undefined }} />);
    await act(async () => undefined);
    expect(screen.getByLabelText('Your translation')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use word tiles' })).toBeNull();
  });

  // Soranî reads from the right: the line fills from there, and the bank starts there
  it('runs right to left for Soranî, on the line and in the bank', async () => {
    FakeAudio.made = [];
    vi.stubGlobal('Audio', FakeAudio);
    const listening: Exercise = { id: 'ls', type: 'listening', audioUrl: 'https://media.test/bale.mp3', bank: ['ببورە', 'بەڵێ', 'ئاو'], dialect: 'sorani' };
    renderWithProviders(<Held exercise={listening} />);
    await act(async () => undefined);
    expect(screen.getByRole('heading', { name: 'Tap what you hear' })).toBeTruthy();
    expect(getComputedStyle(bank()).flexDirection).toBe('row-reverse');
    expect(getComputedStyle(line()).flexDirection).toBe('row-reverse');
    fireEvent.click(within(bank()).getByRole('button', { name: 'بەڵێ' }));
    fireEvent.click(within(bank()).getByRole('button', { name: 'ببورە' }));
    expect(answer()).toBe('بەڵێ ببورە');
  });
});
