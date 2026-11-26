import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../i18n/I18nProvider';
import { en } from '../i18n/en';
import { BoardAmount, BoardSwitch, SpanSwitch, boardFor, isRankKind } from './BoardSwitch';
import { RankList, RankRow } from './RankRow';

/* The rankings' switches, usable by keyboard and screen reader, and the amounts the rows show. */

/** What a row reads as, leaving out the words inside a picture that is hidden from a screen reader. */
function readable(el: Element): string {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
  return copy.textContent ?? '';
}

describe('BoardSwitch', () => {
  it('offers XP and Zêr as one choice of two, with the chosen one checked', async () => {
    const onChange = vi.fn();
    render(
      <I18nProvider>
        <BoardSwitch value="zer" onChange={onChange} />
      </I18nProvider>,
    );
    const group = screen.getByRole('group', { name: en['rankings.rankBy'] });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => readable(r.closest('label')!))).toEqual([en['rankings.board.xp'], 'Zêr']);
    expect(within(group).getByRole('radio', { name: 'Zêr' })).toBeChecked();
    // The bolt and the coin are drawn beside their names.
    expect(group.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);

    await userEvent.click(within(group).getByRole('radio', { name: en['rankings.board.xp'] }));
    expect(onChange).toHaveBeenCalledWith('xp');
    // Choosing the current board changes nothing.
    onChange.mockClear();
    await userEvent.click(within(group).getByRole('radio', { name: 'Zêr' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('draws one chosen ground for the switch, kept from screen readers, which follows the choice', () => {
    const { rerender } = render(
      <I18nProvider>
        <BoardSwitch value="xp" onChange={() => undefined} />
      </I18nProvider>,
    );
    const group = screen.getByRole('group', { name: en['rankings.rankBy'] });
    const capsules = group.querySelectorAll('.seg-capsule');
    expect(capsules).toHaveLength(1);
    expect(capsules[0]).toHaveAttribute('aria-hidden', 'true');
    rerender(
      <I18nProvider>
        <BoardSwitch value="zer" onChange={() => undefined} />
      </I18nProvider>,
    );
    // The same element, moved rather than drawn again, so it can slide.
    expect(group.querySelector('.seg-capsule')).toBe(capsules[0]);
    expect(within(group).getByRole('radio', { name: 'Zêr' })).toBeChecked();
  });

  it('knows what can be ranked by, and the board behind each choice', () => {
    expect(isRankKind('xp')).toBe(true);
    expect(isRankKind('zer')).toBe(true);
    expect(isRankKind('gewher')).toBe(false);
    expect(isRankKind('weekly_xp')).toBe(false);
    expect(isRankKind(null)).toBe(false);
    expect(boardFor('xp', 'week')).toBe('weekly_xp');
    expect(boardFor('xp', 'all')).toBe('all_time_xp');
    expect(boardFor('zer', 'all')).toBe('zer');
  });

  it('offers this week or all time, the chosen one marked', async () => {
    const onChange = vi.fn();
    render(
      <I18nProvider>
        <SpanSwitch value="week" onChange={onChange} />
      </I18nProvider>,
    );
    const group = screen.getByRole('group', { name: en['rankings.span'] });
    expect(within(group).getByRole('radio', { name: en['rankings.span.week'] })).toBeChecked();
    await userEvent.click(within(group).getByRole('radio', { name: en['rankings.span.all'] }));
    expect(onChange).toHaveBeenCalledWith('all');
  });
});

describe('a leaderboard row', () => {
  it('shows the place, the face, the name and the amount with its currency', () => {
    const { container } = render(
      <I18nProvider>
        <MemoryRouter>
          <RankList label="board">
            <RankRow rank={1} name="dilan" href="/app/users/p1" avatarUrl={null} score={<BoardAmount type="zer" amount={12400} />} />
            <RankRow rank={2} name="azad" avatarUrl={null} score={<BoardAmount type="zer" amount={75} />} />
            <RankRow rank={3} name="rojin" avatarUrl={null} score={<BoardAmount type="weekly_xp" amount={420} />} />
            <RankRow rank={4} name="baran" avatarUrl={null} score={<BoardAmount type="all_time_xp" amount={12000} />} />
          </RankList>
        </MemoryRouter>
      </I18nProvider>,
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows.map(readable)).toEqual(['1dilan12,400Zêr', '2azad75Zêr', '3rojin420 XP', '4baran12,000 XP']);
    expect(screen.getByRole('link', { name: 'dilan' })).toHaveAttribute('href', '/app/users/p1');
    // A face for every row, the silhouette where there is no picture.
    expect(container.querySelectorAll('.rank-face')).toHaveLength(4);
    // The currencies carry their pictures, XP only its unit.
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
