import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// Soranî in a face made for Arabic script (fetched only when a story page is opened)
import '@fontsource-variable/vazirmatn';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  PAID_STORY_REPEATS_PER_DAY,
  STORY_ASSESSMENT,
  categoryName,
  glossFor,
  storyTextDirection,
  type StoryDetail,
  type StoryGameSummary,
  type StoryGlossEntry,
  type StoryMe,
  type StoryTradition,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { ErrorState, Loading } from '../components/states';
import { ArrowIcon, BookmarkIcon, HeadphonesIcon, LockIcon } from '../components/icons';
import { describeError } from '../lib/api';
import { prefersReducedMotion } from '../lib/motion';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { dialectName } from '../learn/map';
import { STORIES_LIBRARY, createGame, gamePath, readerPath, setBookmark, storyError } from './api';
import { useStoryCategories } from './catalogue';
import { StoryCover } from './Cover';
import { levelHint, levelName, minutesLeft, narratedKey } from './labels';
import { rememberTextSize, rememberedExtraTime, rememberedTextSize } from './prefs';
import { StoryPlayerBar, TextSizeControl } from './ReaderControls';
import { SetupSheet } from './SetupSheet';
import { PlayWordButton, SaveWordButton, StoryText } from './StoryText';
import { useReadingProgress } from './useReadingProgress';
import { useStoryAudio } from './useStoryAudio';

type Load = { state: 'loading' } | { state: 'ready'; story: StoryDetail } | { state: 'gone' } | { state: 'error'; message: string };

/**
 * A story (/app/learn/stories/:slug) — open to everyone, signed in or not;
 * the check after it needs an account.
 *
 * One page with two halves (design notes §1–2). At the top the overview: the
 * cover, the title, what the story is (level, category, minutes, words,
 * narrated), who it comes from, the synopsis, Read or Continue and Listen,
 * the bookmark, the key vocabulary and the check. Under it the text itself,
 * at a reader's own size, with the glossary marked, the translation a toggle
 * away under each paragraph, the player docked at the foot when there are
 * recordings, and the reader's place kept on the server as they go.
 */
export function StoryReader(): React.JSX.Element {
  const { slug = '' } = useParams();
  return <StoryPage key={slug} slug={slug} />;
}

function StoryPage({ slug }: { slug: string }): React.JSX.Element {
  const t = useT();
  const { client, status } = useAuth();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [nonce, setNonce] = useState(0);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    // the story is asked for once the session is known, so a reader's own record arrives with it
    if (status === 'restoring') return;
    let live = true;
    setLoad({ state: 'loading' });
    void client.get<StoryDetail>(`/stories/${encodeURIComponent(slug)}`).then((res) => {
      if (!live) return;
      if (res.ok) setLoad({ state: 'ready', story: res.data });
      // unpublished — to be fixed, or taken down — looks the same as never published
      else if (res.error.status === 404) setLoad({ state: 'gone' });
      else setLoad({ state: 'error', message: describeError(res.error, t) });
    });
    return () => {
      live = false;
    };
  }, [client, slug, nonce, t, signedIn, status]);

  return (
    <div className="container story-page">
      <Link to={STORIES_LIBRARY} className="back-link">
        <ArrowIcon size={16} />
        {t('stories.reader.back')}
      </Link>
      {load.state === 'loading' && <Loading label={t('stories.reader.loading')} />}
      {load.state === 'gone' && <ErrorState title={t('stories.reader.goneTitle')} message={t('stories.reader.updating')} />}
      {load.state === 'error' && <ErrorState message={load.message} onRetry={() => setNonce((n) => n + 1)} />}
      {load.state === 'ready' && <ReadStory story={load.story} />}
    </div>
  );
}

/** What a story's tradition says about where it comes from, in the overview's byline. */
const TRADITION_KEY: Record<StoryTradition, MessageKey> = {
  traditional: 'stories.overview.tradition.traditional',
  adapted: 'stories.overview.tradition.adapted',
  original: 'stories.overview.tradition.original',
};

function ReadStory({ story }: { story: StoryDetail }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client, status } = useAuth();
  const signedIn = status === 'signedIn';
  const { lang, dir } = storyTextDirection(story.dialect);
  const [me, setMe] = useState<StoryMe | null>(story.me ?? null);
  const [size, setSize] = useState(rememberedTextSize);
  const [bookmarked, setBookmarked] = useState(story.me?.bookmarked === true);
  const [bookmarkProblem, setBookmarkProblem] = useState<string | null>(null);
  const audio = useStoryAudio(story.paragraphs, story.audio, story.voices, false, story.narration);
  const categories = useStoryCategories();
  const text = useRef<HTMLDivElement>(null);
  const { observe } = useReadingProgress({ storyId: story.id, count: story.paragraphs.length, enabled: signedIn, initial: story.me ?? null, onMe: setMe });
  // the reader's place when the page opened: offered once, as a way back to it
  const [resume, setResume] = useState<number | null>(() => (story.me && !story.me.finishedAt && story.me.paragraph > 0 ? story.me.paragraph : null));

  const changeSize = useCallback((next: number) => {
    setSize(next);
    rememberTextSize(next);
  }, []);

  // the translation in the reader's language, else English, cut to the paragraphs; none when the story has neither
  const translation = useMemo(() => {
    const own = story.translations?.[locale];
    if (own && own.length === story.paragraphs.length) return { lang: locale, paragraphs: own };
    const en = story.translations?.en;
    if (en && en.length === story.paragraphs.length) return { lang: 'en', paragraphs: en };
    return null;
  }, [story.translations, story.paragraphs.length, locale]);

  const category = useMemo(() => {
    const c = categories?.find((x) => x.slug === story.category);
    return c ? categoryName(c, locale) : null;
  }, [categories, story.category, locale]);

  const scrollToParagraph = (index: number): void => {
    const el = text.current?.querySelector<HTMLElement>(`[data-paragraph="${index}"]`) ?? text.current;
    // a reader who asked for less motion is taken there at once
    el?.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  const startReading = (): void => {
    const at = me && !me.finishedAt && me.paragraph > 0 ? me.paragraph : 0;
    setResume(null);
    scrollToParagraph(at);
  };

  const listen = (): void => {
    scrollToParagraph(0);
    audio.playStory();
  };

  async function toggleBookmark(): Promise<void> {
    const next = !bookmarked;
    setBookmarked(next);
    setBookmarkProblem(null);
    const res = await setBookmark(client, story.id, next);
    if (res.ok) return;
    setBookmarked(!next);
    setBookmarkProblem(t('stories.library.bookmarkFailed'));
  }

  const left = minutesLeft({ readingMinutes: story.readingMinutes, me: me ?? undefined });
  const finished = me?.finishedAt !== null && me?.finishedAt !== undefined;
  const narrated = narratedKey(story);
  const otherVersions = story.versions.filter((v) => v.id !== story.id);

  return (
    <article className="story-article" aria-labelledby="story-title">
      <header className="story-overview">
        <StoryCover cover={story.cover} category={story.category} className="story-overview-cover" eager />
        <div className="story-overview-body">
          <p className="story-meta">
            <span className="story-cefr" title={levelHint(story.level, t)}>
              {levelName(story.level, t)}
            </span>
            {category && <span>{category}</span>}
            <span>{t('stories.minutes', { count: story.readingMinutes })}</span>
            <span>{t('stories.overview.words', { count: story.wordCount.toLocaleString(locale) })}</span>
            {narrated && (
              <span className="story-narrated">
                <HeadphonesIcon size={14} />
                {t(narrated)}
              </span>
            )}
          </p>
          <h1 id="story-title" className="story-title" lang={lang} dir={dir}>
            {story.title}
          </h1>
          <p className="story-byline">
            <span>{t(TRADITION_KEY[story.tradition])}</span>
            {story.author && <span>{story.author}</span>}
            <span>{dialectName(story.dialect)}</span>
          </p>
          {story.summary && (
            <p className="story-summary" lang={lang} dir={dir}>
              {story.summary}
            </p>
          )}
          <div className="story-overview-actions">
            <Button size="lg" onClick={startReading}>
              {finished ? t('stories.overview.readAgain') : left !== null ? t('stories.overview.continue', { count: left }) : t('stories.overview.read')}
            </Button>
            {audio.track.length > 0 && (
              <Button size="lg" variant="secondary" onClick={listen}>
                <HeadphonesIcon size={18} />
                {t('stories.overview.listen')}
              </Button>
            )}
            {signedIn && (
              <button
                type="button"
                className={`btn btn-ghost btn-lg story-overview-bookmark${bookmarked ? ' is-on' : ''}`}
                aria-pressed={bookmarked}
                aria-label={bookmarked ? t('stories.library.unbookmark', { title: story.title }) : t('stories.library.bookmark', { title: story.title })}
                onClick={() => void toggleBookmark()}
              >
                <BookmarkIcon size={18} weight={bookmarked ? 'fill' : 'regular'} />
                <span>{bookmarked ? t('stories.overview.bookmarked') : t('stories.overview.bookmark')}</span>
              </button>
            )}
          </div>
          {bookmarkProblem && (
            <p className="msg msg-error" role="alert">
              {bookmarkProblem}
            </p>
          )}
          {otherVersions.length > 0 && (
            <p className="story-versions">
              {otherVersions.map((v) => (
                <Link key={v.id} to={readerPath(v.slug)}>
                  {t('stories.overview.alsoIn', { variety: dialectName(v.dialect) })}
                </Link>
              ))}
            </p>
          )}
        </div>
      </header>

      <KeyVocabulary glossary={story.glossary} dialect={story.dialect} />
      <CheckBlock story={story} me={me} id="story-check" />

      <div className="story-reader" ref={text}>
        <div className="story-tools">
          <TextSizeControl step={size} onChange={changeSize} />
          {left !== null && <span className="story-tools-left">{t('stories.library.minutesLeft', { count: left })}</span>}
        </div>
        {resume !== null && (
          <div className="story-resume" role="status">
            <span>{t('stories.reader.resumeAsk')}</span>
            <Button size="sm" onClick={startReading}>
              {t('stories.reader.resume', { n: resume + 1 })}
            </Button>
            <button type="button" className="link-btn" onClick={() => setResume(null)}>
              {t('stories.reader.fromStart')}
            </button>
          </div>
        )}
        <StoryText
          paragraphs={story.paragraphs}
          glossary={story.glossary}
          dialect={story.dialect}
          textSize={size}
          audio={audio}
          translations={translation}
          observe={signedIn ? observe : undefined}
        />
        {(story.source || story.attributionNote) && (
          <footer className="story-about">
            <h2 className="story-section-title">{t('stories.overview.aboutTitle')}</h2>
            {story.source && (
              <p>
                {t('stories.overview.source')}{' '}
                {story.sourceUrl ? (
                  <a href={story.sourceUrl} target="_blank" rel="noopener noreferrer">
                    {story.source}
                  </a>
                ) : (
                  story.source
                )}
              </p>
            )}
            {story.attributionNote && <p>{story.attributionNote}</p>}
          </footer>
        )}
        {/*
         * Docked inside the text, the player stays at the foot of the screen
         * while the text is on it, and nowhere above it: the overview's own
         * buttons are never under it, and Listen brings the text — and the
         * player with it — into view.
         */}
        {audio.track.length > 0 && <StoryPlayerBar audio={audio} docked />}
      </div>

      <CheckBlock story={story} me={me} id="story-check-end" />
    </article>
  );
}

/**
 * "Key vocabulary": every glossary word with its meaning in the reader's
 * language, its part of speech when the dictionary knows the word, a play
 * button when the dictionary has a recording of it, and Save word when it is
 * a headword — the way to the words that needs no hunting in the text.
 */
function KeyVocabulary({ glossary, dialect }: { glossary: readonly StoryGlossEntry[]; dialect: StoryDetail['dialect'] }): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const { lang, dir } = storyTextDirection(dialect);
  if (glossary.length === 0) return null;
  return (
    <section className="story-words" aria-labelledby="story-words-title">
      <h2 id="story-words-title" className="story-section-title">
        {t('stories.overview.vocabulary')}
      </h2>
      <ul className="story-word-list">
        {glossary.map((g) => {
          const meaning = glossFor(g, locale);
          return (
            <li key={g.term} className="story-word">
              <span className="story-word-head">
                <span className="story-word-term" lang={lang} dir={dir}>
                  {g.term}
                </span>
                {g.pos && <span className="story-word-pos">{g.pos}</span>}
                {g.audioUrl && <PlayWordButton url={g.audioUrl} />}
              </span>
              <span className="story-word-meaning" lang={meaning.lang} dir={meaning.lang === 'en' ? 'ltr' : undefined}>
                {meaning.text}
              </span>
              {g.entryId && <SaveWordButton entryId={g.entryId} className="story-word-save" />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The check (design notes §1, §6): five questions on the story, the existing
 * solo game started with STORY_ASSESSMENT. Locked until the reader has
 * finished the story — the server's `finishedAt`, set as they read — then
 * "Check what you understood", or their best so far and "Check again". An
 * unfinished check on this story is offered to go back to first, rather than
 * replaced unasked. A second check on the same day says what it pays, from
 * the server's own numbers, before it is started. The questions can also be
 * played with friends, from here.
 */
function CheckBlock({ story, me, id }: { story: StoryDetail; me: StoryMe | null; id: string }): React.JSX.Element {
  const t = useT();
  const { client, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unfinished, setUnfinished] = useState<StoryGameSummary | null>(null);
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = status === 'signedIn';
  const finished = me?.finishedAt !== null && me?.finishedAt !== undefined;

  useEffect(() => {
    if (!signedIn || !finished) return;
    let live = true;
    void client.get<{ games: StoryGameSummary[] }>('/story-games/active').then((r) => {
      if (!live || !r.ok) return;
      setUnfinished((r.data.games ?? []).find((g) => g.mode === 'solo' && g.storyId === story.id) ?? null);
    });
    return () => {
      live = false;
    };
  }, [client, signedIn, finished, story.id]);

  async function check(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await createGame(client, { ...STORY_ASSESSMENT, storyId: story.id, extraTime: rememberedExtraTime() });
    setBusy(false);
    if (res.ok) navigate(gamePath(res.data.id));
    else setError(storyError(res.error, t));
  }

  if (!signedIn) {
    return (
      <section className="story-check" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} className="story-section-title">
          {t('stories.check.heading')}
        </h2>
        <p className="muted">{t('stories.reader.signIn')}</p>
        <div className="story-check-actions">
          <Link to="/register" className="btn btn-primary" state={{ from: location.pathname }}>
            {t('auth.login.createAccount')}
          </Link>
          <Link to="/login" className="btn btn-secondary" state={{ from: location.pathname }}>
            {t('nav.login')}
          </Link>
        </div>
      </section>
    );
  }

  const attempts = me?.attemptsToday ?? 0;
  const repeatNote = attempts >= PAID_STORY_REPEATS_PER_DAY ? t('stories.check.capped', { count: attempts }) : attempts >= 1 ? t('stories.check.repeat') : null;

  return (
    <section className={`story-check${finished ? '' : ' is-locked'}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="story-section-title">
        {t('stories.check.heading')}
      </h2>
      {!finished ? (
        <>
          <p className="story-check-locked">
            <LockIcon size={16} />
            {t('stories.check.locked')}
          </p>
          <div className="story-check-actions">
            <Button size="lg" disabled>
              {t('stories.check.start')}
            </Button>
          </div>
        </>
      ) : unfinished ? (
        <>
          <p className="muted">{t('stories.unfinished')}</p>
          <div className="story-check-actions">
            <Button size="lg" onClick={() => navigate(gamePath(unfinished.id))}>
              {t('stories.continue')}
            </Button>
            <Button size="lg" variant="secondary" disabled={busy} onClick={() => void check()}>
              {t('stories.startAgain')}
            </Button>
          </div>
        </>
      ) : (
        <>
          {me && me.bestCorrect !== null && me.total !== null ? (
            <p className="story-check-best">{t('stories.check.best', { correct: me.bestCorrect, total: me.total })}</p>
          ) : (
            <p className="muted">{t('stories.check.body')}</p>
          )}
          {repeatNote && <p className="story-check-note">{repeatNote}</p>}
          <div className="story-check-actions">
            <Button size="lg" disabled={busy} onClick={() => void check()}>
              {me && me.bestCorrect !== null ? t('stories.check.again') : t('stories.check.start')}
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setSetup(true)}>
              {t('stories.check.friends')}
            </Button>
          </div>
        </>
      )}
      {error && (
        <p className="msg msg-error" role="alert">
          {error}
        </p>
      )}
      {setup && <SetupSheet open onClose={() => setSetup(false)} dialect={story.dialect} initialMode="duo" story={story} skipReading />}
    </section>
  );
}
