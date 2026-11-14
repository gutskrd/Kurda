import { characterSvg } from '@kurda/shared';
import { useMemo } from 'react';
import { API_URL } from '../lib/config';
import { useApiGet } from '../lib/useApi';
import { useLocale, useT } from '../i18n/I18nProvider';
import { BookIcon } from '../components/icons';
import '../tree/tree.css';

/**
 * Hevalo's book on Learn: one slim card that downloads the road on paper —
 * the PDF of every chapter that is online (api/src/books), Hamo's stories,
 * words and grammar with it. It is there only once a chapter is online, and
 * never on a server that has no book.
 */
export function BookCard(): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const { data } = useApiGet<{ chapters: number[] }>('/books/road');
  const face = useMemo(() => ({ __html: characterSvg('hamo', { crop: 'head', width: 48, idPrefix: 'book-card', title: '' }) }), []);
  // an answer without a chapter list (an older server, a stand-in) shows no card rather than breaking Learn
  const count = Array.isArray(data?.chapters) ? data.chapters.length : 0;
  if (count === 0) return null;
  const chapters = new Intl.NumberFormat(locale).format(count);
  return (
    <a className="tree-card book-card" href={`${API_URL}/books/road.pdf`} download>
      <span className="tree-card-art book-card-art" aria-hidden="true" dangerouslySetInnerHTML={face} />
      <span className="tree-card-text">
        <span className="tree-card-title">{t('book.card.title')}</span>
        <span className="tree-card-sub">{count === 1 ? t('book.card.subOne') : t('book.card.sub', { count: chapters })}</span>
      </span>
      <BookIcon size={20} className="tree-card-go" />
    </a>
  );
}
