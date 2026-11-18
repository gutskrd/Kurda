import type { TranslationKey } from '../i18n/translations';

type Translate = (key: TranslationKey) => string;

/** The course the path is built round, by its slug (api/src/content/road-check.ts `ROAD_COURSE`). */
const ROAD = 'kurmanji-road';

/**
 * A course's name in the reader's language. The server titles courses in English only, so the road's name is
 * translated here; any other course keeps the server's title.
 */
export function courseName(t: Translate, course: { slug?: string; title: string }): string {
  return course.slug === ROAD ? t('learn.course.road') : course.title;
}
