// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// react-native-web with the accessibility state kept, so the test can see the button busy
vi.mock('react-native', () => import('../../play/testing/native'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('@react-navigation/native', () => import('./testing/navigation'));
import { useState } from 'react';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { onHaptic, resetHaptics } from '../../feedback/haptics';
import { PACING, type HapticEvent } from '../../feedback/hapticPacing';
import { TRANSLATIONS } from '../../i18n/translations';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { GuideField } from './GuideField';
import { StepFlow, type FlowStep, type StepOutcome } from './StepFlow';

/*
 * One question per screen: an answer that is refused stays, with a line under
 * the field and Hevalo's doubt; one that passes gets a tick and the next
 * question, the bar a step fuller; the chevron goes back a question and out of
 * the flow from the first; the server's refusal about an earlier answer goes
 * back to that question; and the last step going through finishes the flow.
 */

patchReactNativeWeb({ reduceMotion: true });
const en = TRANSLATIONS.en;

let felt: HapticEvent[] = [];
let stop: () => void = () => undefined;

beforeEach(() => {
  resetHaptics();
  felt = [];
  stop = onHaptic((e) => felt.push(e));
});
afterEach(() => {
  stop();
  cleanup();
});

/** A two-question flow: a name that must not be empty, then a word the server has the last say on. */
function Flow({ onFinish, onExit, commit }: { onFinish: () => void; onExit?: () => void; commit: (word: string) => Promise<StepOutcome> }) {
  const [name, setName] = useState('');
  const [word, setWord] = useState('');
  const steps: FlowStep[] = [
    {
      key: 'name',
      question: 'What is your name?',
      says: 'Hello there.',
      check: () => (name.trim() ? null : 'Say a name first.'),
      render: (tools) => <GuideField tools={tools} value={name} onChangeText={setName} label="Name" testID="name" />,
    },
    {
      key: 'word',
      question: 'A word?',
      says: 'Any word.',
      action: 'Send',
      render: (tools) => <GuideField tools={tools} value={word} onChangeText={setWord} label="Word" last testID="word" />,
      commit: () => commit(word),
    },
  ];
  return <StepFlow steps={steps} onFinish={onFinish} onExit={onExit} />;
}

/** a step on its way out has gone */
async function turned(): Promise<void> {
  await waitFor(() => expect(document.querySelector('[data-testid^="slide-out"]')).toBeNull());
}

async function press(name: string): Promise<void> {
  await turned();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

const bar = () => screen.getByRole('progressbar');
const bubble = () => screen.getByTestId('speech-bubble').textContent;

describe('StepFlow', () => {
  it('refuses an empty answer with a line under the field and Hevalo’s doubt, and stays on the question', async () => {
    renderWithProviders(<Flow onFinish={() => undefined} commit={async () => ({ ok: true })} />);
    expect(bubble()).toBe('Hello there.');
    expect(bar().getAttribute('aria-valuenow')).toBe('1');
    await press(en['common.continue']);
    expect(screen.getByTestId('step-error').textContent).toBe('Say a name first.');
    expect(bubble()).toBe(en['guide.refused.says']);
    expect(screen.getByText('What is your name?')).toBeTruthy();
    expect(felt).toEqual([]);
  });

  it('takes the line away as soon as the answer changes', async () => {
    renderWithProviders(<Flow onFinish={() => undefined} commit={async () => ({ ok: true })} />);
    await press(en['common.continue']);
    expect(screen.getByTestId('step-error')).toBeTruthy();
    fireEvent.change(screen.getByTestId('name'), { target: { value: 'R' } });
    expect(screen.queryByTestId('step-error')).toBeNull();
  });

  it('moves on when the answer passes, with a tick, the next question and the bar a step fuller', async () => {
    renderWithProviders(<Flow onFinish={() => undefined} commit={async () => ({ ok: true })} />);
    fireEvent.change(screen.getByTestId('name'), { target: { value: 'Rojda' } });
    await press(en['common.continue']);
    expect(await screen.findByText('A word?')).toBeTruthy();
    expect(felt).toEqual(['select']);
    expect(bar().getAttribute('aria-valuenow')).toBe('2');
    expect(bubble()).toBe('Any word.');
    // the step before is on its way out, to the start side, and then gone
    await turned();
    expect(screen.queryByText('What is your name?')).toBeNull();
  });

  it('goes on from the keyboard’s return key as it does from the button', async () => {
    renderWithProviders(<Flow onFinish={() => undefined} commit={async () => ({ ok: true })} />);
    fireEvent.change(screen.getByTestId('name'), { target: { value: 'Rojda' } });
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('name'), { key: 'Enter', code: 'Enter' });
    });
    expect(await screen.findByText('A word?')).toBeTruthy();
  });

  it('goes back a question with the answer kept, and out of the flow from the first', async () => {
    const onExit = vi.fn();
    renderWithProviders(<Flow onFinish={() => undefined} onExit={onExit} commit={async () => ({ ok: true })} />);
    fireEvent.change(screen.getByTestId('name'), { target: { value: 'Rojda' } });
    await press(en['common.continue']);
    await screen.findByText('A word?');
    await press(en['common.back']);
    expect(await screen.findByText('What is your name?')).toBeTruthy();
    await turned();
    expect((screen.getByTestId('name') as HTMLInputElement).value).toBe('Rojda');
    expect(bar().getAttribute('aria-valuenow')).toBe('1');
    await press(en['common.back']);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('has no way back from the first question when the flow has no way out', async () => {
    renderWithProviders(<Flow onFinish={() => undefined} commit={async () => ({ ok: true })} />);
    expect(screen.queryByRole('button', { name: en['common.back'] })).toBeNull();
  });

  it('says the server’s refusal under the field and stays, with the button busy meanwhile', async () => {
    let answer: (out: StepOutcome) => void = () => undefined;
    const commit = () => new Promise<StepOutcome>((resolve) => (answer = resolve));
    renderWithProviders(<Flow onFinish={() => undefined} commit={commit} />);
    fireEvent.change(screen.getByTestId('name'), { target: { value: 'Rojda' } });
    await press(en['common.continue']);
    await screen.findByText('A word?');
    fireEvent.change(screen.getByTestId('word'), { target: { value: 'av' } });
    await press('Send');
    expect(screen.getByRole('button', { name: 'Send' }).getAttribute('aria-busy')).toBe('true');
    await act(async () => answer({ ok: false, error: 'Not that word.', says: 'Another word, maybe?' }));
    expect(screen.getByTestId('step-error').textContent).toBe('Not that word.');
    expect(bubble()).toBe('Another word, maybe?');
    expect(screen.getByText('A word?')).toBeTruthy();
  });

  it('goes back to the question a refusal is about, with the line under its field', async () => {
    renderWithProviders(<Flow onFinish={() => undefined} commit={async () => ({ ok: false, error: 'Not that name.', at: 'name' })} />);
    fireEvent.change(screen.getByTestId('name'), { target: { value: 'Rojda' } });
    await press(en['common.continue']);
    await screen.findByText('A word?');
    await press('Send');
    expect(await screen.findByText('What is your name?')).toBeTruthy();
    expect(screen.getByTestId('step-error').textContent).toBe('Not that name.');
    expect(bar().getAttribute('aria-valuenow')).toBe('1');
  });

  it('finishes the flow when the last step goes through', async () => {
    const onFinish = vi.fn();
    renderWithProviders(<Flow onFinish={onFinish} commit={async () => ({ ok: true })} />);
    fireEvent.change(screen.getByTestId('name'), { target: { value: 'Rojda' } });
    await press(en['common.continue']);
    await screen.findByText('A word?');
    // a person takes longer than the pacer's gap between two taps; a test that did not lost the second buzz
    await new Promise((resolve) => setTimeout(resolve, PACING.minGapMs + 10));
    await press('Send');
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
    expect(felt).toEqual(['select', 'select']);
  });
});
