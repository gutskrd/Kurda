import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../i18n/I18nProvider';
import { en } from '../i18n/en';
import { BoardAmount, BoardSwitch, isBoardType } from './BoardSwitch';
import { RankList, RankRow } from './RankRow';

/**
 * The switch between the three leaderboards and the amounts their rows show:
 * one choice of three that a keyboard and a screen reader can use, and each
 * currency drawn as the app draws it everywhere else.
 */

/** What a row reads as, leaving out the words inside a picture that is hidden from a screen reader. */
function readable(el: Element): string {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
  return copy.textContent ?? '';
}

describe('BoardSwitch', () => {
  it('offers the three boards as one choice of three, with the chosen one checked', async () => {
    const onChange = vi.fn();
    render(
      <I18nProvider>
        <BoardSwitch value="zer" onChange={onChange} />
      </I18nProvider>,
    );
    const group = screen.getByRole('group', { name: en['rankings.rankBy'] });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => readable(r.closest('label')!))).toEqual([en['rankings.board.weeklyXp'], 'Zêr', en['rankings.board.gewher']]);
    expect(within(group).getByRole('radio', { name: 'Zêr' })).toBeChecked();
    // the coin and the gem are the app’s own pictures, beside their names
    expect(group.querySelectorAll('svg').length).toBeGreaterThanOrEqual(3);

    await userEvent.click(within(group).getByRole('radio', { name: en['rankings.board.gewher'] }));
    expect(onChange).toHaveBeenCalledWith('gewher');
    // choosing the one already chosen changes nothing
    onChange.mockClear();
    await userEvent.click(within(group).getByRole('radio', { name: 'Zêr' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('knows the boards the server has, and nothing else', () => {
    expect(isBoardType('weekly_xp')).toBe(true);
    expect(isBoardType('zer')).toBe(true);
    expect(isBoardType('gewher')).toBe(true);
    expect(isBoardType('gems')).toBe(false);
    expect(isBoardType(null)).toBe(false);
  });
});

describe('a leaderboard row', () => {
  it('shows the place, the face, the name and the amount with its currency', () => {
    const { container } = render(
      <I18nProvider>
        <MemoryRouter>
          <RankList label="board">
            <RankRow rank={1} name="dilan" href="/app/users/p1" avatarUrl={null} score={<BoardAmount type="zer" amount={12400} />} />
            <RankRow rank={2} name="azad" avatarUrl={null} score={<BoardAmount type="gewher" amount={75} />} />
            <RankRow rank={3} name="rojin" avatarUrl={null} score={<BoardAmount type="weekly_xp" amount={420} />} />
          </RankList>
        </MemoryRouter>
      </I18nProvider>,
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows.map(readable)).toEqual(['1dilan12,400Zêr', `2azad75${en['rankings.board.gewher']}`, '3rojin420 XP']);
    expect(screen.getByRole('link', { name: 'dilan' })).toHaveAttribute('href', '/app/users/p1');
    // a face for every row, the silhouette where there is no picture
    expect(container.querySelectorAll('.rank-face')).toHaveLength(3);
    // the currencies carry their pictures, XP its unit only
    expect(rows[0]!.querySelector('.rank-amount svg')).not.toBeNull();
    expect(rows[1]!.querySelector('.rank-amount svg')).not.toBeNull();
    expect(rows[2]!.querySelector('.rank-amount')).toBeNull();
  });

  it('draws a dash, and no podium, for your own row below the cut of a board', () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <RankList>
            <RankRow rank={null} name="You" score={<BoardAmount type="zer" amount={35} />} me />
          </RankList>
        </MemoryRouter>
      </I18nProvider>,
    );
    const row = screen.getByRole('listitem');
    expect(row.querySelector('.rank-pos')!.textContent).toBe('–');
    expect(row).not.toHaveClass('is-podium');
    expect(row).toHaveClass('rank-me');
  });
});
