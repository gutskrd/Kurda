import { useEffect, useMemo, useState } from 'react';
// Soranî titles in a face made for Arabic script
import '@fontsource-variable/vazirmatn';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  STORY_DIALECTS,
  STORY_LENGTHS,
  STORY_LEVELS,
  normalizeJoinCode,
  parseInvite,
  storyTextDirection,
  invitePath,
  type StoryDialect,
  type StoryGameSummary,
  type StoryGameView,
  type StoryLevel,
  type StoryListItem,
  type StoryProgress,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { ErrorState, Loading } from '../components/states';
import { ArrowIcon, ChevronIcon, HeadphonesIcon } from '../components/icons';
import { RequireAccount } from '../components/RequireAccount';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { dialectName } from '../learn/map';
import { ChipRadio } from '../play/ChipRadio';
import { gamePath, readerPath, storyError } from './api';
import { useStoryCount, useStoryList } from './catalogue';
import { defaultVariety, rememberLength, rememberVariety, rememberedLength, type LengthFilter } from './prefs';
import { LENGTH_KEY, MODE_KEY, SetupSheet, minutesLabel } from './SetupSheet';

/** A level filter is worth its space only once a variety has this many stories (contract §A1). */
export const LEVEL_FILTER_MIN = 20;

/**
 * Stories (/app/games/stories): what there is to read, and the ways into a
 * quiz on it — Continue an unfinished game, play with friends, or join a
 * friend's game with its code.
 *
 * `?id=<game>` is an invite link: the page joins that game (if the join rule
 * lets you) and opens it.
 */
export function StoriesHub(): React.JSX.Element {
  const [params] = useSearchParams();
  const id = params.get('id');
  const t = useT();
  if (id) {
    return (
      <RequireAccount what="gate.what.playOthers">
        <OpenGame key={id} target={{ id }} />
      </RequireAccount>
    );
  }
  return (
    <div className="container game-page story-hub">
      <div className="page-header">
        <Link to="/app/games" className="back-link">
          <ArrowIcon size={16} />
          {t('games.back')}
        </Link>
        <h1 className="page-title">{t('games.stories.name')}</h1>
        <p className="page-sub">{t('stories.hub.sub')}</p>
      </div>
      <Hub />
    </div>
  );
}

/** Joining a game from a link or a code, then into it. */
function OpenGame({ target }: { target: { id: string } | { code: string } }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void client.post<StoryGameView>('/story-games/join', target).then((res) => {
      if (!live) return;
      if (res.ok) navigate(gamePath(res.data.id), { replace: true });
      else setError(storyError(res.error, t));
    });
    return () => {
      live = false;
    };
  }, []); // one join per link: the target is read once

  return (
    <div className="container container-narrow game-page">
      {error ? (
        <ErrorState
          title={t('stories.join.failed')}
          message={error}
        />
      ) : (
        <Loading label={t('games.joining')} />
      )}
      {error && (
        <p className="story-back-row">
          <Link to="/app/games/stories" className="btn btn-secondary">
            {t('stories.backToStories')}
          </Link>
        </p>
      )}
    </div>
  );
}

function Hub(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client, status } = useAuth();
  const signedIn = status === 'signedIn';
  const [variety, setVariety] = useState<StoryDialect>(() => defaultVariety(locale));
  const [length, setLength] = useState<LengthFilter>(rememberedLength);
  const [level, setLevel] = useState<StoryLevel | 'all'>('all');
  const [active, setActive] = useState<StoryGameSummary[]>([]);
  const [progress, setProgress] = useState<Map<string, StoryProgress>>(new Map());
  const [setup, setSetup] = useState(false);
  const { stories, error, reload } = useStoryList(variety);
  const other: StoryDialect = variety === 'kurmanci' ? 'sorani' : 'kurmanci';
  const empty = stories !== null && stories.length === 0;
  const otherCount = useStoryCount(other, empty);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void client.get<{ games: StoryGameSummary[] }>('/story-games/active').then((r) => {
      if (live && r.ok) setActive(r.data.games ?? []);
    });
    void client.get<{ progress: StoryProgress[] }>('/story-games/history').then((r) => {
      if (live && r.ok) setProgress(new Map((r.data.progress ?? []).map((p) => [p.storyId, p])));
    });
    return () => {
      live = false;
    };
  }, [client, signedIn]);

  const chooseVariety = (d: StoryDialect): void => {
    setVariety(d);
    setLevel('all');
    rememberVariety(d);
  };
  const chooseLength = (l: LengthFilter): void => {
    setLength(l);
    rememberLength(l);
  };

  const showLevels = (stories?.length ?? 0) >= LEVEL_FILTER_MIN;
  const shown = useMemo(
    () =>
      (stories ?? []).filter(
        (s) => (length === 'all' || s.length === length) && (!showLevels || level === 'all' || s.level === level),
      ),
    [stories, length, level, showLevels],
  );

  return (
    <>
      {active.length > 0 && (
        <section className="story-continue" aria-labelledby="story-continue-title">
          <h2 id="story-continue-title" className="story-section-title">
            {t('stories.hub.continueTitle')}
          </h2>
          <ul className="story-continue-list">
            {active.map((g) => (
              <li key={g.id}>
                <ContinueCard game={g} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="story-filters">
        <ChipRadio
          label={t('stories.variety')}
          value={variety}
          onChange={chooseVariety}
          options={STORY_DIALECTS.map((d) => ({ value: d, label: dialectName(d) }))}
        />
        <ChipRadio
          label={t('stories.length')}
          value={length}
          onChange={chooseLength}
          options={[
            { value: 'all' as const, label: t('stories.length.all') },
            ...STORY_LENGTHS.map((l) => ({ value: l, label: t(LENGTH_KEY[l]), hint: minutesLabel(variety, l, t) })),
          ]}
        />
        {showLevels && (
          <ChipRadio
            label={t('stories.level')}
            value={level}
            onChange={setLevel}
            options={[
              { value: 'all' as const, label: t('stories.level.all') },
              ...STORY_LEVELS.map((lv) => ({ value: lv, label: t('stories.level.n', { level: lv }) })),
            ]}
          />
        )}
      </div>

      <PlayRow catalogueReady={!empty && stories !== null} onPlayWithFriends={() => setSetup(true)} signedIn={signedIn} />

      {error && <ErrorState title={t('stories.loadFailed')} message={error} onRetry={reload} />}
      {!error && stories === null && <Loading label={t('stories.loading')} />}

      {empty && (
        <div className="state story-empty">
          <h3>{t('stories.empty.variety', { variety: dialectName(variety) })}</h3>
          {otherCount !== null && otherCount > 0 && (
            <Button variant="secondary" onClick={() => chooseVariety(other)}>
              {t('stories.empty.switch', { variety: dialectName(other) })}
            </Button>
          )}
        </div>
      )}

      {stories !== null && !empty && shown.length === 0 && (
        <div className="state story-empty">
          <h3>{t('stories.empty.filter')}</h3>
          <Button variant="secondary" onClick={() => chooseLength('all')}>
            {t('stories.empty.showAll')}
          </Button>
        </div>
      )}

      {shown.length > 0 && (
        <section aria-labelledby="story-list-title">
          <h2 id="story-list-title" className="sr-only">
            {t('stories.list.title')}
          </h2>
          <ul className="story-list">
            {shown.map((s) => (
              <li key={s.id}>
                <StoryCard story={s} progress={progress.get(s.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {setup && stories && (
        <SetupSheet
          open
          onClose={() => setSetup(false)}
          dialect={variety}
          initialMode="duo"
          catalogue={stories}
          initialLength={length === 'all' ? null : length}
        />
      )}
    </>
  );
}

const STATUS_KEY: Record<'lobby' | 'reading', MessageKey> = {
  lobby: 'stories.status.lobby',
  reading: 'stories.status.reading',
};

function ContinueCard({ game }: { game: StoryGameSummary }): React.JSX.Element {
  const t = useT();
  const { lang, dir } = storyTextDirection(game.dialect);
  const where =
    game.status === 'lobby' || game.status === 'reading'
      ? t(STATUS_KEY[game.status])
      : t('stories.status.question', { index: game.currentIndex + 1, total: game.total });
  return (
    <Link to={gamePath(game.id)} className="story-continue-card">
      <span className="story-continue-text">
        <span className="story-continue-title" lang={lang} dir={dir}>
          {game.storyTitle}
        </span>
        <span className="story-continue-meta">
          {t(MODE_KEY[game.mode])} · {where}
        </span>
      </span>
      <span className="story-continue-go">
        {t('stories.continue')}
        <ChevronIcon size={16} className="story-chevron" />
      </span>
    </Link>
  );
}

function StoryCard({ story, progress }: { story: StoryListItem; progress?: StoryProgress }): React.JSX.Element {
  const t = useT();
  const { lang, dir } = storyTextDirection(story.dialect);
  return (
    <Link to={readerPath(story.slug)} className="story-card">
      <span className="story-card-head">
        <span className="story-card-title" lang={lang} dir={dir}>
          {story.title}
        </span>
        {progress && (
          <span className="badge badge-gold story-done">
            {t('stories.done', { correct: progress.bestCorrect, total: progress.total })}
          </span>
        )}
      </span>
      {story.summary && (
        <span className="story-card-summary" lang={lang} dir={dir}>
          {story.summary}
        </span>
      )}
      <span className="story-card-meta">
        <span>{t('stories.level.n', { level: story.level })}</span>
        <span>{t(LENGTH_KEY[story.length])}</span>
        <span>{t('stories.minutes', { count: story.readingMinutes })}</span>
        {story.fullyNarrated && (
          <span className="story-narrated">
            <HeadphonesIcon size={14} />
            {t('stories.narrated')}
          </span>
        )}
      </span>
    </Link>
  );
}

/**
 * Playing with others: set up a game, or join one with its code. A link
 * pasted in works too — it is tried first, so a whole invite link is as good
 * as the code in it.
 */
function PlayRow({
  catalogueReady,
  onPlayWithFriends,
  signedIn,
}: {
  catalogueReady: boolean;
  onPlayWithFriends: () => void;
  signedIn: boolean;
}): React.JSX.Element {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const { client } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <div className="story-play story-play-guest">
        <p className="muted">{t('stories.hub.guest')}</p>
        <Link to="/register" className="btn btn-secondary btn-sm" state={{ from: `${location.pathname}${location.search}` }}>
          {t('auth.login.createAccount')}
        </Link>
      </div>
    );
  }

  async function join(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const invite = parseInvite(code);
    if (invite && invite.type !== 'stories') {
      navigate(invitePath(invite));
      return;
    }
    const normalized = invite ? null : normalizeJoinCode(code);
    if (!invite && !normalized) {
      setError(t('stories.join.invalid'));
      return;
    }
    setBusy(true);
    const res = await client.post<StoryGameView>('/story-games/join', invite ? { id: invite.id } : { code: normalized });
    setBusy(false);
    if (res.ok) navigate(gamePath(res.data.id));
    else setError(storyError(res.error, t));
  }

  return (
    <div className="story-play">
      <Button variant="secondary" onClick={onPlayWithFriends} disabled={!catalogueReady}>
        {t('stories.playFriends')}
      </Button>
      <form className="story-join" onSubmit={(e) => void join(e)} noValidate>
        <label htmlFor="story-join-code" className="story-join-label">
          {t('stories.join.label')}
        </label>
        <div className="story-join-row">
          <input
            id="story-join-code"
            className="input story-join-input"
            dir="ltr"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('stories.join.placeholder')}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-describedby={error ? 'story-join-error' : undefined}
            aria-invalid={error ? true : undefined}
          />
          <Button type="submit" disabled={busy || code.trim() === ''}>
            {busy ? t('games.joining') : t('stories.join.go')}
          </Button>
        </div>
        {error && (
          <p id="story-join-error" className="story-join-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
