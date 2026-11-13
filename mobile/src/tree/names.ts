import type { TreeHealth, TreeSpecies, TreeStage } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/**
 * The words for a tree: each kind's Kurdish name with what it means, a line
 * about it, the names of its seven stages, and how it is faring. Written out
 * key by key, so a key that is missing is a type error and not a blank.
 */
const KIND: Record<TreeSpecies, { name: TranslationKey; meaning: TranslationKey; about: TranslationKey }> = {
  beru: { name: 'tree.kind.beru.name', meaning: 'tree.kind.beru.meaning', about: 'tree.kind.beru.about' },
  hinar: { name: 'tree.kind.hinar.name', meaning: 'tree.kind.hinar.meaning', about: 'tree.kind.hinar.about' },
  behiv: { name: 'tree.kind.behiv.name', meaning: 'tree.kind.behiv.meaning', about: 'tree.kind.behiv.about' },
  bi: { name: 'tree.kind.bi.name', meaning: 'tree.kind.bi.meaning', about: 'tree.kind.bi.about' },
  tu: { name: 'tree.kind.tu.name', meaning: 'tree.kind.tu.meaning', about: 'tree.kind.tu.about' },
  spindar: { name: 'tree.kind.spindar.name', meaning: 'tree.kind.spindar.meaning', about: 'tree.kind.spindar.about' },
  kaj: { name: 'tree.kind.kaj.name', meaning: 'tree.kind.kaj.meaning', about: 'tree.kind.kaj.about' },
  payiz: { name: 'tree.kind.payiz.name', meaning: 'tree.kind.payiz.meaning', about: 'tree.kind.payiz.about' },
  miraz: { name: 'tree.kind.miraz.name', meaning: 'tree.kind.miraz.meaning', about: 'tree.kind.miraz.about' },
  sev: { name: 'tree.kind.sev.name', meaning: 'tree.kind.sev.meaning', about: 'tree.kind.sev.about' },
};

const STAGE: Record<TreeStage, TranslationKey> = {
  0: 'tree.stage.0',
  1: 'tree.stage.1',
  2: 'tree.stage.2',
  3: 'tree.stage.3',
  4: 'tree.stage.4',
  5: 'tree.stage.5',
  6: 'tree.stage.6',
};

const HEALTH: Record<TreeHealth, TranslationKey> = {
  fresh: 'tree.health.fresh',
  thirsty: 'tree.health.thirsty',
  wilting: 'tree.health.wilting',
  withered: 'tree.health.withered',
};

/** A kind's name and what it means; the meaning is left out where it is the name (a reader of Kurdish). */
export function treeNamed(t: Translate, species: TreeSpecies): { name: string; meaning: string | null } {
  const name = t(KIND[species].name);
  const meaning = t(KIND[species].meaning);
  return { name, meaning: meaning && meaning !== name ? meaning : null };
}

/** A line about a kind: what sort of tree it is. */
export const treeAbout = (t: Translate, species: TreeSpecies): string => t(KIND[species].about);

export const stageName = (t: Translate, stage: TreeStage): string => t(STAGE[stage]);

export const healthName = (t: Translate, health: TreeHealth): string => t(HEALTH[health]);

/** What a picture of a tree is called: its kind, how far it has grown, and how it fares when that is not well. */
export function treeTitle(t: Translate, tree: { species: TreeSpecies; stage: TreeStage; health: TreeHealth }): string {
  const parts = [treeNamed(t, tree.species).name, stageName(t, tree.stage)];
  if (tree.health !== 'fresh') parts.push(healthName(t, tree.health));
  return parts.join(', ');
}
