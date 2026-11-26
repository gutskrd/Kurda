import { useState } from 'react';
import { Link } from 'react-router-dom';
import { storyTextDirection, type StoryListItem } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useOptimistic } from '../lib/optimistic';
import { BookmarkIcon, HeadphonesIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { useGrowsFrom } from '../lib/viewTransition';
import { readerPath, setBookmark } from './api';
import { StoryCover } from './Cover';
import { levelHint, levelName, minutesLeft, narratedKey } from './labels';

/**
 * A story on a library shelf: cover, title, a line of summary, then its level, category, time (or time left) and a
 * headphones mark when narrated, with a hairline of progress along the foot. The bookmark is a separate button beside
 * the link and optimistic, reverting with a message only on refusal; visitors have none.
 */
export function StoryCard({
  story,
  category,
  onBookmarked,
}: {
  story: StoryListItem;
  /** The category's name in the reader's language, when filed. */
  category: string | null;
  /** Told once the server agreed, so the library's shelves can follow. */
  onBookmarked?: (story: StoryListItem, bookmarked: boolean) => void;
}): React.JSX.Element {
  const t = useT();
  const { client, status } = useAuth();
  const { lang, dir } = storyTextDirection(story.dialect);
  const signedIn = status === 'signedIn';
  const [problem, setProblem] = useState<string | null>(null);
  // Shown at once, quick presses ending in the last; the same story arriving again from another shelf is adopted.
  const [bookmarked, want] = useOptimistic(story.me?.bookmarked === true, (on) => setBookmark(client, story.id, on), {
    fromAnswer: (data) => data.bookmarked,
    onSaved: (data) => onBookmarked?.(story, data.bookmarked),
    onFailed: () => setProblem(t('stories.library.bookmarkFailed')),
  });

  const left = minutesLeft(story);
  const share = story.me ? (story.me.finishedAt ? 1 : Math.max(0, Math.min(1, story.me.share))) : 0;
  const narrated = narratedKey(story);
  // The cover travels into the story and back to this card, whichever shelf it was on.
  const cover = useGrowsFrom(`story:${story.slug}`, { within: '.story-card' });

  function toggle(): void {
    setProblem(null);
    want((on) => !on);
  }

  return (
    <article className={`story-card${share > 0 ? ' has-progress' : ''}`}>
      <Link to={readerPath(story.slug)} className="story-card-link">
        <StoryCover slug={story.slug} cover={story.cover} className="story-card-cover" ref={cover} />
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
            <span style={{ '--p': share } as React.CSSProperties} />
          </span>
        )}
      </Link>
      {signedIn && (
        <button
          type="button"
          className={`story-card-bookmark${bookmarked ? ' is-on' : ''}`}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? t('stories.library.unbookmark', { title: story.title }) : t('stories.library.bookmark', { title: story.title })}
          onClick={toggle}
        >
          <BookmarkIcon size={18} weight={bookmarked ? 'fill' : 'regular'} className={bookmarked ? 'saved-mark' : undefined} />
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
