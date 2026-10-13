import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GiftCard } from '@kurda/shared';
import { renderApp } from '../test/utils';
import { GiftBubble } from './GiftBubble';
import type { GiftActions } from './GiftReveal';

afterEach(() => vi.restoreAllMocks());

const card = (over: Partial<GiftCard> = {}): GiftCard => ({
  batchId: 'b1',
  sku: 'bg-sunset',
  name: 'Sunset over Amed',
  category: 'background',
  assetUrl: '/cosmetics/backgrounds/sunset.webp',
  tier: 'common',
  recipients: [{ name: 'baran', avatarUrl: null, isMe: true, opened: false }],
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
      return true;
    }),
    wear: vi.fn(async (c: GiftCard) => {
      calls.push(`wear:${c.sku}`);
      return true;
    }),
  };
}

describe('GiftBubble, to its recipient', () => {
  it('waits wrapped, and keeps what is inside a surprise', () => {
    renderApp(<GiftBubble card={card()} mine={false} senderName="rojda" actions={actions()} />);
    const present = screen.getByRole('button', { name: 'Open the gift from rojda' });
    expect(within(present).getByText('A gift for you')).toBeInTheDocument();
    expect(within(present).getByText('Tap to open')).toBeInTheDocument();
    expect(screen.queryByText('Sunset over Amed')).not.toBeInTheDocument();
  });

  it('bursts open in the bubble (skippable), then offers Wear it, Say thanks and Close', async () => {
    const a = actions();
    renderApp(<GiftBubble card={card()} mine={false} senderName="rojda" actions={a} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the gift from rojda' }));
    expect(a.calls).toEqual(['open:g1']);
    // the burst is playing; a tap skips it
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(await screen.findByRole('heading', { name: 'Sunset over Amed' })).toBeInTheDocument();
    expect(screen.getByText('From rojda')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Wear it' }));
    expect(await screen.findByText('You’re wearing it')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Say thanks' }));
    expect(await screen.findByText('Thanks sent')).toBeInTheDocument();
    expect(a.calls).toEqual(['open:g1', 'wear:bg-sunset', 'thank']);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'See Sunset over Amed again' })).toBeInTheDocument();
  });

  it('opens a rare gift on its own stage, which a tap can skip', async () => {
    renderApp(<GiftBubble card={card({ tier: 'rare' })} mine={false} senderName="rojda" actions={actions(card({ tier: 'rare', myOpened: true }))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the gift from rojda' }));
    const stage = screen.getByRole('dialog', { name: 'A gift from rojda' });
    expect(within(stage).getByText('Unwrapping…')).toBeInTheDocument();
    await userEvent.click(within(stage).getByRole('button', { name: 'Skip' }));
    expect(await within(stage).findByRole('heading', { name: 'Sunset over Amed' })).toBeInTheDocument();
  });

  it('gives a legendary gift the whole screen and its Newroz fire', async () => {
    renderApp(
      <GiftBubble card={card({ tier: 'legendary' })} mine={false} senderName="rojda" actions={actions(card({ tier: 'legendary', myOpened: true }))} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open the gift from rojda' }));
    const stage = screen.getByRole('dialog', { name: 'A gift from rojda' });
    expect(stage).toHaveClass('gift-stage-legendary');
    expect(stage.querySelector('.newroz-flame')).not.toBeNull();
  });

  it('fades straight to the item when the device asks for less motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    renderApp(<GiftBubble card={card()} mine={false} senderName="rojda" actions={actions()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the gift from rojda' }));
    // no skip needed: the fade is a fifth of a second
    expect(await screen.findByRole('heading', { name: 'Sunset over Amed' })).toBeInTheDocument();
  });

  it('says so, and stays wrapped, when opening fails', async () => {
    renderApp(<GiftBubble card={card()} mine={false} senderName="rojda" actions={actions(null)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the gift from rojda' }));
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That gift didn’t open. Try again.');
    expect(screen.getByRole('button', { name: 'Open the gift from rojda' })).toBeInTheDocument();
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
    expect(screen.getByText('rojda sent a gift')).toBeInTheDocument();
    expect(screen.getByText('baran')).toBeInTheDocument();
    expect(screen.getByText('a group member')).toBeInTheDocument();
    expect(screen.queryByText(/Sunset/)).not.toBeInTheDocument();
  });

  it('names the one person a group gift was for', () => {
    // in a group "Opened ✓" alone would not say whose — the sender may have
    // picked one friend, or the others may have been skipped
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
