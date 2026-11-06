import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { storyTextDirection, type StoryListItem } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { BookmarkIcon, HeadphonesIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { readerPath, setBookmark } from './api';
import { StoryCover } from './Cover';
import { levelHint, levelName, minutesLeft, narratedKey } from './labels';

/**
 * A story on a shelf of the library (design notes §5): its cover, title and
 * one line of summary, then its facts — its level by its plain name (what
 * that means on hover), its category, how long it takes (or how long is left
 * for this reader), and a headphones mark when it can be listened to. A hairline along the foot shows how far the reader got; a finished
 * story's runs the whole way.
 *
 * The bookmark is a button of its own beside the link, not inside it (a
 * button in a link is two controls in one place), and it is optimistic: the
 * mark fills at once, the request follows, and only a refusal turns it back
 * and says so. A visitor has no shelf, so no bookmark.
 */
export function StoryCard({
  story,
  category,
  onBookmarked,
}: {
  story: StoryListItem;
  /** the category's name in the reader's language, when the story is filed */
  category: string | null;
  /** told after the server agreed, so the library's shelves can follow */
  onBookmarked?: (story: StoryListItem, bookmarked: boolean) => void;
}): React.JSX.Element {
  const t = useT();
  const { client, status } = useAuth();
  const { lang, dir } = storyTextDirection(story.dialect);
  const signedIn = status === 'signedIn';
  const [bookmarked, setBookmarked] = useState(story.me?.bookmarked === true);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // the same story arrives again from another shelf: the server's word wins
  useEffect(() => setBookmarked(story.me?.bookmarked === true), [story.me?.bookmarked]);

  const left = minutesLeft(story);
  const share = story.me ? (story.me.finishedAt ? 1 : Math.max(0, Math.min(1, story.me.share))) : 0;
  const narrated = narratedKey(story);

  async function toggle(): Promise<void> {
    if (busy) return;
    const next = !bookmarked;
    setBookmarked(next);
    setProblem(null);
    setBusy(true);
    const res = await setBookmark(client, story.id, next);
    setBusy(false);
    if (res.ok) {
      onBookmarked?.(story, res.data.bookmarked);
      return;
    }
    setBookmarked(!next);
    setProblem(t('stories.library.bookmarkFailed'));
  }

  return (
    <article className={`story-card${share > 0 ? ' has-progress' : ''}`}>
      <Link to={readerPath(story.slug)} className="story-card-link">
        <StoryCover cover={story.cover} category={story.category} className="story-card-cover" />
        <span className="story-card-body">
          <span className="story-card-title" lang={lang} dir={dir}>
            {story.title}
          </span>
          {story.summary && (
            <span className="story-card-summary" lang={lang} dir={dir}>
              {story.summary}
            </span>
          )}
          <span className="story-card-meta">
            <span className="story-cefr" title={levelHint(story.level, t)}>
              {levelName(story.level, t)}
            </span>
            {category && <span>{category}</span>}
            <span>{left !== null ? t('stories.library.minutesLeft', { count: left }) : t('stories.minutes', { count: story.readingMinutes })}</span>
            {narrated && (
              <span className="story-narrated">
                <HeadphonesIcon size={14} />
                <span className="sr-only">{t(narrated)}</span>
              </span>
            )}
          </span>
        </span>
        {share > 0 && (
          <span className="story-card-progress" aria-hidden="true">
            <span style={{ width: `${Math.round(share * 100)}%` }} />
          </span>
        )}
      </Link>
      {signedIn && (
        <button
          type="button"
          className={`story-card-bookmark${bookmarked ? ' is-on' : ''}`}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? t('stories.library.unbookmark', { title: story.title }) : t('stories.library.bookmark', { title: story.title })}
          onClick={() => void toggle()}
        >
          <BookmarkIcon size={18} weight={bookmarked ? 'fill' : 'regular'} />
        </button>
      )}
      {problem && (
        <span className="story-card-problem" role="alert">
          {problem}
        </span>
      )}
    </article>
  );
}
