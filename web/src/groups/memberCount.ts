import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * How many people are in a group, in words. A group is one person until its
 * maker has added somebody, so "1 members" was the first thing a new group
 * said about itself; one has a wording of its own.
 */
export function membersLine(t: Translate, count: number): string {
  return count === 1 ? t('groups.memberCount.one') : t('groups.memberCount', { count });
}
