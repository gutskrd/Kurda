import { shopItemDescription, type ProfileWordTag } from '@kurda/shared';
import { useLocale, useT } from '../i18n/I18nProvider';
import './tagPill.css';

/**
 * A word tag worn by the name (shared shop-tags.ts): its Kurmancî word in an ink pill with a small kilim diamond, as
 * written in every language, and what it means in the reader's language on hover and to a screen reader.
 */
export function TagPill({ tag, className }: { tag: Pick<ProfileWordTag, 'label' | 'meaning'>; className?: string }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const meaning = shopItemDescription({ name: tag.label, description: tag.meaning }, locale);
  return (
    <span className={`tag-pill${className ? ` ${className}` : ''}`} title={meaning ? t('tag.withMeaning', { word: tag.label, meaning }) : tag.label}>
      <span className="tag-pill-mark" aria-hidden="true" />
      <span lang="ku">{tag.label}</span>
      {meaning && <span className="sr-only">{`, ${meaning}`}</span>}
    </span>
  );
}
