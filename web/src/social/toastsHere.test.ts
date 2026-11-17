import { describe, expect, it } from 'vitest';
import { toastsHere, type Arrival } from './useSocialRail';

const T = '11111111-2222-4333-8444-555555555555';
const note = (key: string, letter?: Arrival['letter']): Arrival => ({ key, kind: 'notification', title: 'A title', body: '', who: null, ...(letter ? { letter } : {}) });

describe('toastsHere', () => {
  const arrivals = [note('gift'), note('letter', { threadId: T }), note('loose', { threadId: null })];

  it('announces letters everywhere but where they are already shown', () => {
    expect(toastsHere(arrivals, '/app').map((a) => a.key)).toEqual(['gift', 'letter', 'loose']);
    expect(toastsHere(arrivals, '/app/letters/22222222-3333-4444-8555-666666666666').map((a) => a.key)).toEqual(['gift', 'letter', 'loose']);
  });

  it('leaves letters to the window on the letters page, and to their correspondence there', () => {
    expect(toastsHere(arrivals, '/app/letters').map((a) => a.key)).toEqual(['gift']);
    expect(toastsHere(arrivals, '/app/letters/').map((a) => a.key)).toEqual(['gift']);
    expect(toastsHere(arrivals, `/app/letters/${T}`).map((a) => a.key)).toEqual(['gift', 'loose']);
  });
});
