import type { TranslationKey } from '../i18n/translations';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/**
 * How many people are in a group, in words. A new group has one member until its maker adds somebody, so one has its
 * own wording rather than "1 members".
 */
export function membersLine(t: Translate, count: number): string {
  return count === 1 ? t('groups.memberCount.one') : t('groups.memberCount', { count });
}
