/**
 * Chat messages that are more than text: a gift and a game card with its live state. Stored as a message kind with a
 * reference, never as text to parse, so a card can change state without editing the message. Old text messages holding an
 * invite link still render as cards through `parseInvite`.
 */
import type { GiftCard } from './gifts.js';
import { isMissingRoute, type LobbyCard, type PlayGame } from './play.js';

export const CHAT_MESSAGE_KINDS = ['text', 'gift', 'game'] as const;
export type ChatMessageKind = (typeof CHAT_MESSAGE_KINDS)[number];

/** The lobby a game card points at; its state is fetched live. */
export interface ChatGameRef {
  game: PlayGame;
  lobbyId: string;
}

/** What a message carries besides its text, by kind. `body` is null for 'gift' and 'game'; clients write the list line ("🎁 Gift") from the kind. */
export interface ChatMessageExtras {
  kind: ChatMessageKind;
  gift: GiftCard | null;
  game: ChatGameRef | null;
}

/** The most cards one read asks for (GET /play/cards); more are split into further reads. */
export const PLAY_CARDS_PER_READ = 30;

/** The read of several cards at once: `GET /play/cards?cards=<game>:<lobbyId>,…`, answered `{ cards }` in the same order. */
export function playCardsPath(refs: readonly ChatGameRef[]): string {
  return `/play/cards?cards=${refs.map((r) => `${r.game}:${encodeURIComponent(r.lobbyId)}`).join(',')}`;
}

type Answer<T, E> = { ok: true; data: T } | { ok: false; error: E };

/** What the card reads need of an app's API client. */
export interface CardClient<E> {
  get<T>(path: string): Promise<Answer<T, E>>;
}

const cardKey = (ref: ChatGameRef): string => `${ref.game}:${ref.lobbyId}`;

/**
 * Game cards asked for in the same moment, read in one request: a chat opening on several cards, or reading them all
 * again on reconnect, asks once. A card asked for twice before the read shares it. A card the answer leaves out reads
 * as unavailable, as a game that is gone does. An API from before this read is asked card by card.
 */
export function batchedCardReads<E extends { code?: string; message?: string }>(
  client: CardClient<E>,
  waitMs = 0,
): (ref: ChatGameRef) => Promise<Answer<LobbyCard, E>> {
  type Waiting = Array<(answer: Answer<LobbyCard, E>) => void>;
  let queued = new Map<string, { ref: ChatGameRef; waiting: Waiting }>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const settle = (waiting: Waiting, answer: Answer<LobbyCard, E>): void => {
    for (const done of waiting) done(answer);
  };
  const flush = (): void => {
    const asked = [...queued.values()];
    queued = new Map();
    timer = null;
    for (let i = 0; i < asked.length; i += PLAY_CARDS_PER_READ) {
      const part = asked.slice(i, i + PLAY_CARDS_PER_READ);
      void client.get<{ cards: LobbyCard[] }>(playCardsPath(part.map((p) => p.ref))).then((res) => {
        if (!res.ok && isMissingRoute(res.error)) {
          for (const { ref, waiting } of part) {
            void client.get<LobbyCard>(`/play/cards/${ref.game}/${encodeURIComponent(ref.lobbyId)}`).then((one) => settle(waiting, one));
          }
          return;
        }
        const read = res.ok ? new Map(res.data.cards.map((c) => [cardKey(c), c])) : null;
        for (const { ref, waiting } of part) {
          if (!res.ok) settle(waiting, res);
          else settle(waiting, { ok: true, data: read!.get(cardKey(ref)) ?? { ...ref, status: 'unavailable', players: 0, maxPlayers: 0, summary: {}, canJoin: false, isMember: false } });
        }
      });
    }
  };
  return (ref) =>
    new Promise((resolve) => {
      const entry = queued.get(cardKey(ref)) ?? { ref, waiting: [] };
      entry.waiting.push(resolve);
      queued.set(cardKey(ref), entry);
      timer ??= setTimeout(flush, waitMs);
    });
}
