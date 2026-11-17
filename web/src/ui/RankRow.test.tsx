import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import postcss, { type Rule } from 'postcss';
import { RankList, RankRow } from './RankRow';

/*
 * A row whose name is a link answers across the whole row: the link's own
 * `::after` is stretched over the row, so a finger that lands on the place,
 * the face or the score still opens the profile, and a control after the
 * score lies over the stretch and keeps its own presses. The markup is
 * checked in the page; the stretch itself is the stylesheet's, so that is
 * read from the disk (a stylesheet a test imports arrives empty) and held to
 * what the stretch needs. This workspace's types are the browser's, so the
 * little asked of the machine the suite runs on is described here in full.
 */
interface FileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
  readdirSync(dir: URL, options: { recursive: true }): string[];
}
const fileSystem = 'node:fs';
const { readFileSync, readdirSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
// the app's sources, wherever the suite is run from; held in a name, so the build does not take it for an asset of its own
const here = import.meta.url;
const src = new URL('../', here);
const sheets = readdirSync(src, { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => p.endsWith('.css'))
  .map((p) => ({ path: p, root: postcss.parse(readFileSync(new URL(p, src), 'utf8'), { from: p }) }));

/** Every rule in every stylesheet that names exactly this selector in its list. */
function rulesFor(selector: string): Array<{ path: string; rule: Rule }> {
  const out: Array<{ path: string; rule: Rule }> = [];
  for (const { path, root } of sheets) root.walkRules((rule) => void (rule.selectors.includes(selector) && out.push({ path, rule })));
  return out;
}

/** What a selector's rules say a property is, in the order they are written. */
function said(selector: string, prop: string): string[] {
  return rulesFor(selector).flatMap(({ rule }) => rule.nodes.filter((n) => n.type === 'decl' && n.prop === prop).map((n) => (n.type === 'decl' ? n.value : '')));
}

function board(row: React.ReactNode): HTMLElement {
  render(
    <MemoryRouter>
      <RankList label="board">{row}</RankList>
    </MemoryRouter>,
  );
  return screen.getByRole('list', { name: 'board' });
}

describe('a leaderboard row with a profile to open', () => {
  it('has the name as its one link, standing in the row itself so it can be stretched over it', () => {
    const list = board(<RankRow rank={4} name="dilan" href="/app/users/p1" avatarUrl={null} score="1,200 XP" />);
    const row = within(list).getByRole('listitem');
    const links = within(row).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('dilan');
    expect(links[0]).toHaveAttribute('href', '/app/users/p1');
    expect(links[0]).toHaveClass('rank-name');
    // the stretch is measured from the row, so the link is the row’s own child and not inside anything else that might be positioned
    expect(links[0]!.parentElement).toBe(row);
    expect(row).toHaveClass('rank-row');
  });

  it('keeps a control after the score out of the link, so it keeps its own presses', () => {
    const list = board(<RankRow rank={2} name="azad" href="/app/users/p2" score="80 XP" trailing={<button type="button">More</button>} />);
    const row = within(list).getByRole('listitem');
    const more = within(row).getByRole('button', { name: 'More' });
    expect(more.closest('a')).toBeNull();
    expect(within(row).getAllByRole('link')).toHaveLength(1);
  });

  it('has no link at all where there is no profile to go to', () => {
    const list = board(<RankRow rank={1} name="rojin" score="2,400 XP" me />);
    expect(within(list).queryByRole('link')).toBeNull();
  });
});

describe('the stretch, as the stylesheet writes it', () => {
  it('positions the row and stretches the link’s own pseudo-element over all of it', () => {
    expect(said('.rank-row', 'position')).toEqual(['relative']);
    expect(said('a.rank-name::after', 'content')).toEqual(["''"]);
    expect(said('a.rank-name::after', 'position')).toEqual(['absolute']);
    // and half the 2px between rows above and below, so the rows’ areas meet and none reaches into the next row
    expect(said('.rank-list', 'gap')).toEqual(['2px']);
    expect(said('a.rank-name::after', 'inset')).toEqual(['-1px 0']);
  });

  it('never positions the name, whose own clipping for the ellipsis would cut the stretch down to the words', () => {
    expect(said('.rank-name', 'overflow')).toEqual(['hidden']);
    const positioned: string[] = [];
    for (const { path, root } of sheets) {
      root.walkRules((rule) => {
        // the name itself, as the last part of a selector: not its pseudo-elements, and not a rule for what it is not
        const names = rule.selectors.filter((s) => /\.rank-name(?![\w-])/.test(s.replace(/:not\([^)]*\)/g, '').split(/[\s>+~]+/).pop() ?? '') && !s.includes('::'));
        if (names.length && rule.nodes.some((n) => n.type === 'decl' && n.prop === 'position')) positioned.push(`${path}: ${names.join(', ')}`);
      });
    }
    expect(positioned).toEqual([]);
  });

  it('lays every other control in the row over the stretch', () => {
    expect(said('.rank-row :is(a, button):not(.rank-name)', 'position')).toEqual(['relative']);
    expect(said('.rank-row :is(a, button):not(.rank-name)', 'z-index')).toEqual(['1']);
  });
});
