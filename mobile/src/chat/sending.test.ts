import { describe, expect, it } from 'vitest';
import { restoredDraft, withoutFirst, type Outgoing } from './sending';

const on = (id: string, body: string): Outgoing => ({ id, body, createdAt: '2026-10-20T10:00:00Z' });

describe('messages on their way', () => {
  it('lets one echo answer one send, however many said the same words', () => {
    const list = [on('sending-1', 'ok'), on('sending-2', 'ok'), on('sending-3', 'baş e')];
    expect(withoutFirst(list, 'ok').map((m) => m.id)).toEqual(['sending-2', 'sending-3']);
    expect(withoutFirst(list, 'na').map((m) => m.id)).toEqual(['sending-1', 'sending-2', 'sending-3']);
  });

  it('puts refused words back before whatever was typed since, and alone into an empty field', () => {
    expect(restoredDraft('Silav', '')).toBe('Silav');
    expect(restoredDraft('Silav', '   ')).toBe('Silav');
    expect(restoredDraft('Silav', 'Çawa yî?')).toBe('Silav\nÇawa yî?');
  });
});
