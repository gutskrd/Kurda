import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// Soranî in a face made for Arabic script, fetched only when a story page opens.
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  PAID_STORY_REPEATS_PER_DAY,
  STORY_ASSESSMENT,
  glossFor,
  storySpelling,
  storyTextDirection,
  type GameDialect,
  type StoryDetail,
  type StoryDialect,
  type StoryGameSummary,
  type StoryGlossEntry,
  type StoryMe,
  type StoryTradition,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useOptimistic } from '../lib/optimistic';
import { Button } from '../components/Button';
import { ErrorState, Loading } from '../components/states';
import { ArrowIcon, BookmarkIcon, HeadphonesIcon, LockIcon } from '../components/icons';
import { describeError } from '../lib/api';
import { prefersReducedMotion } from '../lib/motion';
import { useGrowsInto } from '../lib/viewTransition';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { dialectName } from '../learn/map';
import { STORIES_LIBRARY, createGame, gamePath, readerPath, setBookmark, storyError } from './api';
import { useStoryCategories } from './catalogue';
import { StoryCover } from './Cover';
import { GAME_SPELLING, categoryLabel, levelHint, levelName, minutesLeft, narratedKey } from './labels';
import { rememberTextSize, rememberVariety, rememberedExtraTime, rememberedTextSize } from './prefs';
import { StoryPlayerBar, TextSizeControl } from './ReaderControls';
import { SetupSheet } from './SetupSheet';
import { PlayWordButton, SaveWordButton, StoryText } from './StoryText';
import { useReadingProgress } from './useReadingProgress';
import { useStoryAudio } from './useStoryAudio';
import { AboutStory, ChapterContents, ChapterPicker, Reflections, hasAbout, localeDir, ownLocale, useChapterPosition, useMetaTranslation } from './Legend';
import { VarietySwitch } from '../lore/LoreParts';

type Load = { state: 'loading' } | { state: 'ready'; story: StoryDetail } | { state: 'gone' } | { state: 'error'; message: string };

/**
 * A story (/app/learn/stories/:slug), open to everyone; the check after it needs an account. The overview (cover, facts,
 * synopsis, Read or Continue and Listen, bookmark, key vocabulary, check) sits above the text, which has the glossary,
 * per-paragraph translations, a docked player when recorded, and the reader's place saved as they go.
 *
 * A story told in both varieties has the library's Kurmancî | Soranî switch at its head; switching opens the other
 * telling from its top in this page's place and keeps the choice. A story told once names its variety in the byline.
 */
export function StoryReader(): React.JSX.Element {
  const { slug = '' } = useParams();
  return <StoryPage key={slug} slug={slug} />;
}

/** What the switch hands the page it opens: the other telling, already fetched. */
interface Handover {
  story?: StoryDetail;
}

function StoryPage({ slug }: { slug: string }): React.JSX.Element {
  const t = useT();
  const { client, status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const handed = (location.state as Handover | null)?.story;
  const [load, setLoad] = useState<Load>(() => (handed?.slug === slug ? { state: 'ready', story: handed } : { state: 'loading' }));
  // A handed-over telling is shown as it came, not fetched again.
  const handedOver = useRef(handed?.slug === slug);
  const [nonce, setNonce] = useState(0);
  const signedIn = status === 'signedIn';
  // The library card's cover lands here (lib/viewTransition.tsx); promised now, while the story loads, so the page is
  // held for it.
  const cover = useGrowsInto(`story:${slug}`);

  // The handover is for this opening only, so a reload fetches the story afresh.
  useEffect(() => {
    if (handed) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, []); // Once, as the page opens.

  useEffect(() => {
    // Fetched once the session is known, so the reader's own record comes with it.
    if (status === 'restoring') return;
    if (handedOver.current) {
      handedOver.current = false;
      return;
    }
    let live = true;
    setLoad({ state: 'loading' });
    void client.get<StoryDetail>(`/stories/${encodeURIComponent(slug)}`).then((res) => {
      if (!live) return;
      if (res.ok) setLoad({ state: 'ready', story: res.data });
      // Unpublished looks the same as never published.
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
      {load.state === 'ready' && <ReadStory story={load.story} cover={cover} />}
    </div>
  );
}

/** What a story's tradition says about where it comes from, in the overview's byline. */
const TRADITION_KEY: Record<StoryTradition, MessageKey> = {
  traditional: 'stories.overview.tradition.traditional',
  adapted: 'stories.overview.tradition.adapted',
  original: 'stories.overview.tradition.original',
};

function ReadStory({ story, cover }: { story: StoryDetail; cover: React.Ref<HTMLSpanElement> }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const navigate = useNavigate();
  const { client, status } = useAuth();
  const signedIn = status === 'signedIn';
  // The other telling being fetched while the switch already shows it, and why the last one failed.
  const [switching, setSwitching] = useState<StoryDialect | null>(null);
  const [switchProblem, setSwitchProblem] = useState<string | null>(null);
  const { lang, dir } = storyTextDirection(story.dialect);
  const [me, setMe] = useState<StoryMe | null>(story.me ?? null);
  const [size, setSize] = useState(rememberedTextSize);
  const [bookmarkProblem, setBookmarkProblem] = useState<string | null>(null);
  const [bookmarked, wantBookmark] = useOptimistic(story.me?.bookmarked === true, (on) => setBookmark(client, story.id, on), {
    fromAnswer: (data) => data.bookmarked,
    onFailed: () => setBookmarkProblem(t('stories.library.bookmarkFailed')),
  });
  const audio = useStoryAudio(story.paragraphs, story.audio, story.voices, false, story.narration);
  const categories = useStoryCategories();
  const text = useRef<HTMLDivElement>(null);
  const { observe } = useReadingProgress({ storyId: story.id, count: story.paragraphs.length, enabled: signedIn, initial: story.me ?? null, onMe: setMe });
  // The reader's place when the page opened, offered once as a way back.
  const [resume, setResume] = useState<number | null>(() => (story.me && !story.me.finishedAt && story.me.paragraph > 0 ? story.me.paragraph : null));

  const changeSize = useCallback((next: number) => {
    setSize(next);
    rememberTextSize(next);
  }, []);

  // The translation in the reader's language, else English, cut to paragraphs; none when the story has neither.
  const translation = useMemo(() => {
    const own = story.translations?.[locale];
    if (own && own.length === story.paragraphs.length) return { lang: locale, paragraphs: own };
    const en = story.translations?.en;
    if (en && en.length === story.paragraphs.length) return { lang: 'en', paragraphs: en };
    return null;
  }, [story.translations, story.paragraphs.length, locale]);

  const category = useMemo(
    () => (story.category ? categoryLabel(story.category, categories, locale, t) : null),
    [categories, story.category, locale, t],
  );

  const scrollToParagraph = (index: number): void => {
    const el = text.current?.querySelector<HTMLElement>(`[data-paragraph="${index}"]`) ?? text.current;
    // Instant under reduced motion.
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

  function toggleBookmark(): void {
    setBookmarkProblem(null);
    wantBookmark((on) => !on);
  }

  // A legend's chapters: where the reader is among them and how far they have read.
  const sections = useMemo(() => story.sections ?? [], [story.sections]);
  const position = useChapterPosition(text, sections);
  const furthest = Math.max(position.furthest, me && me.share > 0 ? me.paragraph : -1);
  const meta = useMetaTranslation(story);
  const about = hasAbout(story);

  const left = minutesLeft({ readingMinutes: story.readingMinutes, me: me ?? undefined });
  const finished = me?.finishedAt !== null && me?.finishedAt !== undefined;
  const narrated = narratedKey(story);
  // The same story in the other variety, when told in both.
  const otherTelling = story.versions.find((v) => v.dialect !== story.dialect) ?? null;

  /**
   * The switch: fetches the other telling while this one stays, then opens it here (Back still returns to where the
   * reader came from) and keeps the choice. A failed fetch leaves the reader where they were and says so.
   */
  async function switchTo(next: GameDialect): Promise<void> {
    const dialect = storySpelling(next);
    const version = story.versions.find((v) => v.dialect === dialect);
    if (!version || switching || dialect === story.dialect) return;
    setSwitching(dialect);
    setSwitchProblem(null);
    const res = await client.get<StoryDetail>(`/stories/${encodeURIComponent(version.slug)}`);
    if (!res.ok) {
      setSwitching(null);
      setSwitchProblem(res.error.status === 404 ? t('stories.reader.updating') : describeError(res.error, t));
      return;
    }
    rememberVariety(dialect);
    navigate(readerPath(res.data.slug), { replace: true, state: { story: res.data } satisfies Handover });
  }

  return (
    <article className="story-article" aria-labelledby="story-title">
      <header className="story-overview">
        <StoryCover slug={story.slug} cover={story.cover} className="story-overview-cover" eager ref={cover} />
        <div className="story-overview-body">
          {otherTelling && (
            <div className="story-variety-reader">
              <VarietySwitch value={GAME_SPELLING[switching ?? story.dialect]} onChange={(d) => void switchTo(d)} />
              {switchProblem && (
                <p className="msg msg-error" role="alert">
                  {switchProblem}
                </p>
              )}
            </div>
          )}
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
          {/* The title in the reader's language under the Kurdish one. */}
          {meta.title && (
            <p className="story-title-tr" lang={meta.title.lang} dir={localeDir(meta.title.lang)}>
              {meta.title.text}
            </p>
          )}
          <p className="story-byline">
            <span>{t(TRADITION_KEY[story.tradition])}</span>
            {story.author && <span>{story.author}</span>}
            {/* Which Kurdish it is, unless the switch says so. */}
            {!otherTelling && <span>{dialectName(story.dialect)}</span>}
          </p>
          {story.summary && (
            <p className="story-summary" lang={lang} dir={dir}>
              {story.summary}
            </p>
          )}
          {meta.summary && (
            <p className="story-summary-tr" lang={meta.summary.lang} dir={localeDir(meta.summary.lang)}>
              {meta.summary.text}
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
                onClick={toggleBookmark}
              >
                <BookmarkIcon size={18} weight={bookmarked ? 'fill' : 'regular'} className={bookmarked ? 'saved-mark' : undefined} />
                <span>{bookmarked ? t('stories.overview.bookmarked') : t('stories.overview.bookmark')}</span>
              </button>
            )}
          </div>
          {bookmarkProblem && (
            <p className="msg msg-error" role="alert">
              {bookmarkProblem}
            </p>
          )}
        </div>
      </header>

      <ChapterContents
        story={{ dialect: story.dialect, sections, paragraphs: story.paragraphs }}
        translation={locale === ownLocale(story.dialect) ? null : translation}
        current={position.current}
        furthest={furthest}
        finished={finished}
        onJump={scrollToParagraph}
      />
      <KeyVocabulary glossary={story.glossary} dialect={story.dialect} />
      <CheckBlock story={story} me={me} id="story-check" />

      <div className="story-reader" ref={text}>
        <div className="story-tools">
          <TextSizeControl step={size} onChange={changeSize} />
          <ChapterPicker sections={sections} current={position.current} onJump={scrollToParagraph} />
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
        {/* A story with notes or sources says where it comes from after reading. */}
        {!about && (story.source || story.attributionNote) && (
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
        {/* Docked inside the text, the player is at the foot of the screen only while the text is, never over the overview. */}
        {audio.track.length > 0 && <StoryPlayerBar audio={audio} docked />}
      </div>

      <CheckBlock story={story} me={me} id="story-check-end" />
      <Reflections story={story} />
      <AboutStory story={story} />
    </article>
  );
}

/** "Key vocabulary": every glossary word with its meaning in the reader's language, part of speech, recording and Save word. */
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
 * The check: five questions on the story, the solo game started with STORY_ASSESSMENT. Locked until the server marks the
 * story finished, then "Check what you understood", or the best so far and "Check again". An unfinished check is offered
 * first rather than replaced, and a second check on the same day says what it pays before starting. It can also be
 * played with friends from here.
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
