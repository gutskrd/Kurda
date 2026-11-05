import { describe, expect, it, vi } from 'vitest';
import { filterText } from '../moderation/filter.js';
import { gateFreeText, type FreeTextDeps } from './free-text.js';

/** The chat pipeline with every check passing, each one replaceable; `restrictions` is the rows the mute check reads. */
function deps(over: Partial<FreeTextDeps> = {}, restrictions: unknown[] = []): FreeTextDeps & { offenses: string[] } {
  const offenses: string[] = [];
  return {
    db: { query: vi.fn(async () => ({ rows: restrictions, rowCount: restrictions.length })) } as unknown as FreeTextDeps['db'],
    moderation: {
      isChatMuted: async () => false,
      filter: (text: string) => filterText(text),
      recordOffense: async (id: string) => {
        offenses.push(id);
        return { count: 1, mutedUntil: null, perm: false };
      },
    },
    trust: {
      checkAction: async () => ({ allowed: true }) as never,
      assessContent: async () => ({ enforced: false }) as never,
      recordAction: vi.fn(async () => undefined),
    },
    aiMod: { moderate: async () => ({ blocked: false }) as never },
    ...over,
    offenses,
  };
}

const opts = { maxLength: 40, contentRef: 'last-letter:abc' };

describe('the free-text gate', () => {
  it('passes a clean text, tidied, and counts it against the sender’s velocity', async () => {
    const d = deps();
    await expect(gateFreeText(d, 'u1', '  Ev   ji  bo  xwarinê \u0007', opts)).resolves.toBe('Ev ji bo xwarinê');
    expect(d.trust!.recordAction).toHaveBeenCalledWith('u1', 'message');
  });

  it('refuses nothing, and too much', async () => {
    await expect(gateFreeText(deps(), 'u1', '   ', opts)).rejects.toMatchObject({ code: 'EMPTY_TEXT', statusCode: 400 });
    await expect(gateFreeText(deps(), 'u1', 'x'.repeat(41), opts)).rejects.toMatchObject({ code: 'TEXT_TOO_LONG', statusCode: 400 });
  });

  it('refuses a player muted from chat, by a sanction or by the offense ladder', async () => {
    const sanctioned = deps({}, [{ column_until: null, column_forever: false, forever: true, until: null }]);
    await expect(gateFreeText(sanctioned, 'u1', 'silav', opts)).rejects.toMatchObject({ statusCode: 403 });
    const laddered = deps({ moderation: { ...deps().moderation, isChatMuted: async () => true } });
    await expect(gateFreeText(laddered, 'u1', 'silav', opts)).rejects.toMatchObject({ code: 'CHAT_MUTED', statusCode: 403 });
  });

  it('refuses a sender over their velocity cap, and spam', async () => {
    const fast = deps({ trust: { ...deps().trust!, checkAction: async () => ({ allowed: false }) as never } });
    await expect(gateFreeText(fast, 'u1', 'silav', opts)).rejects.toMatchObject({ code: 'TRUST_VELOCITY', statusCode: 429 });
    const spam = deps({ trust: { ...deps().trust!, assessContent: async () => ({ enforced: true }) as never } });
    await expect(gateFreeText(spam, 'u1', 'silav', opts)).rejects.toMatchObject({ code: 'AUTO_MODERATED', statusCode: 403 });
  });

  it('refuses a flagged text outright and records the offense', async () => {
    const d = deps();
    await expect(gateFreeText(d, 'u1', 'you s.h.i.t', opts)).rejects.toMatchObject({ code: 'TEXT_NOT_ALLOWED', statusCode: 422 });
    expect(d.offenses).toEqual(['u1']);
  });

  it('refuses what the classifier blocks, telling it where the text was', async () => {
    const moderate = vi.fn(async () => ({ blocked: true }) as never);
    await expect(gateFreeText(deps({ aiMod: { moderate } }), 'u1', 'silav', opts)).rejects.toMatchObject({ code: 'CONTENT_BLOCKED' });
    expect(moderate).toHaveBeenCalledWith(expect.objectContaining({ surface: 'chat', contentType: 'game', contentRef: 'last-letter:abc', authorId: 'u1' }));
  });
});
