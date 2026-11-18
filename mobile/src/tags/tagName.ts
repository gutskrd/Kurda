/**
 * A tag's name in the reader's language.
 *
 * The server names its tags in English: the catalogue is kept in the admin,
 * and its labels are what the admin typed. Shown as they come, an Arabic or
 * Kurmancî screen read "Year Joined: 2026" and "Ethnicity". So the tags the
 * app knows are named from its own catalogues, by key, and a tag added to the
 * catalogue later keeps the server's name until it has one here.
 */
import type { TranslationKey } from '../i18n/translations';

const NAMES: Readonly<Record<string, TranslationKey>> = {
  age: 'tags.name.age',
  gender: 'tags.name.gender',
  ethnicity: 'tags.name.ethnicity',
  level: 'tags.name.level',
  season_title: 'tags.name.season_title',
  year_joined: 'tags.name.year_joined',
  kurdish: 'tags.name.kurdish',
  admin: 'tags.name.admin',
  founder: 'tags.name.founder',
};

type Translate = (key: TranslationKey) => string;

/** The tag's own name: "Age", "العمر". */
export function tagName(tag: { key: string; label: string }, t: Translate): string {
  const key = NAMES[tag.key];
  return key ? t(key) : tag.label;
}

/** The name with what the person gave for it, as a badge shows it: "Level: 4", or just the name. */
export function tagBadgeText(tag: { key: string; label: string; value: string | null }, t: Translate): string {
  const name = tagName(tag, t);
  return tag.value ? `${name}: ${tag.value}` : name;
}
