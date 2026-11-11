import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PictureRadio, type PictureOption } from './PictureRadio';

/**
 * The choice among pictures: real radios under the cards and tiles, a long
 * list folded after its first rows without ever hiding the one chosen, and a
 * long name marked so a tile can set it smaller.
 */
const options: PictureOption<string>[] = Array.from({ length: 15 }, (_, i) => ({
  value: `c${i}`,
  label: i === 3 ? 'taybetmendî' : `kom ${i}`,
  hint: `group ${i}`,
  lang: 'ku',
  art: <svg aria-hidden="true" />,
  tone: '#3d8bd9',
}));

function Harness({ start, first }: { start: string; first?: number }): React.JSX.Element {
  const [value, setValue] = useState(start);
  return (
    <PictureRadio label="Category" step={3} layout="tiles" value={value} onChange={setValue} options={options} first={first} moreLabel={(count) => `Show more (${count})`} />
  );
}

describe('PictureRadio', () => {
  it('is a group of radios named by its label, the step’s number left out of the name', async () => {
    render(<Harness start="c0" />);
    const group = screen.getByRole('radiogroup', { name: 'Category' });
    expect(within(group).getAllByRole('radio')).toHaveLength(15);
    expect(within(group).getByRole('radio', { name: 'kom 0 group 0' })).toBeChecked();
    await userEvent.click(within(group).getByRole('radio', { name: /kom 2/ }));
    expect(within(group).getByRole('radio', { name: /kom 2/ })).toBeChecked();
    expect(within(group).getByRole('radio', { name: /kom 0/ })).not.toBeChecked();
    // the name is marked with its own language, the meaning beside it is not
    expect(within(group).getByText('kom 2')).toHaveAttribute('lang', 'ku');
    expect(within(group).getByText('group 2')).not.toHaveAttribute('lang');
  });

  it('folds a long list after its first choices, and shows the rest when asked', async () => {
    render(<Harness start="c0" first={12} />);
    const group = screen.getByRole('radiogroup', { name: 'Category' });
    expect(within(group).getAllByRole('radio')).toHaveLength(12);
    await userEvent.click(screen.getByRole('button', { name: 'Show more (3)' }));
    expect(within(group).getAllByRole('radio')).toHaveLength(15);
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull();
  });

  it('never folds away the one that is chosen', () => {
    render(<Harness start="c14" first={12} />);
    const group = screen.getByRole('radiogroup', { name: 'Category' });
    expect(within(group).getAllByRole('radio')).toHaveLength(13);
    expect(within(group).getByRole('radio', { name: /kom 14/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Show more (2)' })).toBeInTheDocument();
  });

  it('marks a long name, so a tile can set it a size smaller instead of cutting it', () => {
    render(<Harness start="c0" />);
    expect(screen.getByText('taybetmendî').closest('.pic-option')).toHaveClass('is-long');
    expect(screen.getByText('kom 1').closest('.pic-option')).not.toHaveClass('is-long');
  });
});
