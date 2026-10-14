import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/utils';
import { KeyboardGuide } from './KeyboardGuide';
import { KEYBOARD_PREFS_KEY, getKeyboardPrefs, resetKeyboardPrefsForTests } from './prefs';

function onDevice(userAgent: string): void {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const CHROMEBOOK = 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/126 Safari/537.36';

beforeEach(() => resetKeyboardPrefsForTests());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Get the Kurmancî keyboard', () => {
  it('shows only this device’s steps, with its menu names as the screen says them', () => {
    onDevice(ANDROID);
    renderApp(<KeyboardGuide dialect="kurmanci" onClose={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Get the Kurmancî keyboard' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('android');
    const steps = screen.getAllByRole('listitem').filter((li) => li.closest('.kb-guide-steps'));
    expect(steps).toHaveLength(4);
    const name = screen.getByText('Kurdish (Latin)', { selector: 'b' });
    expect(name).toHaveAttribute('lang', 'en');
    expect(screen.queryByText(/Windows key/)).not.toBeInTheDocument();
  });

  it('lets somebody choose another device', async () => {
    onDevice(WINDOWS);
    const user = userEvent.setup();
    renderApp(<KeyboardGuide dialect="kurmanci" onClose={() => undefined} />);

    expect(screen.getByText(/Windows has no Kurdish \(Kurmancî\) keyboard yet/)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox'), 'mac');
    expect(screen.getByText('ABC – Extended', { selector: 'b' })).toBeInTheDocument();
    expect(screen.queryByText(/Windows has no Kurdish/)).not.toBeInTheDocument();
  });

  it('asks which device when it cannot tell', () => {
    onDevice(CHROMEBOOK);
    renderApp(<KeyboardGuide dialect="kurmanci" onClose={() => undefined} />);

    expect(screen.getByLabelText('Which device are you on?')).toHaveValue('');
    expect(document.querySelector('.kb-guide-steps')).toBeNull();
  });

  it('lights each letter up as it is typed, and cheers when all five are in', async () => {
    onDevice(ANDROID);
    const user = userEvent.setup();
    renderApp(<KeyboardGuide dialect="kurmanci" onClose={() => undefined} />);
    const box = screen.getByLabelText('Try it: type ç ê î ş û');

    await user.type(box, 'çê');
    expect(screen.getByText('ç, typed')).toBeInTheDocument();
    expect(screen.getByText('î, not yet')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 of 5');

    await user.type(box, 'îşû');
    expect(screen.getByRole('status')).toHaveTextContent('Bijî! You’ve got all of them.');
    expect(document.querySelector('.deer')).toHaveClass('deer-cheer');
  });

  it('turns the on-screen keys on and closes', async () => {
    localStorage.setItem(KEYBOARD_PREFS_KEY, JSON.stringify({ keyBar: false }));
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderApp(<KeyboardGuide dialect="kurmanci" onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Use the on-screen keys' }));

    expect(getKeyboardPrefs().keyBar).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers forgiving accents to somebody on strict ones', async () => {
    localStorage.setItem(KEYBOARD_PREFS_KEY, JSON.stringify({ accentMode: 'strict' }));
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderApp(<KeyboardGuide dialect="kurmanci" onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Make accents forgiving' }));

    expect(getKeyboardPrefs().accentMode).toBe('forgiving');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /** with the defaults (key bar on, forgiving), a way out that changed nothing was no way out */
  it('with the defaults, points at the keys already there and offers no accents at all', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderApp(<KeyboardGuide dialect="kurmanci" onClose={onClose} />);

    expect(screen.queryByRole('button', { name: 'Use the on-screen keys' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make accents forgiving' })).not.toBeInTheDocument();
    expect(screen.getByText('Tap ç ê î ş û on the keys above the text.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Race without accents' }));
    expect(getKeyboardPrefs().accentMode).toBe('hidden');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has nothing to offer somebody already racing without accents', () => {
    localStorage.setItem(KEYBOARD_PREFS_KEY, JSON.stringify({ accentMode: 'hidden' }));
    renderApp(<KeyboardGuide dialect="kurmanci" onClose={() => undefined} />);

    expect(screen.queryByText('No time now? You can race anyway:')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('has a Soranî version, right to left', () => {
    onDevice(ANDROID);
    renderApp(<KeyboardGuide dialect="sorani" onClose={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Get the Soranî keyboard' })).toBeInTheDocument();
    expect(screen.getByText('Kurdish (Iraq) Arabic', { selector: 'b' })).toBeInTheDocument();
    const box = screen.getByLabelText(/^Try it: type/);
    expect(box).toHaveAttribute('dir', 'rtl');
    expect(box).toHaveAttribute('lang', 'ckb');
  });
});
