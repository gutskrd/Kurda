import { describe, expect, it, vi } from 'vitest';

describe('warmRoute', () => {
  it('asks for a page’s code once, and only for pages it knows', async () => {
    const asked: string[] = [];
    vi.doMock('../pages/Learn', () => {
      asked.push('learn');
      return { Learn: () => null };
    });
    const { warmRoute } = await import('./routeWarmup');
    warmRoute('/app/learn');
    warmRoute('/app/learn/');
    warmRoute('/app/nowhere');
    await vi.waitFor(() => expect(asked).toEqual(['learn']));
    vi.doUnmock('../pages/Learn');
  });

  it('warms the page behind a link a pointer reaches, and not a link elsewhere', async () => {
    const { warmLinksOnIntent } = await import('./routeWarmup');
    const seen = vi.fn();
    vi.doMock('../pages/Shop', () => {
      seen();
      return { Shop: () => null };
    });
    warmLinksOnIntent();
    document.body.innerHTML = '<a href="https://elsewhere.example/app/shop">away</a><a href="/app/shop"><span>shop</span></a>';
    document.querySelector('a')!.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(seen).not.toHaveBeenCalled();
    document.querySelector('span')!.dispatchEvent(new Event('pointerover', { bubbles: true }));
    await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(1));
    vi.doUnmock('../pages/Shop');
  });
});
