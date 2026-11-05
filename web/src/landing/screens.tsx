import type { CSSProperties } from 'react';
import { fireLevel, storyCoverPath } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { BookIcon, BookmarkIcon, CheckIcon, CloseIcon, CoinIcon, HomeIcon, LockIcon, SearchIcon, SendIcon, TrophyIcon } from '../components/icons';
import { Fire } from '../components/Fire';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { PlayerChip } from '../ui/PlayerChip';
import { useAvatarSrc } from '../art/overrides';
import { Ku, Mock, TileRow } from './mocks';
import { BATTLE_GUESSES, HEVAL, LESSON, PATH_UNIT, PEOPLE, STORIES } from './samples';

/**
 * The phone app's own screens, for the 3D phone on the front page.
 *
 * Each is the screen as the app draws it — the Learn header with its streak,
 * daily goal and Zêr, the Lessons · Stories · Games switch, the path with
 * Hevalo beside it, the tab bar — set in the app's own words (its catalogue
 * keys) and colours, so the picture is the product a visitor will open and not
 * an idea of it. They are markup for the reasons `mocks.tsx` gives: small,
 * sharp at any size, and in the reader's language. Like every picture on the
 * page, each is one image to a screen reader, with a sentence saying what it
 * shows, and nothing in it can be focused or pressed.
 */

/** The streak, the day's goal and the purse, as the Learn header shows them. */
function LearnStats(): React.JSX.Element {
  return (
    <span className="ps-stats">
      <span className="ps-stat">
        <Fire size={18} level={fireLevel(3)} still />
        3
      </span>
      {/* the day's goal: a ring part full */}
      <svg className="ps-goal" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <circle cx="9" cy="9" r="6.5" className="ps-goal-track" />
        <circle cx="9" cy="9" r="6.5" className="ps-goal-fill" strokeDasharray={`${2 * Math.PI * 6.5 * 0.55} 100`} />
      </svg>
      <span className="ps-stat">
        <CoinIcon size={16} />
        40
      </span>
    </span>
  );
}

const VIEWS: ReadonlyArray<{ id: 'lessons' | 'stories' | 'games'; key: MessageKey }> = [
  { id: 'lessons', key: 'learn.view.lessons' },
  { id: 'stories', key: 'learn.view.stories' },
  { id: 'games', key: 'nav.games' },
];

/** The top of the Learn tab: its title, the three numbers, and which of its three views is open. */
function LearnTop({ view }: { view: 'lessons' | 'stories' }): React.JSX.Element {
  const t = useT();
  return (
    <>
      <span className="ps-head">
        <span className="ps-title">{t('nav.learn')}</span>
        <LearnStats />
      </span>
      <span className="ps-seg">
        {VIEWS.map((v) => (
          <span key={v.id} className={v.id === view ? 'is-on' : undefined}>
            {t(v.key)}
          </span>
        ))}
      </span>
    </>
  );
}

/** A face from the app's avatar set, as small as the tab bar draws yours. */
function Face({ src, size }: { src: string; size: number }): React.JSX.Element {
  const face = useAvatarSrc(src) ?? src;
  return <img className="ps-face" src={face} alt="" width={size} height={size} loading="lazy" decoding="async" />;
}

/** The app's tab bar: Home, Learn (here), Messages, Search and you. */
function TabBar(): React.JSX.Element {
  return (
    <span className="ps-tabbar">
      <HomeIcon size={20} />
      <span className="ps-tab-on">
        <BookIcon size={20} weight="fill" />
      </span>
      <SendIcon size={20} />
      <SearchIcon size={20} />
      <Face src={PEOPLE.you.avatar} size={22} />
    </span>
  );
}

/** Where each stop on the path stands, across from the middle, as the app winds it. */
const STOPS: ReadonlyArray<{ x: number; kind: 'done' | 'current' | 'locked' | 'trophy' }> = [
  { x: 38, kind: 'done' },
  { x: -42, kind: 'current' },
  { x: 8, kind: 'locked' },
  { x: 50, kind: 'locked' },
  { x: 0, kind: 'trophy' },
];
const STEP = 80;

/**
 * The learning path: the unit's band, its lessons as round stops down a
 * winding trail — one done, the next ready with its ring and a Start bubble,
 * the rest still shut, the unit's trophy at the end — and Hevalo standing by.
 */
export function PathScreen(): React.JSX.Element {
  const t = useT();
  const height = STEP * (STOPS.length - 1) + 60;
  const trail = STOPS.slice(1)
    .map((s, i) => {
      const a = STOPS[i]!;
      const y0 = 30 + i * STEP;
      const y1 = y0 + STEP;
      return `M ${a.x} ${y0} C ${a.x} ${y0 + STEP / 2}, ${s.x} ${y1 - STEP / 2}, ${s.x} ${y1}`;
    })
    .join(' ');
  return (
    <Mock label={t('landing.mock.pathLabel')} className="ps ps-learn">
      <LearnTop view="lessons" />
      <span className="ps-unit">
        <span className="ps-unit-text">
          <span className="ps-unit-n">{t('coursemap.unit', { n: 1 })}</span>
          <Ku className="ps-unit-title">{PATH_UNIT}</Ku>
        </span>
        <span className="ps-unit-guide">
          <BookIcon size={16} />
        </span>
      </span>
      <span className="ps-path" style={{ height } as CSSProperties}>
        <svg className="ps-trail" width="1" height={height} aria-hidden="true">
          <path d={trail} />
        </svg>
        {STOPS.map((s, i) => (
          <span key={i} className={`ps-stop is-${s.kind}`} style={{ '--x': `${s.x}px`, '--y': `${30 + i * STEP}px` } as CSSProperties}>
            {s.kind === 'current' && (
              <>
                <span className="ps-bubble">{t('learn.start')}</span>
                <svg className="ps-ring" width="66" height="66" viewBox="-33 -33 66 66" aria-hidden="true">
                  <circle r="29" className="ps-ring-track" />
                  <circle r="29" className="ps-ring-fill" strokeDasharray={`${2 * Math.PI * 29 * 0.34} 200`} />
                </svg>
              </>
            )}
            <span className="ps-node">
              {s.kind === 'done' ? (
                <CheckIcon size={22} weight="bold" />
              ) : s.kind === 'current' ? (
                <span className="ps-num">2</span>
              ) : s.kind === 'trophy' ? (
                <TrophyIcon size={22} />
              ) : (
                <LockIcon size={20} weight="bold" />
              )}
            </span>
          </span>
        ))}
        <span className="ps-mascot">
          <SpeakingCharacter speaker="hevalo" audio={null} crop="full" size={112} decorative />
        </span>
      </span>
      <TabBar />
    </Mock>
  );
}

const EMPTY_ROW = ['empty', 'empty', 'empty', 'empty', 'empty'] as const;

/**
 * A Peyvok Battle against a friend, solved on `heval`: the two players, the
 * board in the game's colours, and what the win paid.
 */
export function BattleScreen(): React.JSX.Element {
  const t = useT();
  return (
    <Mock label={t('landing.mock.battleLabel')} className="ps ps-battle">
      <span className="ps-bar">
        <span className="ps-bar-title">{t('games.battle.name')}</span>
        <span className="lp-live" aria-hidden />
      </span>
      <div className="players">
        <PlayerChip name={t('games.you')} status={t('games.battle.solvedIn', { count: 3 })} avatarUrl={PEOPLE.you.avatar} done />
        <PlayerChip
          name={PEOPLE.rojin.name}
          status={t('games.battle.lettersProgress', { done: 3, total: 5 })}
          avatarUrl={PEOPLE.rojin.avatar}
          progress={0.6}
        />
      </div>
      <div className="lp-board">
        {BATTLE_GUESSES.map((g, r) => (
          <TileRow key={g.word} word={g.word} marks={g.marks} row={r} />
        ))}
        {[0, 1, 2].map((r) => (
          <TileRow key={`empty-${r}`} word="" marks={EMPTY_ROW} />
        ))}
      </div>
      <div className="lp-result">
        <span>
          <Ku className="lp-result-word">{HEVAL}</Ku>
          <span className="lp-result-gloss">{t('landing.gloss.heval')}</span>
        </span>
        <span className="lp-xp">+18 {t('rankings.unit.xp')}</span>
      </div>
    </Mock>
  );
}

/**
 * The story library: search, how far you are, the story you are reading with
 * how much of it is behind you, and the stories the editors feature.
 */
export function StoriesScreen(): React.JSX.Element {
  const t = useT();
  const [reading, ...featured] = STORIES;
  return (
    <Mock label={t('landing.mock.storiesLabel')} className="ps ps-stories">
      <LearnTop view="stories" />
      <span className="ps-search">
        <SearchIcon size={14} />
        {t('stories.library.searchPlaceholder')}
      </span>
      <span className="ps-progress">
        <svg className="ps-progress-ring" width="46" height="46" viewBox="-23 -23 46 46" aria-hidden="true">
          <circle r="19" className="ps-goal-track" />
          <circle r="19" className="ps-goal-fill" strokeDasharray={`${2 * Math.PI * 19 * 0.33} 200`} />
        </svg>
        <span className="ps-progress-pct">33%</span>
        <span className="ps-progress-text">
          <span className="ps-progress-title">{t('stories.library.progressTitle')}</span>
          <span>{t('stories.library.finishedOf', { finished: 3, total: 9 })}</span>
        </span>
      </span>
      <span className="ps-shelf">{t('stories.library.continue')}</span>
      {reading && <StoryCard story={reading} wide />}
      <span className="ps-shelf">{t('stories.library.featured')}</span>
      <span className="ps-row">
        {featured.map((s) => (
          <StoryCard key={s.title} story={s} />
        ))}
      </span>
      <TabBar />
    </Mock>
  );
}

function StoryCard({ story, wide = false }: { story: (typeof STORIES)[number]; wide?: boolean }): React.JSX.Element {
  const t = useT();
  const src = storyCoverPath(story.cover);
  return (
    <span className={`ps-story${wide ? ' is-wide' : ''}`}>
      <span className="ps-cover">
        {src && <img src={src} alt="" loading="lazy" decoding="async" draggable={false} />}
        <span className="ps-mark">
          <BookmarkIcon size={12} />
        </span>
        {story.read > 0 && <span className="ps-read" style={{ width: `${Math.round(story.read * 100)}%` }} />}
      </span>
      <Ku className="ps-story-title">{story.title}</Ku>
      {wide && (
        <span className="ps-story-meta">
          <span className="ps-level">{story.level}</span>
          {t('stories.minutes', { count: story.minutes })}
        </span>
      )}
    </span>
  );
}

const LESSON_OPTIONS: ReadonlyArray<{ key: MessageKey; right?: boolean }> = [
  { key: 'landing.gloss.whatDay', right: true },
  { key: 'landing.gloss.whatTime' },
  { key: 'landing.gloss.whereYesterday' },
];

/**
 * One exercise from the lesson player: a sentence, a hint on the new word in
 * it, three meanings to choose from, and the answer marked right with the
 * panel that rises under it.
 */
export function LessonScreen(): React.JSX.Element {
  const t = useT();
  return (
    <Mock label={t('landing.mock.lessonLabel')} className="ps ps-lesson">
      <span className="ps-lesson-top">
        <CloseIcon size={18} />
        <span className="ps-lesson-bar" aria-hidden>
          <span style={{ width: '66%' }} />
        </span>
        <Ku className="ps-lesson-skill">{LESSON.skill}</Ku>
      </span>
      <span className="ps-lesson-prompt">{t('landing.mock.lessonPrompt')}</span>
      <p className="lp-lesson-sentence" lang="ku">
        {LESSON.sentence.map((w, i) =>
          i === LESSON.hint ? (
            <span key={w} className="lp-hinted">
              {w}
              <span className="lp-hint">{t('landing.gloss.roj')}</span>
            </span>
          ) : (
            <span key={w}>{w}</span>
          ),
        )}
      </p>
      <span className="ps-options">
        {LESSON_OPTIONS.map((o) => (
          <span key={o.key} className={`ps-option${o.right ? ' is-right' : ''}`}>
            {t(o.key)}
            {o.right && <CheckIcon size={16} weight="bold" />}
          </span>
        ))}
      </span>
      <span className="ps-feedback">
        <span className="ps-feedback-text">
          <CheckIcon size={18} weight="bold" />
          {t('landing.mock.correct')}
        </span>
        <span className="ps-feedback-btn">{t('landing.mock.continue')}</span>
      </span>
    </Mock>
  );
}
