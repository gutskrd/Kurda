import type { CSSProperties, ReactNode } from 'react';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { CheckIcon, CloseIcon, CoinIcon, CommentIcon, HeartIcon, MicIcon, PlayIcon, WaveformIcon } from '../components/icons';
import { ProfileCard } from '../ui/ProfileCard';
import { LeagueLadder, leagueName } from '../ui/LeagueLadder';
import { RankList, RankRow } from '../ui/RankRow';
import { PlayerChip } from '../ui/PlayerChip';
import { InviteCardBody } from '../ui/InviteCardBody';
import {
  BATTLE_GUESSES,
  HEVAL,
  KURDISH_LETTERS,
  LESSON,
  PEOPLE,
  POEM,
  PROFILE_BACKGROUND,
  QUIZ_PROMPT,
  RACE_TEXT,
  RACE_TYPED,
  RHYME,
} from './samples';

/**
 * Pictures of Hevalo, drawn in Hevalo's own parts.
 *
 * The landing page shows the product rather than describing it, and these are
 * the pictures. They are markup rather than screenshots for three reasons: they
 * are a few hundred bytes instead of a few hundred kilobytes, they stay sharp at
 * every size, and their words are the reader's language — a German visitor sees
 * "Wortduell" on the battle, not a frozen English screenshot.
 *
 * Every label in them that the app already has is the app's own key — the
 * game's name, "You", the league tier, "Level 12" — so the picture says exactly
 * what the screen does. They only ever show what the product really does; see
 * `samples.ts` for where each piece of Kurdish comes from.
 *
 * Each one is a single image to assistive technology: `role="img"` with a
 * sentence describing it, so a screen reader hears "a Wordle battle between you
 * and Rojîn" once, instead of thirty letter tiles one by one. Nothing inside is
 * focusable or clickable — a button in a picture that does nothing is a lie.
 */

/** One picture: an image to a screen reader, a piece of the app to the eye. */
export function Mock({ label, className, children }: { label: string; className?: string; children: ReactNode }): React.JSX.Element {
  return (
    <div role="img" aria-label={label} className={`lp-mock${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}

/** A face from the app's own avatar set. Decorative: the mock's label names who is there. */
function Face({ src, size = 36, lazy = true }: { src: string; size?: number; lazy?: boolean }): React.JSX.Element {
  return (
    <img
      className="lp-face"
      src={src}
      alt=""
      width={size}
      height={size}
      loading={lazy ? 'lazy' : undefined}
      decoding="async"
    />
  );
}

/** A Kurdish word, set the way the page sets every Kurdish word: in the serif. */
export function Ku({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return (
    <span className={`lp-ku${className ? ` ${className}` : ''}`} lang="ku" dir="ltr">
      {children}
    </span>
  );
}

type Mark = 'green' | 'yellow' | 'gray' | 'empty';

/**
 * A Wordle row in the real game's colours.
 *
 * `--i` staggers the tiles so a row can turn over left to right, the way the
 * game reveals a guess; the stylesheet decides whether it animates at all.
 */
export function TileRow({ word, marks, row = 0 }: { word: string; marks: ReadonlyArray<Mark>; row?: number }): React.JSX.Element {
  const letters = Array.from(word);
  return (
    <div className="lp-tiles">
      {marks.map((mark, i) => (
        <span key={i} className={`lp-tile lp-tile--${mark}`} style={{ '--i': row * 5 + i } as CSSProperties}>
          {letters[i] ?? ''}
        </span>
      ))}
    </div>
  );
}

const EMPTY_ROW: ReadonlyArray<Mark> = ['empty', 'empty', 'empty', 'empty', 'empty'];

/**
 * The hero: a Wordle Battle against a friend, solved on `heval`.
 *
 * This is the product's whole argument in one screen — a Kurdish word, a game,
 * and somebody you know on the other side of it.
 */
export function BattleMock(): React.JSX.Element {
  const t = useT();
  return (
    <Mock label={t('landing.mock.battleLabel')} className="lp-phone">
      <div className="lp-phone-screen">
        <div className="lp-phone-bar">
          <span className="lp-phone-title">{t('games.battle.name')}</span>
          <span className="lp-live" aria-hidden />
        </div>

        <div className="players">
          <PlayerChip
            name={t('games.you')}
            status={t('games.battle.solvedIn', { count: 3 })}
            avatarUrl={PEOPLE.you.avatar}
            done
          />
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
      </div>
    </Mock>
  );
}

/** The card floating beside the hero phone: where that win puts you this week. */
export function LeagueChipMock(): React.JSX.Element {
  const t = useT();
  return (
    <Mock label={t('landing.mock.leagueLabel')} className="lp-float lp-float--league">
      <span className="lp-float-kicker">{leagueName(t, 'gold')}</span>
      <span className="lp-float-row">
        <span className="lp-rank">#2</span>
        <span className="lp-float-value">298 {t('rankings.unit.xp')}</span>
      </span>
      <span className="lp-float-sub">{t('rankings.board.weeklyXp')}</span>
    </Mock>
  );
}

/** A word, the way a lesson introduces it. */
export function WordCardMock(): React.JSX.Element {
  const t = useT();
  return (
    <Mock label={t('landing.mock.wordLabel')} className="lp-card lp-wordcard">
      <span className="lp-chip">{t('landing.mock.newWord')}</span>
      <Ku className="lp-wordcard-word">{HEVAL}</Ku>
      <span className="lp-wordcard-gloss">{t('landing.gloss.heval')}</span>
    </Mock>
  );
}

/**
 * A battle invite, as it arrives in a chat.
 *
 * Pasting a battle link into a message really does turn into this card — see
 * `GameInviteCard` — so the eyebrow, the title and the button are its words.
 */
export function InviteMock(): React.JSX.Element {
  const t = useT();
  return (
    <Mock label={t('landing.mock.inviteLabel')} className="lp-invitemock">
      <div className="lp-invite-from">
        <Face src={PEOPLE.rojin.avatar} size={28} />
        <span>{PEOPLE.rojin.name}</span>
      </div>
      <div className="invite-card">
        <InviteCardBody
          game={t('games.battle.name')}
          blurb={t('games.invite.blurb.battle')}
          action={t('games.battle.join')}
        />
      </div>
    </Mock>
  );
}

/** This week, among friends — the same rows every leaderboard in the app uses. */
export function FriendsBoardMock(): React.JSX.Element {
  const t = useT();
  const rows = [
    { name: PEOPLE.rojin.name, avatar: PEOPLE.rojin.avatar, xp: 312 },
    { name: t('games.you'), avatar: PEOPLE.you.avatar, xp: 298, you: true },
    { name: PEOPLE.dilan.name, avatar: PEOPLE.dilan.avatar, xp: 240 },
  ];
  return (
    <Mock label={t('landing.mock.boardLabel')} className="lp-boardmock">
      <div className="lp-boardmock-head">
        <span>{t('rankings.board.weeklyXp')}</span>
        <span className="lp-chip">{t('nav.friends')}</span>
      </div>
      <RankList>
        {rows.map((r, i) => (
          <RankRow key={r.name} rank={i + 1} name={r.name} avatarUrl={r.avatar} score={r.xp} me={r.you} lazy />
        ))}
      </RankList>
    </Mock>
  );
}

/* ---- the four games, small ------------------------------------------------ */

/** Wordle's on-screen keyboard: the row with the letters Kurmancî adds. */
export function WordleMini(): React.JSX.Element {
  return (
    <div className="lp-mini lp-mini--wordle" aria-hidden>
      <TileRow word="silav" marks={BATTLE_GUESSES[1]!.marks} />
      <TileRow word={HEVAL} marks={BATTLE_GUESSES[2]!.marks} />
      <div className="lp-keys">
        {KURDISH_LETTERS.map((k) => (
          <span key={k} className="lp-key">
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RhymeMini(): React.JSX.Element {
  const t = useT();
  return (
    <div className="lp-mini lp-mini--rhyme" aria-hidden>
      <span className="lp-float-kicker">{t('games.rhyme.rhymeWith')}</span>
      <Ku className="lp-rhyme-prompt">{RHYME.prompt}</Ku>
      <span className="lp-rhyme-found">
        {RHYME.found.map((w) => (
          <span key={w} className="lp-chip lp-chip--ok" lang="ku">
            {w}
          </span>
        ))}
      </span>
    </div>
  );
}

export function RaceMini(): React.JSX.Element {
  const t = useT();
  return (
    <div className="lp-mini lp-mini--race" aria-hidden>
      <p className="lp-race-text" lang="ku">
        <span className="lp-race-done">{RACE_TEXT.slice(0, RACE_TYPED)}</span>
        <span className="lp-caret" />
        <span>{RACE_TEXT.slice(RACE_TYPED)}</span>
      </p>
      <span className="lp-race-stats">
        <span>
          <b>42</b> {t('games.race.wpm')}
        </span>
        <span>
          <b>98%</b> {t('games.race.accuracy')}
        </span>
      </span>
    </div>
  );
}

const QUIZ_OPTIONS: ReadonlyArray<{ key: MessageKey; right?: boolean }> = [
  { key: 'landing.gloss.tea', right: true },
  { key: 'landing.gloss.milk' },
  { key: 'landing.gloss.coffee' },
];

export function QuizMini(): React.JSX.Element {
  const t = useT();
  return (
    <div className="lp-mini lp-mini--quiz" aria-hidden>
      <span className="lp-quiz-score">
        <Face src={PEOPLE.you.avatar} size={22} />
        <b>3</b>
        <span className="lp-quiz-dash" />
        <b>2</b>
        <Face src={PEOPLE.dilan.avatar} size={22} />
      </span>
      <Ku className="lp-quiz-q">{QUIZ_PROMPT}</Ku>
      <span className="lp-quiz-options">
        {QUIZ_OPTIONS.map((o) => (
          <span key={o.key} className={`lp-option${o.right ? ' is-right' : ''}`}>
            {t(o.key)}
          </span>
        ))}
      </span>
    </div>
  );
}

/* ---- a lesson ------------------------------------------------------------- */

const LESSON_OPTIONS: ReadonlyArray<{ key: MessageKey; right?: boolean }> = [
  { key: 'landing.gloss.whatDay', right: true },
  { key: 'landing.gloss.whatTime' },
  { key: 'landing.gloss.whereYesterday' },
];

/**
 * One exercise from the lesson player: a sentence, a hint on the new word in
 * it, three meanings to choose from, and the answer marked right.
 */
export function LessonMock(): React.JSX.Element {
  const t = useT();
  return (
    <Mock label={t('landing.mock.lessonLabel')} className="lp-phone lp-phone--lesson">
      <div className="lp-phone-screen">
        <div className="lp-lesson-top">
          <CloseIcon size={18} />
          <span className="lp-progress" aria-hidden>
            <span style={{ width: '66%' }} />
          </span>
          <Ku className="lp-lesson-skill">{LESSON.skill}</Ku>
        </div>

        <span className="lp-lesson-prompt">{t('landing.mock.lessonPrompt')}</span>
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

        <div className="lp-lesson-options">
          {LESSON_OPTIONS.map((o) => (
            <span key={o.key} className={`lp-option lp-option--lg${o.right ? ' is-right' : ''}`}>
              {t(o.key)}
              {o.right && <CheckIcon size={16} />}
            </span>
          ))}
        </div>

        <div className="lp-feedback">
          <span className="lp-feedback-text">
            <CheckIcon size={16} />
            {t('landing.mock.correct')}
          </span>
          <span className="lp-fake-btn">{t('landing.mock.continue')}</span>
        </div>
      </div>
    </Mock>
  );
}

/* ---- see it, hear it, say it, use it -------------------------------------- */

/** The four small pictures for the speaking section, one per step. */
export function SpeakVisual({ step }: { step: 'see' | 'hear' | 'say' | 'use' }): React.JSX.Element {
  const t = useT();
  if (step === 'see') {
    return (
      <div className="lp-speak-visual" aria-hidden>
        <Ku className="lp-speak-word">{HEVAL}</Ku>
        <span className="lp-wordcard-gloss">{t('landing.gloss.heval')}</span>
      </div>
    );
  }
  if (step === 'hear') {
    return (
      <div className="lp-speak-visual" aria-hidden>
        <span className="lp-round lp-round--light">
          <PlayIcon size={16} />
        </span>
        <span className="lp-wave">
          {[6, 14, 22, 12, 26, 18, 8, 20, 12, 6].map((h, i) => (
            <span key={i} style={{ height: h }} />
          ))}
        </span>
        <span className="lp-chip">0.75×</span>
      </div>
    );
  }
  if (step === 'say') {
    return (
      <div className="lp-speak-visual" aria-hidden>
        <span className="lp-round lp-round--mic">
          <MicIcon size={20} />
        </span>
        <WaveformIcon size={22} className="lp-speak-faint" />
      </div>
    );
  }
  return (
    <div className="lp-speak-visual" aria-hidden>
      <TileRow word={HEVAL} marks={BATTLE_GUESSES[2]!.marks} />
    </div>
  );
}

/* ---- progress ------------------------------------------------------------- */

/**
 * A profile, a league and a daily reward, stacked the way they sit together in
 * the app: what you look like, where you stand, and what showing up paid.
 */
export function ProgressMock(): React.JSX.Element {
  const t = useT();
  return (
    <Mock label={t('landing.mock.progressLabel')} className="lp-progress-mock">
      <ProfileCard
        name={PEOPLE.dilan.name}
        avatarUrl={PEOPLE.dilan.avatar}
        background={{ sku: 'sample', assetKey: 'sample', type: 'image', url: PROFILE_BACKGROUND }}
        level={{ level: 12, xp: 2860, nextLevelXp: 3000, progress: 0.72 }}
        lazy
      />

      <div className="lp-card lp-laddercard">
        <span className="lp-float-kicker">{t('leagues.endsIn', { time: '2d 4h' })}</span>
        <LeagueLadder tier="gold" />
      </div>

      <div className="zer-card lp-rewardmock">
        <span className="zer-coin">
          <CoinIcon size={18} />
        </span>
        <span className="zer-sub">{t('daily.dayReward', { day: 3, amount: 20 })}</span>
      </div>
    </Mock>
  );
}

/* ---- the community -------------------------------------------------------- */

/** A poem on the wall, with its recording. */
export function PostMock(): React.JSX.Element {
  const t = useT();
  return (
    <Mock label={t('landing.mock.postLabel')} className="lp-card lp-post">
      <div className="lp-post-head">
        <Face src={PEOPLE.dilan.avatar} size={36} />
        <span className="lp-post-who">
          <span className="player-name">{PEOPLE.dilan.name}</span>
          <span className="player-status">{t('civak.kind.poem')}</span>
        </span>
      </div>
      <Ku className="lp-post-title">{POEM.title}</Ku>
      <p className="lp-post-line" lang="ku">
        {POEM.line}
      </p>
      <div className="lp-post-audio">
        <span className="lp-round lp-round--light">
          <PlayIcon size={14} />
        </span>
        <span className="lp-progress">
          <span style={{ width: '35%' }} />
        </span>
        <span className="lp-post-time">0:42</span>
      </div>
      <div className="lp-post-foot">
        <span>
          <HeartIcon size={16} /> 24
        </span>
        <span>
          <CommentIcon size={16} /> 6
        </span>
        <span className="lp-chip">{t('library.audio')}</span>
      </div>
    </Mock>
  );
}
