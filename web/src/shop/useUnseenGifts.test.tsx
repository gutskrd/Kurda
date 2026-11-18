import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const rail = vi.hoisted(() => ({ gifts: 2, refresh: vi.fn() }));
vi.mock('../social/RailProvider', () => ({
  useRail: () => ({ data: { unread: { gifts: rail.gifts, requests: 0 } }, refresh: rail.refresh }),
}));

import { giftsWereOpened, useUnseenGifts } from './useUnseenGifts';

function Badge(): React.JSX.Element {
  return <span>{useUnseenGifts()}</span>;
}

afterEach(() => {
  rail.refresh.mockReset();
});

describe('the unseen gifts count', () => {
  it('shows what the rail says and asks it again when a gift is opened anywhere', () => {
    const { unmount } = render(<Badge />);
    expect(screen.getByText('2')).toBeInTheDocument();
    act(() => giftsWereOpened());
    expect(rail.refresh).toHaveBeenCalledTimes(1);
    // a badge that is gone asks nothing
    unmount();
    giftsWereOpened();
    expect(rail.refresh).toHaveBeenCalledTimes(1);
  });
});
