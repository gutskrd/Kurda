/**
 * The living rounds of the warm gifts (gift-art-warm.ts): tea and coffee, the apple, the samovar, the drum and the saz.
 * Each layer named here is painted by the gift's drawing under the same name, back to front.
 */
import { giftLoop, giftLoopWisp, type GiftLoop } from './gift-loop.js';
import type { GiftArtId } from './gift-art.js';

/** Five wisps off the tea, born a fifth of the round apart, so one is always rising as another goes. */
const cay = giftLoop(4200, {
  steam1: giftLoopWisp([46, 6, 10, 31], [51.6, 35], 0.6, { lift: 5, turn: 0.4 }),
  steam2: giftLoopWisp([59, 10, 8, 28], [61, 35.6], 0.8, { lift: 6, turn: 2.2 }),
  steam3: giftLoopWisp([68, 18, 7, 18], [69.6, 34], 0.45, { lift: 7, curl: 9, turn: 4 }),
  steam4: giftLoopWisp([53, 8, 9, 29], [56.2, 35.2], 0.2, { lift: 6, turn: 5.1 }),
  steam5: giftLoopWisp([61, 15, 8, 22], [65.6, 35], 0.0, { lift: 7, turn: 1.3 }),
});

export const WARM_LOOPS: Readonly<Partial<Record<GiftArtId, GiftLoop>>> = { cay };
