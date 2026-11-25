import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GiftCard } from '@kurda/shared';
import { renderApp } from '../test/utils';
import { GiftBubble } from './GiftBubble';
import { GIFT_MOMENT_LOOK } from '@kurda/shared';
import type { GiftActions } from './GiftMoment';

afterEach(() => vi.restoreAllMocks());

const card = (over: Partial<GiftCard> = {}): GiftCard => ({
  batchId: 'b1',
  sku: 'bg-sunset',
  name: 'Sunset over Amed',
  category: 'background',
  assetUrl: '/cosmetics/backgrounds/sunset.webp',
  tier: 'common',
  recipients: [{ name: 'baran', avatarUrl: null, isMe: true, opened: false }],
  from: { userId: 'u-rojda', username: 'rojda', displayName: null, avatarUrl: null },
  myGiftId: 'g1',
  myOpened: false,
  equippable: 'background',
  ...over,
});

function actions(opened: GiftCard | null = card({ myOpened: true })): GiftActions & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    open: vi.fn(async (id: string) => {
      calls.push(`open:${id}`);
      return opened;
    }),
    thank: vi.fn(async () => {
      calls.push('thank');
      return null;
    }),
    wear: vi.fn(async (c: GiftCard) => {
      calls.push(`wear:${c.sku}`);
      return null;
    }),
  };
}

describe('GiftBubble, to its recipient', () => {
  it('waits wrapped, says who it is from, and keeps what is inside a surprise', () => {
    renderApp(<GiftBubble card={card()} mine={false} senderName="rojda" actions={actions()} />);
    const present = screen.getByRole('button', { name: 'Open the gift from rojda' });
    expect(within(present).getByText('Gift from rojda')).toBeInTheDocument();
    expect(within(present).getByText('Tap to open')).toBeInTheDocument();
    expect(screen.queryByText('Sunset over Amed')).not.toBeInTheDocument();
  });

  it('says a Hevalo member sent it when the sender may not be named to this reader', () => {
    renderApp(<GiftBubble card={card({ from: null })} mine={false} senderName="" actions={actions()} />);
    const present = screen.getByRole('button', { name: 'Open the gift from a Hevalo member' });
    expect(within(present).getByText('Gift from a Hevalo member')).toBeInTheDocument();
  });

  it('opens in its own light (skippable), then offers Say thanks, Wear it and Close', async () => {
    const a = actions();
    renderApp(<GiftBubble card={card()} mine={false} senderName="rojda" actions={a} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the gift from rojda' }));
    expect(a.calls).toEqual(['open:g1']);
    // The box waits in the light; a tap skips it.
    const moment = screen.getByRole('dialog', { name: 'A gift from rojda' });
    expect(within(moment).getByText('Unwrapping…')).toBeInTheDocument();
    await userEvent.click(within(moment).getByRole('button', { name: 'Skip' }));

    expect(await within(moment).findByText('Sunset over Amed')).toBeInTheDocument();
    expect(within(moment).getByRole('heading', { name: 'Gift from rojda' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Wear it' }));
    expect(await screen.findByText('You’re wearing it')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Say thanks' }));
    expect(await screen.findByText('Thanks sent')).toBeInTheDocument();
    expect(a.calls).toEqual(['open:g1', 'wear:bg-sunset', 'thank']);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    // Focus is back on the gift, not lost at the top of the page.
    expect(screen.getByRole('button', { name: 'See Sunset over Amed again' })).toHaveFocus();
  });

  it('gives a common gift a gentle light and a rare one brighter rays and sparkles', async () => {
    const { unmount } = renderApp(<GiftBubble card={card()} mine={false} senderName="rojda" actions={actions()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the gift from rojda' }));
    let moment = screen.getByRole('dialog', { name: 'A gift from rojda' });
    expect(moment).toHaveClass('gift-moment-common');
    expect(moment.querySelectorAll('.gift-light-sparkle')).toHaveLength(0);
    expect(moment.querySelector('.gift-light-rays path')!.getAttribute('d')!.match(/M/g)).toHaveLength(GIFT_MOMENT_LOOK.common.rays);
    unmount();

    renderApp(<GiftBubble card={card({ tier: 'rare' })} mine={false} senderName="rojda" actions={actions(card({ tier: 'rare', myOpened: true }))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the gift from rojda' }));
    moment = screen.getByRole('dialog', { name: 'A gift from rojda' });
    expect(moment).toHaveClass('gift-moment-rare');
    expect(moment.querySelectorAll('.gift-light-sparkle')).toHaveLength(GIFT_MOMENT_LOOK.rare.sparkles);
    await userEvent.click(within(moment).getByRole('button', { name: 'Skip' }));
    expect(await within(moment).findByText('Sunset over Amed')).toBeInTheDocument();
    // the light comes up to full as the gift is out, in the gift's own colour
    const light = moment.querySelector<HTMLElement>('.gift-light')!;
    expect(light).toHaveClass('is-lit');
    expect(light.style.getPropertyValue('--glow')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('holds the keyboard on its stage: Skip first, Escape skips, then Escape closes', async () => {
    renderApp(<GiftBubble card={card({ tier: 'rare' })} mine={false} senderName="rojda" actions={actions(card({ tier: 'rare', myOpened: true }))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the gift from rojda' }));
    const stage = screen.getByRole('dialog', { name: 'A gift from rojda' });
    expect(within(stage).getByRole('button', { name: 'Skip' })).toHaveFocus();
    // Tab stays on the stage.
    await userEvent.tab();
    expect(stage.contains(document.activeElement)).toBe(true);

    // While it plays, Escape skips rather than closing.
    await userEvent.keyboard('{Escape}');
    expect(await within(stage).findByText('Sunset over Amed')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See Sunset over Amed again' })).toHaveFocus();
  });

  it('goes straight to the gift in a still light when the device asks for less motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    renderApp(<GiftBubble card={card()} mine={false} senderName="rojda" actions={actions()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the gift from rojda' }));
    // No skip needed: the fade is a fifth of a second.
    expect(await screen.findByText('Sunset over Amed', { selector: 'b' })).toBeInTheDocument();
    expect(document.querySelector('.gift-light')).toHaveClass('is-still');
    // the ring and the thrown flecks are left out, the glow and the rays stay
    expect(document.querySelector('.celebrate-ring')).toBeNull();
    expect(document.querySelector('.gift-light-rays path')).not.toBeNull();
  });

  it('says so, and stays wrapped, when opening fails', async () => {
    renderApp(<GiftBubble card={card()} mine={false} senderName="rojda" actions={actions(null)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the gift from rojda' }));
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That gift didn’t open. Try again.');
    expect(screen.getByRole('button', { name: 'Open the gift from rojda' })).toBeInTheDocument();
  });

  it('says why a thanks did not go, beside the button that sent it', async () => {
    const a = actions();
    a.thank = vi.fn(async () => ({
      kind: 'client' as const,
      status: 403,
      code: 'MUTED',
      message: 'muted',
      details: { scope: 'chat', until: '2030-01-02T10:00:00.000Z' },
    }));
    renderApp(<GiftBubble card={card()} mine={false} senderName="rojda" actions={a} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the gift from rojda' }));
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Say thanks' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/You can’t send messages until .*2030/);
    expect(screen.getByRole('link', { name: 'See your account standing' })).toBeInTheDocument();
    // Say thanks is still there to try once the limit ends.
    expect(screen.getByRole('button', { name: 'Say thanks' })).toBeInTheDocument();
  });

  it('opens at once when the banner or a notification sent you to it', async () => {
    const a = actions();
    renderApp(<GiftBubble card={card()} mine={false} senderName="rojda" actions={a} autoOpen />);
    expect(a.calls).toEqual(['open:g1']);
  });
});

describe('GiftBubble, to everyone else', () => {
  it('shows its sender what they sent, and whether it has been opened', () => {
    const { rerender } = renderApp(
      <GiftBubble
        card={card({ myGiftId: null, recipients: [{ name: 'baran', avatarUrl: null, isMe: false, opened: false }] })}
        mine
        senderName="me"
        actions={actions()}
      />,
    );
    expect(screen.getByText('You sent Sunset over Amed')).toBeInTheDocument();
    expect(screen.getByText('Not opened yet')).toBeInTheDocument();
    rerender(
      <GiftBubble
        card={card({ myGiftId: null, recipients: [{ name: 'baran', avatarUrl: null, isMe: false, opened: true }] })}
        mine
        senderName="me"
        actions={actions()}
      />,
    );
    expect(screen.getByText('Opened')).toBeInTheDocument();
  });

  it('shows a group who it was for, keeping the item a surprise', () => {
    renderApp(
      <GiftBubble
        card={card({
          myGiftId: null,
          recipients: [
            { name: 'baran', avatarUrl: null, isMe: false, opened: true },
            { name: null, avatarUrl: null, isMe: false, opened: false },
          ],
        })}
        mine={false}
        senderName="rojda"
        actions={actions()}
      />,
    );
    expect(screen.getByText('Gift from rojda')).toBeInTheDocument();
    expect(screen.getByText('baran')).toBeInTheDocument();
    expect(screen.getByText('a group member')).toBeInTheDocument();
    expect(screen.queryByText(/Sunset/)).not.toBeInTheDocument();
  });

  it('names the one person a group gift was for', () => {
    // In a group "Opened ✓" alone would not say whose.
    renderApp(
      <GiftBubble
        card={card({ myGiftId: null, recipients: [{ name: 'dilan', avatarUrl: null, isMe: false, opened: true }] })}
        mine={false}
        senderName="rojda"
        actions={actions()}
        inGroup
      />,
    );
    expect(screen.getByText('dilan')).toBeInTheDocument();
    expect(screen.getByText('Opened')).toBeInTheDocument();
  });
});
