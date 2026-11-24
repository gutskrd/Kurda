// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { PromptToken } from '@kurda/shared';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { PromptWords } from './PromptWords';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const tokens: PromptToken[] = [
  { text: 'Bibore', meanings: ['excuse me', 'pardon me', 'sorry'] },
  { text: ', ' },
  { text: 'xatirê te', meanings: ['goodbye'] },
  { text: '!' },
];

describe('the words of a prompt', () => {
  it('makes each word the course knows a button, and leaves the rest as text', () => {
    renderWithProviders(<PromptWords prompt="Bibore, xatirê te!" tokens={tokens} />);
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Bibore', 'xatirê te']);
    expect(screen.getByText('!')).toBeTruthy();
  });

  it('opens what a word means under it when it is tapped, and closes on a tap anywhere else', async () => {
    renderWithProviders(<PromptWords prompt="Bibore, xatirê te!" tokens={tokens} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bibore' }));
    });
    const meanings = await screen.findByTestId('prompt-meanings');
    for (const meaning of ['excuse me', 'pardon me', 'sorry']) expect(meanings.textContent).toContain(meaning);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('prompt-meanings')).toBeNull();
  });

  it('makes every word of a Kurdish line a tap away, saying when there is no meaning for it yet', async () => {
    renderWithProviders(<PromptWords prompt="Spas!" tokens={[{ text: 'Spas' }, { text: '!' }]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Spas' }));
    });
    expect((await screen.findByTestId('prompt-meanings')).textContent).toContain('No meaning for this word yet.');
  });

  it('is only its text where only known words open and none is known', () => {
    renderWithProviders(<PromptWords prompt="Spas!" tokens={[{ text: 'Spas' }, { text: '!' }]} everyWord={false} />);
    expect(screen.getByText('Spas!')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says a word’s meaning waits when it would give the answer away, and names the word an inflected one comes from', async () => {
    const line: PromptToken[] = [{ text: 'Çayê', meanings: ['tea'], base: 'çay' }, { text: ' ' }, { text: 'vedixwim', withheld: true }];
    renderWithProviders(<PromptWords prompt="Çayê vedixwim" tokens={line} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Çayê' }));
    });
    const meanings = await screen.findByTestId('prompt-meanings');
    expect(meanings.textContent).toContain('tea');
    expect(meanings.textContent).toContain('from çay');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'vedixwim' }));
    });
    expect((await screen.findByTestId('prompt-meanings')).textContent).toContain('Its meaning would give the answer away.');
  });

  it('runs right to left for a prompt in Soranî', () => {
    renderWithProviders(<PromptWords prompt="ببورە، خوات لەگەڵ" tokens={[{ text: 'ببورە', meanings: ['sorry'] }, { text: '، ' }, { text: 'خوات لەگەڵ', meanings: ['goodbye'] }]} />);
    const word = screen.getByRole('button', { name: 'ببورە' });
    expect(getComputedStyle(word.parentElement!).flexDirection).toBe('row-reverse');
  });
});
