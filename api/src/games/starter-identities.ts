/**
 * Who Am I?'s starter identities and their facts: a short table of everyday things (animals, food, household things,
 * jobs, places) with the questions each answers yes to (`WHO_AM_I_FACTS`) and the few it answers "sometimes" to, where
 * honest people could say either. Every other question its kind is asked is no; questions its kind is never asked are
 * left unset and never dealt with the card.
 *
 * The curated deck (who-am-i-deck.ts) is what the game plays with; this table only makes cards for course words the
 * deck lacks.
 *
 * The table holds no Kurdish: things are named by English meaning, lower case without article, as the course's
 * vocabulary gives them, and the starter library (content-drafts.ts `identityDrafts`) copies the course's word. Things
 * the course does not teach make no identity.
 *
 * Only indisputable answers are given; a thing with any debatable answer is left out, so a player who reasons well
 * never loses to the table.
 */
import type { WhoAmICategory, WhoAmIFact } from '@kurda/shared';
import { meaningKeys } from './word-categories.js';

export interface StarterIdentity {
  /** the thing, by the first of its names below */
  thing: string;
  category: WhoAmICategory;
  /** the facts that are true of it */
  yes: readonly WhoAmIFact[];
  /** the facts that are true of it only sometimes */
  sometimes: readonly WhoAmIFact[];
  /** every fact it is asked about: its kind's, and any of its own */
  asked: readonly WhoAmIFact[];
}

/**
 * Each row: the thing's English names (its own first), what is true of it beyond its kind, and extras: what is only
 * sometimes true, facts asked of it that its kind is not asked (a tractor works outdoors), and meanings that are
 * another thing altogether (a word glossed "nanny" is not a nurse).
 */
type Row = readonly [names: string, yes: readonly WhoAmIFact[], more?: { sometimes?: readonly WhoAmIFact[]; asks?: readonly WhoAmIFact[]; unless?: readonly string[] }];

const ANIMAL: readonly WhoAmIFact[] = ['alive', 'animal'];
const FOOD: readonly WhoAmIFact[] = ['edible'];
const PERSON: readonly WhoAmIFact[] = ['alive', 'person'];
const PLACE: readonly WhoAmIFact[] = ['place', 'bigger-than-person'];

/** The questions each kind of thing is asked: the wide ones, and the narrow ones that make sense for it. */
const WIDE: readonly WhoAmIFact[] = ['alive', 'animal', 'person', 'edible', 'place'];
const ASKED: Record<'animal' | 'food' | 'object' | 'profession' | 'place', readonly WhoAmIFact[]> = {
  animal: [...WIDE, 'can-fly', 'lives-in-water', 'four-legs', 'bigger-than-person', 'at-home', 'works-outdoors'],
  food: [...WIDE, 'sweet', 'helps-sick'],
  object: [...WIDE, 'can-fly', 'bigger-than-person', 'at-home', 'uses-electricity'],
  profession: [...WIDE, 'helps-sick', 'works-outdoors'],
  place: [...WIDE, 'bigger-than-person', 'at-home', 'helps-sick'],
};

const ANIMALS: readonly Row[] = [
  ['cat', ['four-legs', 'at-home']],
  // a dog lives in the yard or with the flock in many homes, and a sheepdog works outdoors
  ['dog', ['four-legs'], { sometimes: ['at-home', 'works-outdoors'] }],
  // a village horse ploughs and carries loads; a town's does not
  ['horse', ['four-legs', 'bigger-than-person'], { sometimes: ['works-outdoors'] }],
  ['cow', ['four-legs', 'bigger-than-person', 'edible']],
  // "sheep" is the flock or small livestock at large in many regions: the ram is the one card that means one animal
  ['ram', ['four-legs', 'edible']],
  ['goat', ['four-legs', 'edible']],
  ['lamb', ['four-legs', 'edible']],
  ['elephant', ['four-legs', 'bigger-than-person']],
  ['bear', ['four-legs', 'bigger-than-person']],
  ['wolf', ['four-legs']],
  ['fox', ['four-legs']],
  ['squirrel', ['four-legs']],
  ['hedgehog', ['four-legs']],
  ['bird', ['can-fly']],
  ['eagle', ['can-fly']],
  ['falcon', ['can-fly']],
  ['sparrow', ['can-fly']],
  ['crow', ['can-fly']],
  ['owl', ['can-fly']],
  ['stork', ['can-fly']],
  ['bee', ['can-fly']],
  ['butterfly', ['can-fly']],
  ['fish', ['lives-in-water', 'edible']],
  ['snake', []],
  ['scorpion', []],
];

const FOODS: readonly Row[] = [
  ['bread', []],
  ['cheese', []],
  ['rice', []],
  ['meat', []],
  ['egg', []],
  ['soup', []],
  ['salt', []],
  ['butter', []],
  ['yoghurt|yogurt', []],
  ['tomato', []],
  ['onion', []],
  ['potato', []],
  ['cucumber', []],
  ['garlic', []],
  ['olive', []],
  ['walnut', []],
  // the household's cough remedy, though nobody calls it medicine
  ['honey', ['sweet'], { sometimes: ['helps-sick'] }],
  ['sugar', ['sweet']],
  ['cake', ['sweet']],
  ['chocolate', ['sweet']],
  ['jam', ['sweet']],
  ['apple', ['sweet']],
  ['grape|grapes', ['sweet']],
  ['watermelon', ['sweet']],
  // sour pomegranates are as common as sweet ones
  ['pomegranate', [], { sometimes: ['sweet'] }],
  ['fig', ['sweet']],
  ['banana', ['sweet']],
  ['pear', ['sweet']],
  ['peach', ['sweet']],
  ['apricot', ['sweet']],
  ['cherry', ['sweet']],
  ['melon', ['sweet']],
];

const OBJECTS: readonly Row[] = [
  ['table', ['at-home']],
  ['chair', ['at-home']],
  ['book', ['at-home']],
  ['pen', ['at-home']],
  ['key', ['at-home']],
  ['cup', ['at-home']],
  ['glass', ['at-home']],
  ['plate', ['at-home']],
  ['spoon', ['at-home']],
  ['knife', ['at-home']],
  ['pillow', ['at-home']],
  ['blanket', ['at-home']],
  ['mirror', ['at-home']],
  ['bed', ['at-home', 'bigger-than-person']],
  ['door', ['at-home', 'bigger-than-person']],
  ['wardrobe|cupboard', ['at-home', 'bigger-than-person']],
  // the oil lamp is a lamp too
  ['lamp', ['at-home'], { sometimes: ['uses-electricity'] }],
  ['television|tv', ['at-home', 'uses-electricity']],
  ['radio', ['at-home', 'uses-electricity']],
  ['computer', ['at-home', 'uses-electricity']],
  ['telephone|phone', ['at-home', 'uses-electricity']],
  ['fridge|refrigerator', ['at-home', 'uses-electricity', 'bigger-than-person']],
  ['bus', ['bigger-than-person']],
  ['lorry|truck', ['bigger-than-person']],
  ['tractor', ['bigger-than-person', 'works-outdoors'], { asks: ['works-outdoors'] }],
  ['ship', ['bigger-than-person']],
  ['boat', ['bigger-than-person']],
  ['airplane|aeroplane|plane', ['can-fly', 'bigger-than-person']],
  ['helicopter', ['can-fly', 'bigger-than-person']],
  ['stone', []],
];

const PROFESSIONS: readonly Row[] = [
  ['teacher', []],
  ['cook|chef', []],
  ['baker', []],
  ['tailor', []],
  ['barber', []],
  ['writer', []],
  ['singer', []],
  ['lawyer', []],
  ['judge', []],
  ['shopkeeper', []],
  ['merchant', []],
  ['carpenter', []],
  ['blacksmith', []],
  ['doctor', ['helps-sick']],
  // a nanny or a wet-nurse raised a family's children and nursed nobody sick
  ['nurse', ['helps-sick'], { unless: ['nanny', 'wet-nurse', 'wet nurse', 'nursemaid'] }],
  ['dentist', ['helps-sick']],
  ['pharmacist', ['helps-sick']],
  ['farmer', ['works-outdoors']],
  ['shepherd', ['works-outdoors']],
  ['gardener', ['works-outdoors']],
  ['fisherman', ['works-outdoors']],
  ['builder', ['works-outdoors']],
  ['postman', ['works-outdoors']],
];

const PLACES: readonly Row[] = [
  ['school', []],
  ['market|bazaar', []],
  ['village', []],
  ['city|town', []],
  ['mountain', []],
  ['river', []],
  ['sea', []],
  ['lake', []],
  ['forest', []],
  ['mosque', []],
  ['shop|store', []],
  ['restaurant', []],
  ['bakery', []],
  ['library', []],
  ['park', []],
  ['airport', []],
  ['hotel', []],
  ['cinema', []],
  ['university', []],
  ['church', []],
  ['station', []],
  ['bank', []],
  ['museum', []],
  ['cafe|café', []],
  ['farm', []],
  ['castle', []],
  ['office', []],
  ['factory', []],
  ['beach', []],
  ['desert', []],
  ['island', []],
  ['cave', []],
  ['zoo', []],
  ['hospital', ['helps-sick']],
  ['pharmacy', ['helps-sick']],
  ['kitchen', ['at-home']],
  ['bathroom', ['at-home']],
  ['bedroom', ['at-home']],
  ['room', ['at-home']],
];

const UNLESS = new Map<string, ReadonlySet<string>>();

function rows(category: keyof typeof ASKED, always: readonly WhoAmIFact[], list: readonly Row[]): Array<[string, StarterIdentity]> {
  return list.flatMap(([names, yes, more]) => {
    const all = names.split('|');
    const identity: StarterIdentity = {
      thing: all[0]!,
      category,
      yes: [...new Set([...always, ...yes])],
      sometimes: more?.sometimes ?? [],
      asked: [...new Set([...ASKED[category], ...(more?.asks ?? [])])],
    };
    if (more?.unless) UNLESS.set(identity.thing, new Set(more.unless));
    return all.map((name): [string, StarterIdentity] => [name, identity]);
  });
}

/** Every name a thing goes by, to the thing. */
export const STARTER_IDENTITIES: ReadonlyMap<string, StarterIdentity> = new Map([
  ...rows('animal', ANIMAL, ANIMALS),
  ...rows('food', FOOD, FOODS),
  ...rows('object', [], OBJECTS),
  ...rows('profession', PERSON, PROFESSIONS),
  ...rows('place', PLACE, PLACES),
]);

/**
 * The starter identity a word is, by English meaning, or null. Only the lesson's first meaning counts ("craftsman,
 * builder" is a craftsman), and a verb meaning ("to fly") is never a thing.
 */
export function starterIdentityOf(en: string | undefined): StarterIdentity | null {
  if (!en || /^\s*to\s+/i.test(en)) return null;
  const keys = meaningKeys(en);
  const found = keys[0] ? (STARTER_IDENTITIES.get(keys[0]) ?? null) : null;
  // a gloss that also names another thing the row is not ("nurse, nanny") is that other thing, and no card is made
  const unless = found ? UNLESS.get(found.thing) : undefined;
  if (found && unless && [...unless].some((u) => en.toLowerCase().includes(u))) return null;
  return found;
}
