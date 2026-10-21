import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KindPanel, KindTabs, ResultsLine, type KindTab } from './ItemBrowser';
import { DEFAULT_SHOP_VIEW, readShopView, shopViewFiltered, shopViewSearch } from './useShopView';

function Tabs({ start = 'all' as KindTab }): React.JSX.Element {
  const [kind, setKind] = useState<KindTab>(start);
  return (
    <>
      <KindTabs kinds={['all', 'background', 'icon', 'tag']} value={kind} counts={{ all: 6, background: 3, icon: 2, tag: 1 }} idPrefix="t" onChange={setKind} />
      <KindPanel idPrefix="t" kind={kind}>
        <p>{kind}</p>
      </KindPanel>
    </>
  );
}

describe('the kind tabs', () => {
  it('are tabs, with their counts, controlling one panel named by the chosen tab', () => {
    render(<Tabs />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['All6', 'Backgrounds3', 'Icons2', 'Tags1']);
    expect(screen.getByRole('tablist')).toHaveAccessibleName('Kinds of item');
    for (const tab of tabs) expect(tab).toHaveAttribute('aria-controls', 't-panel');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('All 6');
  });

  it('move with the arrow keys, Home and End, and wrap round', async () => {
    render(<Tabs />);
    screen.getByRole('tab', { name: /All/ }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: /Tags/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Tags/ })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Icons/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('icon');
  });

  it('turn the arrows round on a right-to-left page, where the next tab is to the left', async () => {
    render(
      <div dir="rtl">
        <Tabs />
      </div>,
    );
    screen.getByRole('tab', { name: /All/ }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: /Backgrounds/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('the results line', () => {
  it('counts one and many, and offers Clear filters only when something is narrowed', async () => {
    const clear = vi.fn();
    const { rerender } = render(<ResultsLine count={1} filtered={false} onClear={clear} />);
    expect(screen.getByRole('status')).toHaveTextContent('1 item');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(<ResultsLine count={12} filtered onClear={clear} />);
    expect(screen.getByRole('status')).toHaveTextContent('12 items');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(clear).toHaveBeenCalledOnce();
  });
});

describe('the Shop’s view in the address', () => {
  it('reads back what it writes, and leaves a plain Shop a plain address', () => {
    const view = { category: 'icon' as const, query: 'çay', sort: 'price-desc' as const, afford: true, free: false };
    const search = shopViewSearch(view);
    expect(search).toBe('kind=icon&q=%C3%A7ay&sort=price-desc&afford=1');
    expect(readShopView(new URLSearchParams(search))).toEqual(view);
    expect(shopViewSearch(DEFAULT_SHOP_VIEW)).toBe('');
    expect(shopViewFiltered(DEFAULT_SHOP_VIEW)).toBe(false);
    expect(shopViewFiltered({ ...DEFAULT_SHOP_VIEW, free: true })).toBe(true);
  });

  it('ignores what it does not know', () => {
    expect(readShopView(new URLSearchParams('kind=hats&sort=random&afford=yes'))).toEqual(DEFAULT_SHOP_VIEW);
  });
});
