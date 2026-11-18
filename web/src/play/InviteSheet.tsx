import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  DEFAULT_QUESTION_COUNT,
  DEFAULT_TIMER,
  IMPOSTOR_CLUE_SECONDS,
  IMPOSTOR_DEFAULT_CLUE_SECONDS,
  LAST_LETTER_DEFAULT_TURN_SECONDS,
  LAST_LETTER_TURN_SECONDS,
  MAX_INVITEES_PER_REQUEST,
  QUESTION_COUNTS_BY_LENGTH,
  STORY_LENGTHS,
  TIMER_PRESETS,
  dialectDirection,
  impostorCategoriesInOrder,
  impostorCategoryTone,
  isAllowedQuestionCount,
  meaningIn,
  storyTextDirection,
  type GameDifficulty,
  type ImpostorClueSeconds,
  type LastLetterTurnSeconds,
  type LetterDialect,
  type PlayGame,
  type QuestionCount,
  type StoryLength,
  type TextDuring,
  type TimerSeconds,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { useLocale, useT } from '../i18n/I18nProvider';
import { CategoryArt } from '../impostor/art';
import { categoriesAt, useImpostorCategories } from '../impostor/categories';
import { PictureRadio } from '../impostor/PictureRadio';
import { prefersReducedMotion } from '../lib/motion';
import type { UserSummary } from '../lib/types';
import { dialectName } from '../learn/map';
import { useStoriesAvailable, useStoryList } from '../stories/catalogue';
import { defaultVariety } from '../stories/prefs';
import { LENGTH_KEY, MODE_KEY, minutesLabel, type ChosenStory } from '../stories/SetupSheet';
import { ChipRadio } from './ChipRadio';
import { FriendPicker } from './FriendPicker';
import { AdmitTray, SENT_MS, TicketsSent, flightMs, type Admit } from './InviteTickets';
import { GAME_NAME_KEY, lobbyPath, playError, rememberFriends } from './playApi';
import { usePlayInvites } from './PlayProvider';
import { RatedChoice, useRatedChoice } from '../ranks/rated';
import { offeredDialects, useLastLetterAvailability } from '../lastletter/availability';
import { usePartyOffer, type PartyGame } from '../party/offer';
import { groupDialects, useMpAvailability } from '../games/mpAvailability';
import { TableChoices, type TableOffer } from '../games/partyChoices';

/** What the sheet is opened for. */
export type InviteTarget =
  /** A new game: from a game's page, a profile, a friends row, a DM or a results screen. */
  | { kind: 'new'; game?: PlayGame; friend?: { userId: string; name: string }; story?: ChosenStory }
  /** A new game whose card is posted in a group chat, for its members to join. */
  | { kind: 'group'; groupId: string; groupName: string }
  /** Friends into a lobby already open. */
  | { kind: 'lobby'; game: PlayGame; lobbyId: string; room: number; exclude?: readonly string[] };

type Difficulty = 'easy' | 'medium' | 'hard';
type Dialect = 'kurmanci' | 'sorani';
type StoryMode = 'duo' | 'group';

const DIFFICULTY_KEY = {
  easy: 'games.difficulty.easy',
  medium: 'games.difficulty.medium',
  hard: 'games.difficulty.hard',
} as const;

/** A party game's levels, by the solo games' names for them. */
const PARTY_LEVEL_KEY = {
  beginner: 'games.solo.difficulty.beginner',
  intermediate: 'games.solo.difficulty.intermediate',
  advanced: 'games.solo.difficulty.advanced',
} as const;

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

const RHYME_DIALECTS: readonly Dialect[] = ['kurmanci', 'sorani'];

/**
 * The varieties a Rhyme Match can be made in now (`GET /rhyme/availability`); one without enough prompts is not offered.
 * Both are offered until the server answers, or when it cannot say.
 */
function useRhymeDialects(enabled: boolean): readonly Dialect[] {
  const { client } = useAuth();
  const [open, setOpen] = useState<readonly Dialect[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void client.get<{ dialects?: Partial<Record<Dialect, { available?: boolean }>> }>('/rhyme/availability').then((r) => {
      const dialects = r.ok ? r.data?.dialects : undefined;
      if (!alive || !dialects) return;
      const offered = RHYME_DIALECTS.filter((d) => dialects[d]?.available === true);
      if (offered.length > 0) setOpen(offered);
    });
    return () => {
      alive = false;
    };
  }, [client, enabled]);
  return open ?? RHYME_DIALECTS;
}

/** The sheet's own heading, from what it was opened for. */
function useTitle(target: InviteTarget): string {
  const t = useT();
  if (target.kind === 'lobby') return t('play.invite.friendsTitle');
  if (target.kind === 'group') return t('play.invite.groupTitle', { name: target.groupName });
  return target.friend ? t('play.invite.withTitle', { name: target.friend.name }) : t('play.invite.title');
}

/**
 * "Invite to play": one sheet for every online game from every way in. Pick the game, its presets and friends; creating
 * makes the lobby with you in it, asks them and takes you there. In a group chat the game's card goes to the group
 * instead; into an existing lobby only friends are picked. Portalled, because the chat's game button sits inside the
 * composer's form. Friends picked get tickets that fly off on Send (play/InviteTickets.tsx), and a refusal brings them
 * back.
 */
export function InviteSheet({
  open,
  onClose,
  target,
  lockGame = false,
}: {
  open: boolean;
  onClose: () => void;
  target: InviteTarget;
  /** The page's own game: offer its presets, not a choice of game. */
  lockGame?: boolean;
}): React.JSX.Element | null {
  const title = useTitle(target);
  if (!open) return null;
  return createPortal(
    <Modal open onClose={onClose} label={title}>
      {/* Mounted only while open, so every opening starts from the presets. */}
      <InviteForm target={target} lockGame={lockGame} onDone={onClose} />
    </Modal>,
    document.body,
  );
}

/** The sheet's form, also drawn on a game's own page (Peyvok Battle, Rhyme Match), where making a game and asking friends are one step. */
export function InviteForm({
  target,
  lockGame = false,
  onDone,
  heading = true,
}: {
  target: InviteTarget;
  lockGame?: boolean;
  /** After the invites went out (the sheet closes). */
  onDone?: () => void;
  /** False when the page already says what this is. */
  heading?: boolean;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const navigate = useNavigate();
  const { refresh } = usePlayInvites();
  const title = useTitle(target);
  // Stories is offered once a story is published (asked only when it could be offered).
  const storiesOpen = useStoriesAvailable(!(lockGame || target.kind === 'lobby')) !== 'none';
  // The Last Letter, in the dialects whose dictionary can check words.
  const lastLetterDialects = offeredDialects(
    useLastLetterAvailability(target.kind !== 'lobby' && (!lockGame || (target.kind === 'new' && target.game === 'last-letter'))),
    'group',
  );
  // Impostor, in the varieties and at the levels its approved cards allow.
  const partyAsked = (g: PartyGame) => target.kind !== 'lobby' && (!lockGame || (target.kind === 'new' && target.game === g));
  const impostorOffer = usePartyOffer('impostor', partyAsked('impostor'));
  // Who Am I? with friends, where its content allows (and at which difficulties).
  const askTable = target.kind !== 'lobby' && (!lockGame || (target.kind === 'new' && target.game === 'who-am-i'));
  const tableOffers = useMpAvailability<TableOffer>('who-am-i', askTable);
  // Its choices from its own chips; null until there is something to choose.
  const [partySettings, setPartySettings] = useState<Record<string, unknown> | null>(null);
  const fixedStory = target.kind === 'new' ? (target.story ?? null) : null;
  const gameFixed = lockGame || target.kind === 'lobby';

  const [game, setGame] = useState<PlayGame>(
    target.kind === 'lobby' ? target.game : target.kind === 'new' && target.game ? target.game : 'wordle-battle',
  );
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [dialect, setDialect] = useState<Dialect>(() => fixedStory?.dialect ?? defaultVariety(locale));
  // A friend's invite is a game for two; a group's, for the group.
  const [mode, setMode] = useState<StoryMode>(target.kind === 'group' ? 'group' : 'duo');
  const [length, setLength] = useState<StoryLength>(fixedStory?.length ?? 'short');
  const [count, setCount] = useState<QuestionCount>(DEFAULT_QUESTION_COUNT[fixedStory?.length ?? 'short']);
  // The timer follows the mode until set by hand, as in the game's own setup.
  const [timer, setTimer] = useState<TimerSeconds>(DEFAULT_TIMER[mode]);
  const [timerTouched, setTimerTouched] = useState(false);
  const [text, setText] = useState<TextDuring>('visible');
  const [friends, setFriends] = useState<string[]>(target.kind === 'new' && target.friend ? [target.friend.userId] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The tickets: in the hand, flying or sent, and how many times a hand was refused.
  const [phase, setPhase] = useState<'hand' | 'flying' | 'sent'>('hand');
  const [refusals, setRefusals] = useState(0);
  const [still] = useState(prefersReducedMotion);
  // The friends for their tickets: the picker's list and whoever the sheet was opened for.
  const [known, setKnown] = useState<readonly UserSummary[]>([]);
  const form = useRef<HTMLFormElement>(null);
  // What follows sending (closing, opening the lobby), done once even if the sheet closes first.
  const after = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      const next = after.current;
      after.current = null;
      next?.();
    },
    [],
  );
  // Rated or Friendly: the host's last choice for this game, else Friendly, since every game here is among friends.
  const [rated, setRated] = useRatedChoice(game, false);

  // The lengths a story game can use: those with a published story.
  const { stories } = useStoryList(fixedStory?.dialect ?? dialect, game === 'stories' && !fixedStory);
  const lengths = useMemo(
    () => (fixedStory ? [fixedStory.length] : STORY_LENGTHS.filter((l) => (stories ?? []).some((s) => s.length === l))),
    [stories, fixedStory],
  );
  useEffect(() => {
    if (lengths.length > 0 && !lengths.includes(length)) setLength(lengths[0]!);
  }, [lengths, length]);
  useEffect(() => {
    setCount((c) => (isAllowedQuestionCount(length, c) ? c : DEFAULT_QUESTION_COUNT[length]));
  }, [length]);
  useEffect(() => {
    if (!timerTouched) setTimer(DEFAULT_TIMER[mode]);
  }, [mode]); // The mode alone: a timer set by hand stays as set.

  const games: PlayGame[] = [
    'wordle-battle',
    'rhyme-match',
    ...(storiesOpen || game === 'stories' ? (['stories'] as const) : []),
    ...(lastLetterDialects.length > 0 || game === 'last-letter' ? (['last-letter'] as const) : []),
    ...((impostorOffer ?? []).length > 0 || game === 'impostor' ? (['impostor'] as const) : []),
    ...(groupDialects(tableOffers).length > 0 || game === 'who-am-i' ? (['who-am-i'] as const) : []),
  ];
  // Impostor: an offered variety (the chosen one when it is) and a level offered there.
  const partyOffer = game === 'impostor' ? (impostorOffer ?? []) : [];
  const wanted: LetterDialect = dialect === 'sorani' ? 'ckb' : 'kmr';
  const partyHere = partyOffer.find((o) => o.dialect === wanted) ?? partyOffer[0] ?? null;
  const [partyDifficulty, setPartyDifficulty] = useState<GameDifficulty>('beginner');
  const difficultyNow: GameDifficulty | null = partyHere
    ? partyHere.difficulties.includes(partyDifficulty)
      ? partyDifficulty
      : (partyHere.difficulties[0] ?? null)
    : null;
  const [clueSeconds, setClueSeconds] = useState<ImpostorClueSeconds>(IMPOSTOR_DEFAULT_CLUE_SECONDS);
  // The word may come from one category with enough approved cards at the level, or any.
  const impostorCategories = categoriesAt(useImpostorCategories(game === 'impostor' && target.kind !== 'lobby' ? (partyHere?.dialect ?? null) : null), difficultyNow);
  const [category, setCategory] = useState('');
  const categoryNow = impostorCategories.some((c) => c.slug === category) ? category : '';
  // A Rhyme Match needs a variety with enough prompts: the chosen one when it has them.
  const rhymeDialects = useRhymeDialects(target.kind !== 'lobby' && game === 'rhyme-match');
  const rhymeDialect: Dialect = rhymeDialects.includes(dialect) ? dialect : rhymeDialects[0]!;
  const [turnSeconds, setTurnSeconds] = useState<LastLetterTurnSeconds>(LAST_LETTER_DEFAULT_TURN_SECONDS);
  // A Last Letter lobby uses one dialect the dictionary can check: the chosen one if offered.
  const letterDialect: LetterDialect =
    lastLetterDialects.length > 0 && !lastLetterDialects.includes(dialect === 'sorani' ? 'ckb' : 'kmr')
      ? lastLetterDialects[0]!
      : dialect === 'sorani'
        ? 'ckb'
        : 'kmr';
  const max =
    target.kind === 'lobby'
      ? Math.max(0, Math.min(MAX_INVITEES_PER_REQUEST, target.room))
      : game === 'stories' && mode === 'duo'
        ? 1
        : MAX_INVITEES_PER_REQUEST;
  // A game for two keeps the friend chosen last.
  useEffect(() => {
    setFriends((f) => (f.length > max ? f.slice(-max) : f));
  }, [max]);

  const storyReady = (game !== 'stories' || lengths.length > 0) && (game !== 'impostor' || target.kind === 'lobby' || partyHere !== null);
  // A Who Am I? table needs something its content can be played with.
  const partyReady = target.kind === 'lobby' || game !== 'who-am-i' || partySettings !== null;

  function settings(): Record<string, unknown> {
    switch (game) {
      case 'wordle-battle':
        return { difficulty, rated };
      case 'rhyme-match':
        return { dialect: rhymeDialect, rated };
      case 'last-letter':
        return { dialect: letterDialect, turnSeconds, rated };
      case 'impostor':
        return { dialect: partyHere?.dialect ?? wanted, difficulty: difficultyNow ?? 'beginner', clueSeconds, category: categoryNow || null, rated };
      case 'who-am-i':
        return { ...(partySettings ?? {}), rated };
      case 'stories':
        return {
          mode,
          ...(fixedStory ? { storyId: fixedStory.id } : { dialect, length }),
          questionCount: count,
          timerSeconds: timer,
          textDuring: text,
          access: 'friends',
          rated,
        };
    }
  }

  const groupName = target.kind === 'group' ? target.groupName : null;
  const admits: Admit[] =
    target.kind === 'group'
      ? []
      : friends.map((id) => {
          const f = known.find((k) => k.userId === id);
          const name = f ? f.displayName || f.username : target.kind === 'new' && target.friend?.userId === id ? target.friend.name : '';
          return { id, name, avatarUrl: f?.avatarUrl ?? null };
        });
  const handing = groupName !== null || admits.length > 0;

  /** Sends the invites (or makes the game) while the tickets fly; a refusal brings them back, a yes closes the sheet or opens the lobby. */
  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    const flight = still || groupName !== null ? 0 : flightMs(admits.length);
    if (flight > 0) setPhase('flying');
    const began = Date.now();
    const res =
      target.kind === 'lobby'
        ? await client.post<{ game?: PlayGame; lobbyId?: string; invited: number }>('/play/invites', {
            game: target.game,
            lobbyId: target.lobbyId,
            userIds: friends,
          })
        : await client.post<{ game?: PlayGame; lobbyId?: string; invited: number }>('/play/lobbies', {
            game,
            settings: settings(),
            // Each friend asked gets the game's card in your conversation with them.
            ...(target.kind === 'group' ? { chat: { groupId: target.groupId } } : friends.length > 0 ? { invite: friends } : {}),
          });
    const left = flight - (Date.now() - began);
    if (left > 0) await wait(left);
    setBusy(false);
    if (!res.ok) {
      setPhase('hand');
      if (flight > 0) setRefusals((n) => n + 1);
      setError(playError(res.error, t));
      return;
    }
    rememberFriends(friends);
    refresh();
    const made = res.data;
    const next = (): void => {
      onDone?.();
      if (target.kind !== 'lobby' && made.game && made.lobbyId) navigate(lobbyPath(made.game, made.lobbyId));
    };
    if (!handing) return next();
    setPhase('sent');
    after.current = next;
    await wait(SENT_MS);
    const pending = after.current;
    after.current = null;
    pending?.();
  }

  const submitLabel =
    target.kind === 'lobby'
      ? t('play.invite.send')
      : target.kind === 'group'
        ? t('play.invite.postToGroup')
        : friends.length > 0
          ? t('play.invite.createAndInvite', { count: friends.length })
          : t('play.invite.create');
  const storyDir = fixedStory ? storyTextDirection(fixedStory.dialect) : null;

  if (phase === 'sent') {
    return (
      <div className="invite-sheet is-sent">
        <TicketsSent game={game} people={admits} group={groupName} />
      </div>
    );
  }

  return (
    <form
      ref={form}
      className="invite-sheet"
      onSubmit={(e) => {
        e.preventDefault();
        // The chat composer is this form's parent in React's tree despite the portal, and would send the typed message.
        e.stopPropagation();
        if (!busy) void submit();
      }}
    >
      {heading && <h2 className="story-setup-title">{title}</h2>}

      {!gameFixed && (
        <ChipRadio
          label={t('play.invite.game')}
          value={game}
          onChange={setGame}
          options={games.map((g) => ({ value: g, label: t(GAME_NAME_KEY[g]) }))}
        />
      )}

      {target.kind !== 'lobby' && game === 'wordle-battle' && (
        <ChipRadio
          label={t('games.difficulty')}
          value={difficulty}
          onChange={setDifficulty}
          options={(['easy', 'medium', 'hard'] as const).map((d) => ({ value: d, label: t(DIFFICULTY_KEY[d]) }))}
        />
      )}

      {target.kind !== 'lobby' && game === 'rhyme-match' && rhymeDialects.length > 1 && (
        <ChipRadio
          label={t('games.dialect')}
          value={rhymeDialect}
          onChange={setDialect}
          options={rhymeDialects.map((d) => ({ value: d, label: dialectName(d) }))}
        />
      )}

      {target.kind !== 'lobby' && game === 'last-letter' && (
        <>
          {lastLetterDialects.length > 1 && (
            <ChipRadio
              label={t('games.dialect')}
              value={letterDialect}
              onChange={(d) => setDialect(d === 'ckb' ? 'sorani' : 'kurmanci')}
              options={lastLetterDialects.map((d) => ({ value: d, label: dialectName(d === 'ckb' ? 'sorani' : 'kurmanci') }))}
            />
          )}
          <ChipRadio
            label={t('games.lastLetter.turnTime')}
            value={turnSeconds}
            onChange={setTurnSeconds}
            options={LAST_LETTER_TURN_SECONDS.map((sec) => ({ value: sec, label: t('games.lastLetter.seconds', { count: sec }) }))}
          />
        </>
      )}

      {target.kind !== 'lobby' && game === 'impostor' && partyHere && (
        <>
          {partyOffer.length > 1 && (
            <ChipRadio
              label={t('games.dialect')}
              value={partyHere.dialect}
              onChange={(d) => setDialect(d === 'ckb' ? 'sorani' : 'kurmanci')}
              options={partyOffer.map((o) => ({ value: o.dialect, label: dialectName(o.dialect === 'ckb' ? 'sorani' : 'kurmanci') }))}
            />
          )}
          {difficultyNow && (
            <ChipRadio
              label={t('games.party.level')}
              value={difficultyNow}
              onChange={setPartyDifficulty}
              options={partyHere.difficulties.map((d) => ({ value: d, label: t(PARTY_LEVEL_KEY[d]) }))}
            />
          )}
          {impostorCategories.length > 0 && (
            <PictureRadio
              label={t('games.impostor.category')}
              layout="strip"
              value={categoryNow}
              onChange={setCategory}
              options={[
                { value: '', label: t('games.couch.anyCategory'), art: <CategoryArt category={null} size={48} />, tone: impostorCategoryTone(null) },
                ...impostorCategoriesInOrder(impostorCategories).map((c) => ({
                  value: c.slug,
                  label: c.ku,
                  hint: meaningIn(c.meanings, locale) ?? undefined,
                  lang: dialectDirection(partyHere.dialect).lang,
                  art: <CategoryArt category={c.slug} size={48} />,
                  tone: impostorCategoryTone(c.slug),
                })),
              ]}
            />
          )}
          <ChipRadio
            label={t('games.impostor.clueTime')}
            value={clueSeconds}
            onChange={setClueSeconds}
            options={IMPOSTOR_CLUE_SECONDS.map((sec) => ({ value: sec, label: t('games.party.seconds', { count: sec }) }))}
          />
        </>
      )}

      {target.kind !== 'lobby' && game === 'who-am-i' && (
        <TableChoices offers={tableOffers ?? []} preferred={dialect === 'sorani' ? 'ckb' : 'kmr'} onChange={setPartySettings} />
      )}

      {target.kind !== 'lobby' && game === 'stories' && (
        <>
          {target.kind === 'new' && (
            <ChipRadio
              label={t('stories.setup.mode')}
              value={mode}
              onChange={setMode}
              options={(['duo', 'group'] as const).map((m) => ({ value: m, label: t(MODE_KEY[m]) }))}
            />
          )}
          {fixedStory ? (
            <div className="story-setup-fixed">
              <span className="chip-radio-legend">{t('stories.setup.story')}</span>
              <p className="story-setup-story">
                <span lang={storyDir?.lang} dir={storyDir?.dir}>
                  {fixedStory.title}
                </span>
                <span className="muted">
                  {t(LENGTH_KEY[fixedStory.length])} · {minutesLabel(fixedStory.dialect, fixedStory.length, t)}
                </span>
              </p>
            </div>
          ) : (
            <>
              <ChipRadio
                label={t('stories.variety')}
                value={dialect}
                onChange={setDialect}
                options={(['kurmanci', 'sorani'] as const).map((d) => ({ value: d, label: dialectName(d) }))}
              />
              {stories !== null && lengths.length === 0 ? (
                <p className="story-setup-note">{t('play.invite.noStories')}</p>
              ) : (
                <ChipRadio
                  label={t('stories.length')}
                  value={length}
                  onChange={setLength}
                  options={lengths.map((l) => ({ value: l, label: t(LENGTH_KEY[l]), hint: minutesLabel(dialect, l, t) }))}
                />
              )}
            </>
          )}
          {storyReady && (
            <ChipRadio
              label={t('stories.setup.questions')}
              value={count}
              onChange={setCount}
              options={QUESTION_COUNTS_BY_LENGTH[length].map((n) => ({ value: n, label: t('stories.setup.questionCount', { count: n }) }))}
            />
          )}
          <ChipRadio
            label={t('stories.setup.timer')}
            value={timer}
            onChange={(v) => {
              setTimerTouched(true);
              setTimer(v);
            }}
            options={TIMER_PRESETS.map((sec) => ({
              value: sec,
              label: sec === 0 ? t('stories.setup.timerOff') : t('stories.setup.timerSeconds', { seconds: sec }),
            }))}
          />
          <ChipRadio
            label={t('stories.setup.text')}
            value={text}
            onChange={setText}
            options={[
              { value: 'visible' as const, label: t('stories.setup.textVisible') },
              { value: 'hidden' as const, label: t('stories.setup.textHidden') },
            ]}
          />
          {text === 'hidden' && <p className="story-setup-note">{t('stories.setup.textHiddenHint')}</p>}
        </>
      )}

      {target.kind !== 'lobby' && <RatedChoice value={rated} onChange={setRated} />}

      {target.kind === 'group' ? (
        <p className="story-setup-note">{t('play.invite.groupNote')}</p>
      ) : (
        <FriendPicker
          selected={friends}
          onChange={setFriends}
          max={max}
          exclude={target.kind === 'lobby' ? target.exclude : undefined}
          tone={game}
          onFriends={setKnown}
        />
      )}

      {error && (
        <p className="msg msg-error" role="alert">
          {error}
        </p>
      )}
      <div className="story-setup-submit">
        <AdmitTray game={game} people={admits} group={groupName} flying={phase === 'flying'} back={refusals} scope={form} />
        <Button
          type="submit"
          size="lg"
          block
          disabled={busy || !storyReady || !partyReady || (target.kind === 'lobby' && friends.length === 0)}
        >
          {busy ? t('play.invite.sending') : submitLabel}
        </Button>
      </div>
    </form>
  );
}
