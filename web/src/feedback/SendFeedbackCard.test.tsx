import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/utils';
import { SendFeedbackCard } from './SendFeedbackCard';

describe('Settings → Send feedback', () => {
  it('opens the feedback form in a dialog, and closes it again', async () => {
    const user = userEvent.setup();
    renderApp(<SendFeedbackCard />);

    await user.click(screen.getByRole('button', { name: 'Send feedback' }));

    const dialog = screen.getByRole('dialog', { name: 'Send feedback' });
    expect(within(dialog).getByRole('radiogroup', { name: 'How are you enjoying Hevalo?' })).toBeInTheDocument();
    // not inside the frosted card, whose backdrop filter would trap the fixed dialog over it
    expect(dialog.closest('.card')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
