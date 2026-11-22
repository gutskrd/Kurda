import { Link } from 'react-router-dom';
import { Skeleton } from '../components/Skeleton';
import { useT } from '../i18n/I18nProvider';
import { useApiGet } from '../lib/useApi';

/** GET /dictionary/word-of-day: the same word for everyone on the learner's local day, or none. */
interface WordOfDay {
  entryId: string;
  headword: string;
  pos: string | null;
  definitionEn: string | null;
  definitionKu: string | null;
}

/**
 * Today's word on the dictionary page, before anything is searched: the word, the card's name and the word's meaning,
 * opening its entry. It holds its place while loading and gives it up when there is no word.
 */
export function WordOfDayTool(): React.JSX.Element | null {
  const t = useT();
  const { data, loading } = useApiGet<{ word: WordOfDay | null }>('/dictionary/word-of-day');
  const word = data?.word ?? null;
  if (!word) {
    if (!loading) return null;
    return (
      <div className="learn-tool skeleton-late" aria-hidden="true">
        <Skeleton w={96} h={24} />
        <Skeleton line w="70%" />
        <Skeleton line w="50%" />
      </div>
    );
  }
  const meaning = word.definitionEn ?? word.definitionKu ?? '';
  return (
    <Link to={`/app/dictionary?entry=${encodeURIComponent(word.entryId)}`} className="learn-tool learn-tool-link learn-wotd">
      <span className="learn-tool-word" lang="ku" dir="auto">
        {word.headword}
      </span>
      <span className="learn-tool-title">{t('dictionary.wordOfDay')}</span>
      {meaning && (
        <span className="learn-tool-body">
          {word.pos ? `${word.pos} · ` : ''}
          {meaning}
        </span>
      )}
    </Link>
  );
}
