// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WidgetSettings } from '@kurda/shared';
import { Platform } from 'react-native';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('./reload', () => ({ reloadLetterWidget: vi.fn(), resetReloadClock: vi.fn() }));
// This device has no widget token in the test, so the preview draws the paper itself rather than fetching the picture.
vi.mock('./storage', () => ({
  readWidgetConfig: vi.fn(async () => null),
  writeWidgetConfig: vi.fn(async () => undefined),
  writeWidgetLocale: vi.fn(async () => undefined),
  clearWidgetConfig: vi.fn(async () => undefined),
  widgetTokenRejected: vi.fn(async () => false),
  markWidgetTokenRejected: vi.fn(async () => undefined),
}));

import { describeError } from '../api/errors';
import type { ApiResult } from '../api/types';
import { TRANSLATIONS } from '../i18n/translations';
import { fakeClient, fail, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { LetterWidgetScreen } from './LetterWidgetScreen';
import { reloadLetterWidget } from './reload';
import { resetTokenRun } from './tokens';

const LETTER = {
  id: '6a0f2b8e-0000-4000-8000-000000000001',
  threadId: '6a0f2b8e-0000-4000-8000-0000000000aa',
  from: { name: 'Rojda', bird: 3 },
  excerpt: 'Silav heval! Îro li gund baran barî.',
  sentAt: '2026-11-14T10:00:00.000Z',
  paper: { style: 'lined' as const, tone: 'cream' as const, ink: 'navy' as const },
  rtl: false,
  drawn: false,
};

const settings = (over: Partial<WidgetSettings> = {}): WidgetSettings => ({ pinnedLetterId: null, showWords: true, letter: LETTER, pinned: false, widgets: 1, ...over });

const puts = () => (testAuth.client as unknown as { calls: Array<{ method: string; path: string; body: unknown }> }).calls.filter((c) => c.method === 'PUT');

beforeEach(() => {
  resetTokenRun();
  vi.mocked(reloadLetterWidget).mockClear();
});

afterEach(() => cleanup());

describe('the letter widget’s page', () => {
  it('shows the letter on the widget now, on its paper, and says it is the newest', async () => {
    testAuth.client = fakeClient({ 'GET /letters/widget/prefs': ok(settings()) });
    renderWithProviders(<LetterWidgetScreen onExit={() => undefined} />);
    expect(await screen.findByText('Rojda')).toBeTruthy();
    expect(screen.getByText(LETTER.excerpt)).toBeTruthy();
    expect(screen.getByText(TRANSLATIONS.en['letterWidget.showsNewest'])).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Always show the newest letter' })).toBeNull();
    expect(screen.getByRole('img', { name: /^Rojda\. Silav heval!/ })).toBeTruthy();
  });

  it('lets a letter kept on the widget go, back to always the newest, and asks the widget to catch up', async () => {
    testAuth.client = fakeClient({
      'GET /letters/widget/prefs': ok(settings({ pinnedLetterId: LETTER.id, pinned: true })),
      'PUT /letters/widget/prefs': ok(settings()),
    });
    renderWithProviders(<LetterWidgetScreen onExit={() => undefined} />);
    expect(await screen.findByText(TRANSLATIONS.en['letterWidget.showsPinned'])).toBeTruthy();
    expect(screen.getByRole('img', { name: /Kept on your widget/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Always show the newest letter' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Always show the newest letter' })).toBeNull());
    expect(puts().map((c) => c.body)).toEqual([{ pinnedLetterId: null }]);
    expect(reloadLetterWidget).toHaveBeenCalledTimes(1);
    expect(screen.getByText(TRANSLATIONS.en['letterWidget.showsNewest'])).toBeTruthy();
  });

  it('turns the words off, and the widget is sealed: the paper and who it is from', async () => {
    testAuth.client = fakeClient({
      'GET /letters/widget/prefs': ok(settings()),
      'PUT /letters/widget/prefs': ok(settings({ showWords: false, letter: { ...LETTER, excerpt: '' } })),
    });
    renderWithProviders(<LetterWidgetScreen onExit={() => undefined} />);
    const words = await screen.findByRole('switch', { name: 'Show the words' });
    expect(words.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(words);
    expect(await screen.findByText('A letter from Rojda')).toBeTruthy();
    expect(screen.queryByText(LETTER.excerpt)).toBeNull();
    expect(puts().map((c) => c.body)).toEqual([{ showWords: false }]);
    expect(screen.getByRole('switch', { name: 'Show the words' }).getAttribute('aria-checked')).toBe('false');
    // And why it matters, said beside the switch.
    expect(screen.getByText(TRANSLATIONS.en['letterWidget.wordsPrivate'])).toBeTruthy();
  });

  it('puts the switch back and says why when the server would not take the change', async () => {
    const refusal = { kind: 'network' as const, message: 'offline' };
    testAuth.client = fakeClient({ 'GET /letters/widget/prefs': ok(settings()), 'PUT /letters/widget/prefs': fail(refusal) });
    renderWithProviders(<LetterWidgetScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Show the words' }));
    const said = describeError({ status: 403, ...refusal }, (key) => TRANSLATIONS.en[key]);
    expect(await screen.findByText(said)).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Show the words' }).getAttribute('aria-checked')).toBe('true');
    expect(reloadLetterWidget).not.toHaveBeenCalled();
  });

  it('says how to add the widget on this phone, in a few steps, and never another platform’s way', async () => {
    testAuth.client = fakeClient({ 'GET /letters/widget/prefs': ok(settings({ letter: null })) });
    renderWithProviders(<LetterWidgetScreen onExit={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Add it to your home screen' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'iPhone' })).toBeTruthy();
    expect(screen.getByText('Tap Edit, then Add Widget. On older iPhones, tap + instead.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Android' })).toBeNull();
    expect(screen.queryByText('Tap Widgets.')).toBeNull();
    // With no letter yet, the preview is the empty sill.
    expect(screen.getByText('No letter yet')).toBeTruthy();
  });

  it('on an Android phone, says the Android way only', async () => {
    const os = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      testAuth.client = fakeClient({ 'GET /letters/widget/prefs': ok(settings({ letter: null })) });
      renderWithProviders(<LetterWidgetScreen onExit={() => undefined} />);
      expect(await screen.findByRole('heading', { name: 'Android' })).toBeTruthy();
      expect(screen.getByText('Tap Widgets.')).toBeTruthy();
      expect(screen.queryByRole('heading', { name: 'iPhone' })).toBeNull();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    }
  });

  it('takes the widget off the other phones when it is on more than one, and this phone keeps its own', async () => {
    testAuth.client = fakeClient({
      'GET /letters/widget/prefs': ok(settings({ widgets: 3 })),
      'DELETE /letters/widget/tokens': ok(null),
      'POST /letters/widget/tokens': ok({ token: 'hvw_fresh' }),
    });
    renderWithProviders(<LetterWidgetScreen onExit={() => undefined} />);
    expect(await screen.findByText('Your letter widget is on 3 phones.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Take it off your other phones' }));
    expect(await screen.findByText(TRANSLATIONS.en['letterWidget.othersDone'])).toBeTruthy();
    const calls = (testAuth.client as unknown as { calls: Array<{ method: string; path: string }> }).calls.map((c) => `${c.method} ${c.path}`);
    expect(calls).toContain('DELETE /letters/widget/tokens');
    expect(calls).toContain('POST /letters/widget/tokens');
  });

  it('offers nothing about other phones when this is the only one', async () => {
    testAuth.client = fakeClient({ 'GET /letters/widget/prefs': ok(settings({ widgets: 1 })) });
    renderWithProviders(<LetterWidgetScreen onExit={() => undefined} />);
    await screen.findByText('Rojda');
    expect(screen.queryByRole('button', { name: 'Take it off your other phones' })).toBeNull();
  });

  it('offers to try again when the page could not load', async () => {
    let answer: ApiResult<unknown> = fail({ kind: 'network', message: 'offline' });
    testAuth.client = fakeClient({ 'GET /letters/widget/prefs': () => answer });
    renderWithProviders(<LetterWidgetScreen onExit={() => undefined} />);
    const retry = await screen.findByRole('button', { name: TRANSLATIONS.en['common.retry'] });
    answer = ok(settings());
    fireEvent.click(retry);
    expect(await screen.findByText('Rojda')).toBeTruthy();
  });
});
