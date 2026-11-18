import type { CSSProperties, ReactNode } from 'react';
import { useT } from '../i18n/I18nProvider';
import { CheckIcon, CoinIcon, CommentIcon, HeadphonesIcon, HeartIcon, PlayIcon } from '../components/icons';
import { ProfileCard } from '../ui/ProfileCard';
import { LeagueLadder } from '../ui/LeagueLadder';
import { leagueName } from '../ranks/names';
import { RankList, RankRow } from '../ui/RankRow';
import { InviteCardBody } from '../ui/InviteCardBody';
import { ticketClass } from '../ui/Ticket';
import { useAvatarSrc } from '../art/overrides';
import {
  BATTLE_GUESSES,
  HEVAL,
  KURDISH_LETTERS,
  PEOPLE,
  POEM,
  PROFILE_BACKGROUND,
  RACE_TEXT,
  RACE_TYPED,
  RHYME,
} from './samples';

/**
 * The landing page's pictures of the product, built from the app's own parts as markup rather than screenshots: small,
 * sharp at any size, and in the reader's language. Labels reuse the app's catalogue keys, and the Kurdish comes from
 * `samples.ts`. Each is one `role="img"` with a describing sentence, and nothing inside is focusable or clickable.
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
  // A default deer an admin replaced shows its new picture, as in the app.
  const face = useAvatarSrc(src) ?? src;
  return (
    <img
      className="lp-face"
      src={face}
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

/** A Peyvok row in the game's colours; `--i` staggers the tiles so the stylesheet can flip them in order. */
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

/** The card floating beside the hero phone: where that win puts you this week. */
export function LeagueChipMock(): React.JSX.Element {
  const t = useT();
  return (
    <Mock label={t('landing.mock.leagueLabel')} className="lp-float lp-float--league">
      <span className="lp-float-kicker">{leagueName(t, 'cem')}</span>
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

/** A battle invite as it arrives in a chat, using `GameInviteCard`'s words. */
export function InviteMock(): React.JSX.Element {
  const t = useT();
  return (
    <Mock label={t('landing.mock.inviteLabel')} className="lp-invitemock">
      <div className="lp-invite-from">
        <Face src={PEOPLE.rojin.avatar} size={28} />
        <span>{PEOPLE.rojin.name}</span>
      </div>
      <div className={ticketClass('wordle-battle', 'row', 'invite-card')}>
        <InviteCardBody
          type="wordle-battle"
          game={t('games.battle.name')}
          blurb={t('games.invite.blurb.battle')}
          action={t('games.battle.join')}
        />
      </div>
    </Mock>
  );
}

/** This week among friends, in the same rows as every leaderboard. */
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

/* ---- The four games, small ------------------------------------------------ */

/** Peyvok's on-screen keyboard: the row with the letters Kurmancî adds. */
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

/**
 * A story being read: placeholder lines, one glossary word with its meaning, the read-aloud headphones and a quiz
 * answer, without inventing Kurdish sentences for the picture.
 */
export function StoriesMini(): React.JSX.Element {
  const t = useT();
  return (
    <div className="lp-mini lp-mini--stories" aria-hidden>
      <span className="lp-story-page">
        <span className="lp-story-bar" style={{ width: '88%' }} />
        <span className="lp-story-row">
          <span className="lp-story-bar" style={{ width: '34%' }} />
          <Ku className="lp-story-word">{HEVAL}</Ku>
          <span className="lp-story-bar" style={{ width: '26%' }} />
        </span>
        <span className="lp-story-bar" style={{ width: '72%' }} />
        <span className="lp-story-gloss">
          <Ku>{HEVAL}</Ku> · {t('landing.gloss.heval')}
        </span>
      </span>
      <span className="lp-story-foot">
        <span className="lp-story-listen">
          <HeadphonesIcon size={13} />
        </span>
        <span className="lp-option is-right">
          <CheckIcon size={12} /> 3/3
        </span>
      </span>
    </div>
  );
}

/* ---- Progress ------------------------------------------------------------- */

/** A profile, a league and a daily reward, stacked as they sit in the app. */
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
        <span className="lp-float-kicker">{leagueName(t, 'cem')}</span>
        <LeagueLadder tier="cem" />
      </div>

      <div className="zer-card lp-rewardmock">
        <span className="zer-coin">
          <CoinIcon size={36} />
        </span>
        <span className="zer-sub">{t('daily.dayReward', { day: 3, amount: 20 })}</span>
      </div>
    </Mock>
  );
}

/* ---- The community -------------------------------------------------------- */

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
