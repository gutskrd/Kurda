/**
 * What Who Am I?'s starter identities are and what is true of each: a short
 * table of everyday things — animals, food, things in a house, jobs, places —
 * with the questions each answers yes to (`WHO_AM_I_FACTS`). Every other
 * question is a no.
 *
 * The table holds no Kurdish. A thing is named by its English meaning, lower
 * case and without an article, exactly as the course's vocabulary gives a
 * word's meaning; the starter library (content-drafts.ts `identityDrafts`)
 * finds the course's own word for it and copies that. A thing the course does
 * not teach makes no identity.
 *
 * Only answers nobody would argue with are given. Where a question has no
 * plain answer for a thing — whether a frog lives in water, whether a car runs
 * on electricity, whether people eat rabbit, whether a hen is found at home —
 * the thing is left out of the table rather than guessed at: a player who
 * reasons well must never lose to the table.
 */
import type { WhoAmICategory, WhoAmIFact } from '@kurda/shared';
import { meaningKeys } from './word-categories.js';

export interface StarterIdentity {
  /** the thing, by the first of its names below */
  thing: string;
  category: WhoAmICategory;
  /** the facts that are true of it */
  yes: readonly WhoAmIFact[];
}

type Row = readonly [names: string, yes: readonly WhoAmIFact[]];

const ANIMAL: readonly WhoAmIFact[] = ['alive', 'animal'];
const FOOD: readonly WhoAmIFact[] = ['edible', 'at-home'];
const PERSON: readonly WhoAmIFact[] = ['alive', 'person'];
const PLACE: readonly WhoAmIFact[] = ['place', 'bigger-than-person'];

/** Each row: the thing's English names, the first its own, then what is true of it beyond its kind. */
const ANIMALS: readonly Row[] = [
  ['cat', ['four-legs', 'at-home']],
  ['dog', ['four-legs', 'at-home']],
  ['horse', ['four-legs', 'bigger-than-person']],
  ['cow', ['four-legs', 'bigger-than-person', 'edible']],
  ['sheep|ewe|ram', ['four-legs', 'edible']],
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
  ['honey', ['sweet']],
  ['sugar', ['sweet']],
  ['cake', ['sweet']],
  ['chocolate', ['sweet']],
  ['jam', ['sweet']],
  ['apple', ['sweet']],
  ['grape|grapes', ['sweet']],
  ['watermelon', ['sweet']],
  ['pomegranate', ['sweet']],
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
  ['lamp', ['at-home', 'uses-electricity']],
  ['television|tv', ['at-home', 'uses-electricity']],
  ['radio', ['at-home', 'uses-electricity']],
  ['computer', ['at-home', 'uses-electricity']],
  ['telephone|phone', ['at-home', 'uses-electricity']],
  ['fridge|refrigerator', ['at-home', 'uses-electricity', 'bigger-than-person']],
  ['bus', ['bigger-than-person']],
  ['lorry|truck', ['bigger-than-person']],
  ['tractor', ['bigger-than-person']],
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
  ['nurse', ['helps-sick']],
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

function rows(category: WhoAmICategory, always: readonly WhoAmIFact[], list: readonly Row[]): Array<[string, StarterIdentity]> {
  return list.flatMap(([names, yes]) => {
    const all = names.split('|');
    const identity: StarterIdentity = { thing: all[0]!, category, yes: [...new Set([...always, ...yes])] };
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
 * The starter identity a word is, by its English meaning, or null. Only the
 * meaning the lesson gives first counts: a word taught as "craftsman, builder"
 * is a craftsman, and what is true of a builder is not known to be true of
 * it. A meaning given as a verb ("to fly") is never a thing.
 */
export function starterIdentityOf(en: string | undefined): StarterIdentity | null {
  if (!en || /^\s*to\s+/i.test(en)) return null;
  const first = meaningKeys(en)[0];
  return first ? (STARTER_IDENTITIES.get(first) ?? null) : null;
}
