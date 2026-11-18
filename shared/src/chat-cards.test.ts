import { describe, expect, it, vi } from 'vitest';
import { PLAY_CARDS_PER_READ, batchedCardReads, playCardsPath, type CardClient, type ChatGameRef } from './chat-cards.js';
import { ROUTE_NOT_FOUND_MESSAGE, type LobbyCard } from './play.js';

const card = (ref: ChatGameRef, players = 1): LobbyCard => ({ ...ref, status: 'open', players, maxPlayers: 4, summary: {}, canJoin: true, isMember: false });
const ref = (n: number): ChatGameRef => ({ game: 'wordle-battle', lobbyId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` });
/** A server answering every card asked for in a read, and the reads it was asked. */
function server() {
  const asked: string[] = [];
  const get = vi.fn(async (path: string) => {
    asked.push(path);
    const refs = new URL(path, 'http://x').searchParams.get('cards')!.split(',').map((r) => ({ game: r.split(':')[0], lobbyId: r.split(':')[1] }) as ChatGameRef);
    return { ok: true as const, data: { cards: refs.map((r) => card(r)) } };
  });
  return { asked, client: { get } as unknown as CardClient<{ code?: string; message?: string }> };
}

describe('reading a chat’s game cards', () => {
  it('names each card by its game and lobby', () => {
    expect(playCardsPath([ref(1), { game: 'stories', lobbyId: 'b' }])).toBe(`/play/cards?cards=wordle-battle:${ref(1).lobbyId},stories:b`);
  });

  it('reads the cards asked for in the same moment in one request, each getting its own', async () => {
    const { asked, client } = server();
    const read = batchedCardReads(client);
    const answers = await Promise.all([read(ref(1)), read(ref(2)), read(ref(1))]);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toBe(playCardsPath([ref(1), ref(2)]));
    expect(answers.map((a) => (a.ok ? a.data.lobbyId : null))).toEqual([ref(1).lobbyId, ref(2).lobbyId, ref(1).lobbyId]);
    // a card asked for later is a read of its own
    await read(ref(3));
    expect(asked).toHaveLength(2);
  });

  it('splits a long thread’s cards into reads the server takes', async () => {
    const { asked, client } = server();
    const read = batchedCardReads(client);
    await Promise.all(Array.from({ length: PLAY_CARDS_PER_READ + 2 }, (_, i) => read(ref(i))));
    expect(asked.map((p) => new URL(p, 'http://x').searchParams.get('cards')!.split(',').length)).toEqual([PLAY_CARDS_PER_READ, 2]);
  });

  it('gives every card the read’s failure, and a card left out of the answer reads as unavailable', async () => {
    const down = { code: 'UNAVAILABLE', message: 'down' };
    const failing = batchedCardReads({ get: async () => ({ ok: false as const, error: down }) } as unknown as CardClient<typeof down>);
    expect(await Promise.all([failing(ref(1)), failing(ref(2))])).toEqual([
      { ok: false, error: down },
      { ok: false, error: down },
    ]);
    const partial = batchedCardReads({ get: async () => ({ ok: true as const, data: { cards: [card(ref(1), 3)] } }) } as unknown as CardClient<never>);
    const [found, missing] = await Promise.all([partial(ref(1)), partial(ref(2))]);
    expect(found).toEqual({ ok: true, data: card(ref(1), 3) });
    expect(missing).toMatchObject({ ok: true, data: { ...ref(2), status: 'unavailable', canJoin: false } });
  });

  it('asks an API from before the read card by card', async () => {
    const asked: string[] = [];
    const old = {
      get: async (path: string) => {
        asked.push(path);
        if (path.startsWith('/play/cards?')) return { ok: false as const, error: { code: 'NOT_FOUND', message: ROUTE_NOT_FOUND_MESSAGE } };
        return { ok: true as const, data: card({ game: 'wordle-battle', lobbyId: path.split('/').at(-1)! }, 2) };
      },
    } as unknown as CardClient<{ code?: string; message?: string }>;
    const read = batchedCardReads(old);
    expect(await Promise.all([read(ref(1)), read(ref(2))])).toEqual([
      { ok: true, data: card(ref(1), 2) },
      { ok: true, data: card(ref(2), 2) },
    ]);
    expect(asked).toEqual([playCardsPath([ref(1), ref(2)]), `/play/cards/wordle-battle/${ref(1).lobbyId}`, `/play/cards/wordle-battle/${ref(2).lobbyId}`]);
  });
});
