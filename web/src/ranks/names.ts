/**
 * What every tier, season, badge and reason is called, as catalogue keys.
 *
 * Contract 4 names things in Kurdish with their meaning beside them: "Çiya ·
 * Mountain", "Kanî · Spring", "Agir · Fire". The Kurdish name is the name — it
 * reads the same in every language, and Soranî readers get it in their own
 * script — and the meaning is what gets translated. Both are catalogue
 * entries, so a native speaker can correct either in one place [review].
 *
 * Records of literal keys rather than `ranks.tier.${tier}`: the i18n check
 * finds a key by reading it in quotes, and the compiler can only check a key it
 * can see whole. A template would silently print the key on a typo.
 */
import type {
  BadgeFamily,
  BadgeTierKey,
  BadgeUnit,
  Division,
  FriendlyReason,
  LeagueTier,
  RankReason,
  RankTier,
  RankedGame,
  SeasonName,
} from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import { GAME_NAME_KEY } from '../play/playApi';

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** A name and what it means; the meaning is null where it would only repeat the name (Kurdish readers). */
export interface Named {
  name: string;
  meaning: string | null;
}

function named(t: Translate, nameKey: MessageKey, meaningKey: MessageKey): Named {
  const name = t(nameKey);
  const meaning = t(meaningKey);
  return { name, meaning: meaning && meaning !== name ? meaning : null };
}

/** "Çiya (Mountain)": the one-line form, for labels and screen readers. */
export function withMeaning(t: Translate, n: Named): string {
  return n.meaning ? t('ranks.nameMeaning', { name: n.name, meaning: n.meaning }) : n.name;
}

// ---- game ranks -----------------------------------------------------------------

const RANK_TIER_NAME: Record<RankTier, MessageKey> = {
  dest: 'ranks.tier.dest',
  gir: 'ranks.tier.gir',
  zozan: 'ranks.tier.zozan',
  ciya: 'ranks.tier.ciya',
  lutke: 'ranks.tier.lutke',
  sterk: 'ranks.tier.sterk',
};

const RANK_TIER_MEANING: Record<RankTier, MessageKey> = {
  dest: 'ranks.meaning.dest',
  gir: 'ranks.meaning.gir',
  zozan: 'ranks.meaning.zozan',
  ciya: 'ranks.meaning.ciya',
  lutke: 'ranks.meaning.lutke',
  sterk: 'ranks.meaning.sterk',
};

export function rankTierNamed(t: Translate, tier: RankTier): Named {
  return named(t, RANK_TIER_NAME[tier], RANK_TIER_MEANING[tier]);
}

/** Divisions are Roman numerals in every language, the way the art draws them as chevrons. */
export const ROMAN: Record<Division, string> = { 3: 'III', 2: 'II', 1: 'I' };

/** "Gir II", or "Stêrk" (the apex has no divisions), or the tier alone without one. */
export function rankLabel(t: Translate, tier: RankTier, division: Division | null | undefined): string {
  const name = t(RANK_TIER_NAME[tier]);
  if (tier === 'sterk' || !division) return name;
  return t('ranks.tierDivision', { tier: name, division: ROMAN[division] });
}

/** The game's own name ("Peyvok Battle"), from the play layer's map. */
export function gameName(t: Translate, game: RankedGame): string {
  return t(GAME_NAME_KEY[game]);
}

const REASON_KEY: Record<RankReason, MessageKey> = {
  placement: 'rankResult.reason.placement',
  'beat-stronger': 'rankResult.reason.beatStronger',
  'expected-win': 'rankResult.reason.expectedWin',
  won: 'rankResult.reason.won',
  draw: 'rankResult.reason.draw',
  'lost-to-stronger': 'rankResult.reason.lostToStronger',
  'lost-to-weaker': 'rankResult.reason.lostToWeaker',
  lost: 'rankResult.reason.lost',
  left: 'rankResult.reason.left',
  shield: 'rankResult.reason.shield',
};

/** The one plain reason a result is explained with; an unknown code says nothing rather than something wrong. */
export function reasonLine(t: Translate, reason: string): string | null {
  const key = REASON_KEY[reason as RankReason];
  return key ? t(key) : null;
}

const FRIENDLY_KEY: Record<FriendlyReason, MessageKey> = {
  chosen: 'rated.reason.chosen',
  solo: 'rated.reason.solo',
  'need-two': 'rated.reason.needTwo',
  unverified: 'rated.reason.unverified',
  'no-birth-month': 'rated.reason.noBirthMonth',
  restricted: 'rated.reason.restricted',
  cooldown: 'rated.reason.cooldown',
  'repeat-opponent': 'rated.reason.repeatOpponent',
};

/** When the reason is the viewer's own, it is said to them, with what they can do about it. */
const FRIENDLY_SELF_KEY: Partial<Record<FriendlyReason, MessageKey>> = {
  unverified: 'rated.reasonSelf.unverified',
  'no-birth-month': 'rated.reasonSelf.noBirthMonth',
  restricted: 'rated.reasonSelf.restricted',
  cooldown: 'rated.reasonSelf.cooldown',
};

/** Why a game plays as friendly, in a clause that follows "This game is friendly:". */
export function friendlyReason(t: Translate, reason: FriendlyReason | null, self = false): string | null {
  if (!reason) return null;
  const key = (self ? FRIENDLY_SELF_KEY[reason] : undefined) ?? FRIENDLY_KEY[reason];
  return key ? t(key) : null;
}

// ---- seasons ----------------------------------------------------------------------

const SEASON_NAME: Record<SeasonName, MessageKey> = {
  zivistan: 'seasons.name.zivistan',
  bihar: 'seasons.name.bihar',
  havin: 'seasons.name.havin',
  payiz: 'seasons.name.payiz',
};
const SEASON_MEANING: Record<SeasonName, MessageKey> = {
  zivistan: 'seasons.meaning.zivistan',
  bihar: 'seasons.meaning.bihar',
  havin: 'seasons.meaning.havin',
  payiz: 'seasons.meaning.payiz',
};

/** "Payîz 2026", with "Autumn" as its meaning. */
export function seasonNamed(t: Translate, season: { name: SeasonName; year: number }): Named {
  const n = named(t, SEASON_NAME[season.name], SEASON_MEANING[season.name]);
  return { name: t('seasons.label', { season: n.name, year: season.year }), meaning: n.meaning };
}

// ---- leagues ----------------------------------------------------------------------

const LEAGUE_NAME: Record<LeagueTier, MessageKey> = {
  dilop: 'leagues.tier.dilop',
  kani: 'leagues.tier.kani',
  cem: 'leagues.tier.cem',
  gol: 'leagues.tier.gol',
  derya: 'leagues.tier.derya',
  okyanus: 'leagues.tier.okyanus',
};
const LEAGUE_MEANING: Record<LeagueTier, MessageKey> = {
  dilop: 'leagues.meaning.dilop',
  kani: 'leagues.meaning.kani',
  cem: 'leagues.meaning.cem',
  gol: 'leagues.meaning.gol',
  derya: 'leagues.meaning.derya',
  okyanus: 'leagues.meaning.okyanus',
};

export function leagueNamed(t: Translate, tier: LeagueTier): Named {
  return named(t, LEAGUE_NAME[tier], LEAGUE_MEANING[tier]);
}

/** "Çem League", in the reader's word order (the template keeps an `{emoji}` hole from before; it stays empty). */
export function leagueName(t: Translate, tier: LeagueTier): string {
  return t('leagues.tierName', { emoji: '', tier: t(LEAGUE_NAME[tier]) }).trim();
}

// ---- badges -------------------------------------------------------------------------

const BADGE_TIER_NAME: Record<BadgeTierKey, MessageKey> = {
  sifir: 'badges.tier.sifir',
  ziv: 'badges.tier.ziv',
  zer: 'badges.tier.zer',
  firuze: 'badges.tier.firuze',
};
const BADGE_TIER_MEANING: Record<BadgeTierKey, MessageKey> = {
  sifir: 'badges.tierMeaning.sifir',
  ziv: 'badges.tierMeaning.ziv',
  zer: 'badges.tierMeaning.zer',
  firuze: 'badges.tierMeaning.firuze',
};

export function badgeTierNamed(t: Translate, tier: BadgeTierKey): Named {
  return named(t, BADGE_TIER_NAME[tier], BADGE_TIER_MEANING[tier]);
}

export const FAMILY_KEY: Record<BadgeFamily, MessageKey> = {
  learning: 'badges.family.learning',
  habit: 'badges.family.habit',
  games: 'badges.family.games',
  ranked: 'badges.family.ranked',
  friends: 'badges.family.friends',
  events: 'badges.family.events',
  secret: 'badges.family.secret',
};

export const UNIT_KEY: Record<BadgeUnit, MessageKey> = {
  lessons: 'badges.unit.lessons',
  words: 'badges.unit.words',
  reviews: 'badges.unit.reviews',
  stories: 'badges.unit.stories',
  units: 'badges.unit.units',
  days: 'badges.unit.days',
  weeks: 'badges.unit.weeks',
  wins: 'badges.unit.wins',
  wpm: 'badges.unit.wpm',
  races: 'badges.unit.races',
  games: 'badges.unit.games',
  gifts: 'badges.unit.gifts',
  seasons: 'badges.unit.seasons',
  years: 'badges.unit.years',
  months: 'badges.unit.months',
  times: 'badges.unit.times',
  answers: 'badges.unit.answers',
  letters: 'badges.unit.letters',
};

interface BadgeKeys {
  name: MessageKey;
  meaning: MessageKey;
  desc: MessageKey;
  hint?: MessageKey;
}

/** Every badge in the shared catalogue (a test keeps the two lists equal). */
export const BADGE_TEXT: Record<string, BadgeKeys> = {
  ders: { name: 'badges.ders.name', meaning: 'badges.ders.meaning', desc: 'badges.ders.desc' },
  'peyven-min': { name: 'badges.peyven-min.name', meaning: 'badges.peyven-min.meaning', desc: 'badges.peyven-min.desc' },
  bekemasi: { name: 'badges.bekemasi.name', meaning: 'badges.bekemasi.meaning', desc: 'badges.bekemasi.desc' },
  dubare: { name: 'badges.dubare.name', meaning: 'badges.dubare.meaning', desc: 'badges.dubare.desc' },
  cirokbej: { name: 'badges.cirokbej.name', meaning: 'badges.cirokbej.meaning', desc: 'badges.cirokbej.desc' },
  rewi: { name: 'badges.rewi.name', meaning: 'badges.rewi.meaning', desc: 'badges.rewi.desc' },
  ferheng: { name: 'badges.ferheng.name', meaning: 'badges.ferheng.meaning', desc: 'badges.ferheng.desc' },
  zengil: { name: 'badges.zengil.name', meaning: 'badges.zengil.meaning', desc: 'badges.zengil.desc' },
  penus: { name: 'badges.penus.name', meaning: 'badges.penus.meaning', desc: 'badges.penus.desc' },
  belur: { name: 'badges.belur.name', meaning: 'badges.belur.meaning', desc: 'badges.belur.desc' },
  gencine: { name: 'badges.gencine.name', meaning: 'badges.gencine.meaning', desc: 'badges.gencine.desc' },
  agir: { name: 'badges.agir.name', meaning: 'badges.agir.meaning', desc: 'badges.agir.desc' },
  hefte: { name: 'badges.hefte.name', meaning: 'badges.hefte.meaning', desc: 'badges.hefte.desc' },
  roj: { name: 'badges.roj.name', meaning: 'badges.roj.meaning', desc: 'badges.roj.desc' },
  vegera: { name: 'badges.vegera.name', meaning: 'badges.vegera.meaning', desc: 'badges.vegera.desc' },
  pela: { name: 'badges.pela.name', meaning: 'badges.pela.meaning', desc: 'badges.pela.desc' },
  cay: { name: 'badges.cay.name', meaning: 'badges.cay.meaning', desc: 'badges.cay.desc' },
  'gula-hefte': { name: 'badges.gula-hefte.name', meaning: 'badges.gula-hefte.meaning', desc: 'badges.gula-hefte.desc' },
  'heyva-cardehe': { name: 'badges.heyva-cardehe.name', meaning: 'badges.heyva-cardehe.meaning', desc: 'badges.heyva-cardehe.desc' },
  peyvzan: { name: 'badges.peyvzan.name', meaning: 'badges.peyvzan.meaning', desc: 'badges.peyvzan.desc' },
  helbestvan: { name: 'badges.helbestvan.name', meaning: 'badges.helbestvan.meaning', desc: 'badges.helbestvan.desc' },
  bilez: { name: 'badges.bilez.name', meaning: 'badges.bilez.meaning', desc: 'badges.bilez.desc' },
  rastnivis: { name: 'badges.rastnivis.name', meaning: 'badges.rastnivis.meaning', desc: 'badges.rastnivis.desc' },
  guhdar: { name: 'badges.guhdar.name', meaning: 'badges.guhdar.meaning', desc: 'badges.guhdar.desc' },
  hemereng: { name: 'badges.hemereng.name', meaning: 'badges.hemereng.meaning', desc: 'badges.hemereng.desc' },
  dilpak: { name: 'badges.dilpak.name', meaning: 'badges.dilpak.meaning', desc: 'badges.dilpak.desc' },
  mamik: { name: 'badges.mamik.name', meaning: 'badges.mamik.meaning', desc: 'badges.mamik.desc' },
  bilbil: { name: 'badges.bilbil.name', meaning: 'badges.bilbil.meaning', desc: 'badges.bilbil.desc' },
  elmas: { name: 'badges.elmas.name', meaning: 'badges.elmas.meaning', desc: 'badges.elmas.desc' },
  'rank-dest': { name: 'ranks.tier.dest', meaning: 'ranks.meaning.dest', desc: 'badges.rank-dest.desc' },
  'rank-gir': { name: 'ranks.tier.gir', meaning: 'ranks.meaning.gir', desc: 'badges.rank-gir.desc' },
  'rank-zozan': { name: 'ranks.tier.zozan', meaning: 'ranks.meaning.zozan', desc: 'badges.rank-zozan.desc' },
  'rank-ciya': { name: 'ranks.tier.ciya', meaning: 'ranks.meaning.ciya', desc: 'badges.rank-ciya.desc' },
  'rank-lutke': { name: 'ranks.tier.lutke', meaning: 'ranks.meaning.lutke', desc: 'badges.rank-lutke.desc' },
  'rank-sterk': { name: 'ranks.tier.sterk', meaning: 'ranks.meaning.sterk', desc: 'badges.rank-sterk.desc' },
  hilkiser: { name: 'badges.hilkiser.name', meaning: 'badges.hilkiser.meaning', desc: 'badges.hilkiser.desc' },
  cihgirti: { name: 'badges.cihgirti.name', meaning: 'badges.cihgirti.meaning', desc: 'badges.cihgirti.desc' },
  heval: { name: 'badges.heval.name', meaning: 'badges.heval.meaning', desc: 'badges.heval.desc' },
  diyari: { name: 'badges.diyari.name', meaning: 'badges.diyari.meaning', desc: 'badges.diyari.desc' },
  mevandar: { name: 'badges.mevandar.name', meaning: 'badges.mevandar.meaning', desc: 'badges.mevandar.desc' },
  name: { name: 'badges.name.name', meaning: 'badges.name.meaning', desc: 'badges.name.desc' },
  dilgerm: { name: 'badges.dilgerm.name', meaning: 'badges.dilgerm.meaning', desc: 'badges.dilgerm.desc' },
  newroz: { name: 'badges.newroz.name', meaning: 'badges.newroz.meaning', desc: 'badges.newroz.desc' },
  'roja-ziman': { name: 'badges.roja-ziman.name', meaning: 'badges.roja-ziman.meaning', desc: 'badges.roja-ziman.desc' },
  'zimane-dayike': { name: 'badges.zimane-dayike.name', meaning: 'badges.zimane-dayike.meaning', desc: 'badges.zimane-dayike.desc' },
  sersal: { name: 'badges.sersal.name', meaning: 'badges.sersal.meaning', desc: 'badges.sersal.desc' },
  yelda: { name: 'badges.yelda.name', meaning: 'badges.yelda.meaning', desc: 'badges.yelda.desc' },
  zivistan: { name: 'seasons.name.zivistan', meaning: 'seasons.meaning.zivistan', desc: 'badges.zivistan.desc' },
  bihar: { name: 'seasons.name.bihar', meaning: 'seasons.meaning.bihar', desc: 'badges.bihar.desc' },
  havin: { name: 'seasons.name.havin', meaning: 'seasons.meaning.havin', desc: 'badges.havin.desc' },
  payiz: { name: 'seasons.name.payiz', meaning: 'seasons.meaning.payiz', desc: 'badges.payiz.desc' },
  mehane: { name: 'badges.mehane.name', meaning: 'badges.mehane.meaning', desc: 'badges.mehane.desc' },
  'tire-rast': { name: 'badges.tire-rast.name', meaning: 'badges.tire-rast.meaning', desc: 'badges.tire-rast.desc', hint: 'badges.tire-rast.hint' },
  'ji-nu-ve': { name: 'badges.ji-nu-ve.name', meaning: 'badges.ji-nu-ve.meaning', desc: 'badges.ji-nu-ve.desc', hint: 'badges.ji-nu-ve.hint' },
  'kewe-ciye': { name: 'badges.kewe-ciye.name', meaning: 'badges.kewe-ciye.meaning', desc: 'badges.kewe-ciye.desc', hint: 'badges.kewe-ciye.hint' },
  'deste-zerin': { name: 'badges.deste-zerin.name', meaning: 'badges.deste-zerin.meaning', desc: 'badges.deste-zerin.desc', hint: 'badges.deste-zerin.hint' },
  'mevane-agir': { name: 'badges.mevane-agir.name', meaning: 'badges.mevane-agir.meaning', desc: 'badges.mevane-agir.desc', hint: 'badges.mevane-agir.hint' },
  'kaniya-zanine': { name: 'badges.kaniya-zanine.name', meaning: 'badges.kaniya-zanine.meaning', desc: 'badges.kaniya-zanine.desc', hint: 'badges.kaniya-zanine.hint' },
  'pisika-wane': { name: 'badges.pisika-wane.name', meaning: 'badges.pisika-wane.meaning', desc: 'badges.pisika-wane.desc', hint: 'badges.pisika-wane.hint' },
  perperok: { name: 'badges.perperok.name', meaning: 'badges.perperok.meaning', desc: 'badges.perperok.desc', hint: 'badges.perperok.hint' },
  'sterka-siqiti': { name: 'badges.sterka-siqiti.name', meaning: 'badges.sterka-siqiti.meaning', desc: 'badges.sterka-siqiti.desc', hint: 'badges.sterka-siqiti.hint' },
  mirari: { name: 'badges.mirari.name', meaning: 'badges.mirari.meaning', desc: 'badges.mirari.desc', hint: 'badges.mirari.hint' },
};

/** A badge's name and meaning; a key this app does not know yet keeps the key as its name. */
export function badgeNamed(t: Translate, key: string): Named {
  const k = BADGE_TEXT[key];
  return k ? named(t, k.name, k.meaning) : { name: key, meaning: null };
}

/** What a badge is for, in a sentence; null for one this app does not know. */
export function badgeDesc(t: Translate, key: string): string | null {
  const k = BADGE_TEXT[key];
  return k ? t(k.desc) : null;
}

/** A secret's hint, shown once the learner has found any secret. */
export function badgeHint(t: Translate, hintKey: string | null): string | null {
  if (!hintKey) return null;
  const entry = Object.values(BADGE_TEXT).find((k) => k.hint === hintKey);
  return entry?.hint ? t(entry.hint) : null;
}
