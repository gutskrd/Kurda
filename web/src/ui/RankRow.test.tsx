import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import postcss, { type Rule } from 'postcss';
import { RankList, RankRow } from './RankRow';

/*
 * A row whose name is a link answers across the whole row, through the link's stretched `::after`, while a trailing
 * control keeps its own presses. The stylesheets are read from disk, since an imported stylesheet arrives empty in
 * tests; this workspace has browser types, so the file system calls are typed here.
 */
interface FileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
  readdirSync(dir: URL, options: { recursive: true }): string[];
}
const fileSystem = 'node:fs';
const { readFileSync, readdirSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
// The app's sources, wherever the suite runs from; held in a variable so the bundler does not treat it as an asset.
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
    // The stretch is measured from the row, so the link must be the row’s direct child.
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
    // Half the 2px gap above and below, so the rows’ areas meet without overlapping.
    expect(said('.rank-list', 'gap')).toEqual(['2px']);
    expect(said('a.rank-name::after', 'inset')).toEqual(['-1px 0']);
  });

  it('never positions the name, whose own clipping for the ellipsis would cut the stretch down to the words', () => {
    expect(said('.rank-name', 'overflow')).toEqual(['hidden']);
    const positioned: string[] = [];
    for (const { path, root } of sheets) {
      root.walkRules((rule) => {
        // Rules whose last part is the name itself, not its pseudo-elements or a :not() of it.
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
