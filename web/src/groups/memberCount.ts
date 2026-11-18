import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** How many people are in a group, in words, with its own wording for one, since every new group starts with one. */
export function membersLine(t: Translate, count: number): string {
  return count === 1 ? t('groups.memberCount.one') : t('groups.memberCount', { count });
}
