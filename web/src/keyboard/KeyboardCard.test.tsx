import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/utils';
import { KeyboardCard } from './KeyboardCard';
import { getKeyboardPrefs, resetKeyboardPrefsForTests } from './prefs';

beforeEach(() => resetKeyboardPrefsForTests());
afterEach(() => localStorage.clear());

describe('Settings → Keyboard and accents', () => {
  it('changes how this device types, at once', async () => {
    const user = userEvent.setup();
    renderApp(<KeyboardCard />);

    expect(screen.getByRole('heading', { name: 'Keyboard and accents' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Forgiving/ })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: /^No accents/ }));
    await user.click(screen.getByRole('checkbox', { name: /Kurdish letter keys/ }));
    await user.click(screen.getByRole('checkbox', { name: /Backtick shortcut/ }));
    await user.click(screen.getByRole('radio', { name: 'Alphabet order' }));

    expect(getKeyboardPrefs()).toMatchObject({ accentMode: 'hidden', keyBar: false, backtick: false, wordleLayout: 'alphabet' });
    // the race's own note about a race in progress is not for Settings
    expect(screen.queryByText(/A race keeps the setting/)).not.toBeInTheDocument();
  });

  it('opens the keyboard guide from Keyboard help', async () => {
    const user = userEvent.setup();
    renderApp(<KeyboardCard />);

    await user.click(screen.getByRole('button', { name: 'Keyboard help' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Get the Kurmancî keyboard' })).toBeInTheDocument();
    // not inside the frosted card, whose backdrop filter would trap the fixed dialog over it
    expect(dialog.closest('.card')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
