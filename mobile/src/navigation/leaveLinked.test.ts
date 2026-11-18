import { describe, expect, it, vi } from 'vitest';
import { leaveLinked } from './leaveLinked';

type Route = { name: string; state?: { index?: number; routes: Array<{ name: string }> } };

const nav = (routes: Route[]) => ({
  canGoBack: () => routes.length > 1,
  goBack: vi.fn(),
  replace: vi.fn(),
  getState: () => ({ index: routes.length - 1, routes }),
});

const tabs = (showing: string): Route => ({ name: 'Tabs', state: { index: 0, routes: [{ name: showing }] } });

describe('leaving a screen a link can open', () => {
  it('goes back to the screen that opened it', () => {
    const n = nav([tabs('Home'), { name: 'Riddles' }, { name: 'Riddle' }]);
    leaveLinked(n, 'Riddles');
    expect(n.goBack).toHaveBeenCalledTimes(1);
    expect(n.replace).not.toHaveBeenCalled();
  });

  it('goes to its collection, not Home, when a link laid the tabs under it', () => {
    const n = nav([tabs('Home'), { name: 'Riddle' }]);
    leaveLinked(n, 'Riddles');
    expect(n.replace).toHaveBeenCalledWith('Riddles');
    expect(n.goBack).not.toHaveBeenCalled();
  });

  it('goes back to a tab that opens it', () => {
    const n = nav([tabs('Learn'), { name: 'HearIt' }]);
    leaveLinked(n, 'PracticeHub', ['Learn']);
    expect(n.goBack).toHaveBeenCalledTimes(1);
  });

  it('goes to its collection when nothing at all is behind it', () => {
    const n = nav([{ name: 'Proverb' }]);
    leaveLinked(n, 'Proverbs');
    expect(n.replace).toHaveBeenCalledWith('Proverbs');
  });

  it('treats tabs that have not drawn yet as the start the link laid down', () => {
    const n = nav([{ name: 'Tabs' }, { name: 'BuildSentence' }]);
    leaveLinked(n, 'PracticeHub', ['Learn']);
    expect(n.replace).toHaveBeenCalledWith('PracticeHub');
  });
});
