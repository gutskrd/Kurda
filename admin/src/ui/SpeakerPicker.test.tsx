// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { screen, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { renderUi } from '../test/render';
import type { Speaker } from '../voice';
import { SpeakerPicker } from './SpeakerPicker';

function Picker({ start = 'hevalo', none = true, onChange }: { start?: Speaker; none?: boolean; onChange?: (s: Speaker) => void }): React.JSX.Element {
  const [value, setValue] = useState<Speaker>(start);
  return (
    <SpeakerPicker
      value={value}
      none={none}
      onChange={(s) => {
        setValue(s);
        onChange?.(s);
      }}
    />
  );
}

describe('who says it', () => {
  it('is a radio group of the three characters, each with a bust, and None', () => {
    renderUi(<Picker />);
    const group = screen.getByRole('radiogroup', { name: 'Who says it' });
    const options = within(group).getAllByRole('radio');
    expect(options.map((o) => o.textContent)).toEqual(['Hevalo', 'Hamo', 'Xezo', 'None']);
    expect(within(group).getByRole('radio', { name: 'Hevalo' })).toHaveAttribute('aria-checked', 'true');
    expect(group.querySelectorAll('img[src^="data:image/svg+xml"]')).toHaveLength(3);
    // one Tab stop: the chosen one
    expect(options.map((o) => o.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  it('moves and chooses with the arrow keys, wrapping round, and jumps with Home and End', async () => {
    const user = userEvent.setup();
    const picked = vi.fn();
    renderUi(<Picker onChange={picked} />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Hevalo' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Hamo' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Hamo' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: 'Hevalo' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(picked.mock.calls.map(([s]) => s)).toEqual(['hamo', 'hevalo', null, 'hevalo', null]);
  });

  it('chooses with a click or Space, and says nothing when the choice is already made', async () => {
    const user = userEvent.setup();
    const picked = vi.fn();
    renderUi(<Picker onChange={picked} />);
    await user.click(screen.getByRole('radio', { name: 'Hevalo' }));
    expect(picked).not.toHaveBeenCalled();
    await user.click(screen.getByRole('radio', { name: 'Xezo' }));
    screen.getByRole('radio', { name: 'Hamo' }).focus();
    await user.keyboard(' ');
    expect(picked.mock.calls.map(([s]) => s)).toEqual(['xezo', 'hamo']);
  });

  it('can leave None out, for choosing who says what has no one', () => {
    renderUi(<Picker none={false} />);
    expect(screen.getAllByRole('radio').map((o) => o.textContent)).toEqual(['Hevalo', 'Hamo', 'Xezo']);
  });
});
