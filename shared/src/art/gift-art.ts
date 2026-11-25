/**
 * The gifts' pictures, painted as gouache on cut paper (gift-paint.ts): a glass of tea, a cup of coffee on a kilim, a
 * rose, a sleeping kitten, a rowing boat with its lantern, a village house, the full moon and the galaxy. Each must read
 * as one clear shape at 48 px in a chat line and keep its small details for the 240 px unwrap. One drawing serves the
 * light page and the dark, so pale things carry a warm edge and night skies are cut out as a patch of their own.
 * New gifts go on the end of `GIFT_ART_IDS`, so each picture's file keeps its name.
 */
import { Drawing, checkSize, prefixFor, seeded } from './svg.js';
import { type Rnd } from './gift-paint.js';
import { ask, hesp, kevok, kew, pezkovi, pisik } from './gift-art-animals.js';
import { beybun, desteGul, gul, lale, nergiz, sosin } from './gift-art-flowers.js';
import { belem, gemi, keleh, kelek, kon, kosk, mal } from './gift-art-homes.js';
import { heyv, kadiz, keskesor, pet, roj, sterk } from './gift-art-sky.js';
import { kawa, sahmaran } from './gift-art-lore.js';
import { cay, def, qehwe, saz, semawer, sev } from './gift-art-warm.js';

/** The gifts drawn so far, in the order their files are numbered. */
export const GIFT_ART_IDS = [
  'cay', 'qehwe', 'gul', 'pisik', 'belem', 'mal', 'heyv', 'kadiz', 'beybun', 'sev', 'lale', 'nergiz', 'kevok', 'sosin', 'kew', 'semawer',
  'def', 'deste-gul', 'sterk', 'kelek', 'saz', 'ask', 'keskesor', 'pezkovi', 'pet', 'hesp', 'kon', 'gemi', 'kosk', 'keleh', 'roj', 'kawa',
  'sahmaran',
] as const;
export type GiftArtId = (typeof GIFT_ART_IDS)[number];

export function isGiftArtId(id: string): id is GiftArtId {
  return (GIFT_ART_IDS as readonly string[]).includes(id);
}

/** What each picture shows: its label until an app passes a translated one. */
const LABELS: Readonly<Record<GiftArtId, string>> = {
  cay: 'A glass of tea on its saucer',
  qehwe: 'A cup of Kurdish coffee on a kilim',
  gul: 'A red rose tied with twine',
  pisik: 'A kitten asleep on a cushion',
  belem: 'A rowing boat with a lantern',
  mal: 'A village house with a flat roof',
  heyv: 'The full moon over the mountains',
  kadiz: 'The galaxy',
  beybun: 'A sprig of chamomile',
  sev: 'A red apple with a leaf',
  lale: 'A red tulip',
  nergiz: 'A bunch of narcissus tied with a ribbon',
  kevok: 'A pigeon with a letter on a blossoming branch',
  sosin: 'A purple iris',
  kew: 'A partridge on a rock',
  semawer: 'A samovar with glasses of tea on a tray',
  def: 'A frame drum',
  'deste-gul': 'A bouquet of roses, tulips and narcissus wrapped in paper',
  sterk: 'A shooting star',
  kelek: 'A raft of logs and skins on the river',
  saz: 'A saz',
  ask: 'Hevalo the deer in a meadow',
  keskesor: 'A rainbow over the hills',
  pezkovi: 'A wild goat on a rock',
  pet: 'The Newroz fire',
  hesp: 'A horse with a woven saddle cloth',
  kon: 'A black tent of the nomads',
  gemi: 'A sailing ship',
  kosk: 'A stone mansion with arches',
  keleh: 'A castle on a hill',
  roj: 'The sun',
  kawa: 'Kawa’s hammer of Damascus steel on a stone, embers at its foot',
  sahmaran: 'A framed folk painting of Şahmaran, queen of the serpents',
};

/** A picture's file under /cosmetics, named as the shop's drawn art is: its place in the list, then its id. */
export function giftArtKey(id: GiftArtId): string {
  return `gifts/made-${String(GIFT_ART_IDS.indexOf(id) + 1).padStart(2, '0')}-${id}.png`;
}

export interface GiftArtOptions {
  id: GiftArtId;
  size?: number;
  title?: string;
  idPrefix?: string;
}

/** A gift's picture on its own transparent square. */
export function giftArtSvg(opts: GiftArtOptions): string {
  const id = opts.id;
  if (!isGiftArtId(id)) throw new RangeError(`art: no gift picture ${String(id)}`);
  const size = checkSize(opts.size, 120);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'gift', id));
  PAINTERS[id](dr, seeded(`gift|${id}`));
  return dr.svg(size, opts.title ?? LABELS[id]);
}

const PAINTERS: Readonly<Record<GiftArtId, (dr: Drawing, rnd: Rnd) => void>> = {
  cay, qehwe, gul, pisik, belem, mal, heyv, kadiz, beybun, sev, lale, nergiz, kevok, sosin, kew, semawer,
  def, 'deste-gul': desteGul, sterk, kelek, saz, ask, keskesor, pezkovi, pet, hesp, kon, gemi, kosk, keleh, roj, kawa, sahmaran,
};
