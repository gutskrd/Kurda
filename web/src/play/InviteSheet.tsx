import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  DEFAULT_QUESTION_COUNT,
  DEFAULT_TIMER,
  MAX_INVITEES_PER_REQUEST,
  QUESTION_COUNTS_BY_LENGTH,
  STORY_LENGTHS,
  TIMER_PRESETS,
  isAllowedQuestionCount,
  storyTextDirection,
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
import { dialectName } from '../learn/map';
import { useStoriesAvailable, useStoryList } from '../stories/catalogue';
import { defaultVariety } from '../stories/prefs';
import { LENGTH_KEY, MODE_KEY, minutesLabel, type ChosenStory } from '../stories/SetupSheet';
import { ChipRadio } from './ChipRadio';
import { FriendPicker } from './FriendPicker';
import { GAME_NAME_KEY, lobbyPath, playError, rememberFriends } from './playApi';
import { usePlayInvites } from './PlayProvider';
import { RatedChoice, useRatedChoice } from '../ranks/rated';

/** What the sheet is opened for. */
export type InviteTarget =
  /** a new game: from a game's page, a profile, a friends row, a DM, a results screen */
  | { kind: 'new'; game?: PlayGame; friend?: { userId: string; name: string }; story?: ChosenStory }
  /** a new game whose card is posted in a group chat: its members join from there */
  | { kind: 'group'; groupId: string; groupName: string }
  /** friends into a lobby that is already open */
  | { kind: 'lobby'; game: PlayGame; lobbyId: string; room: number; exclude?: readonly string[] };

type Difficulty = 'easy' | 'medium' | 'hard';
type Dialect = 'kurmanci' | 'sorani';
type StoryMode = 'duo' | 'group';

const DIFFICULTY_KEY = {
  easy: 'games.difficulty.easy',
  medium: 'games.difficulty.medium',
  hard: 'games.difficulty.hard',
} as const;

/** The sheet's own heading, from what it was opened for. */
function useTitle(target: InviteTarget): string {
  const t = useT();
  if (target.kind === 'lobby') return t('play.invite.friendsTitle');
  if (target.kind === 'group') return t('play.invite.groupTitle', { name: target.groupName });
  return target.friend ? t('play.invite.withTitle', { name: target.friend.name }) : t('play.invite.title');
}

/**
 * "Invite to play" (contract §B1): one sheet for every online game and every
 * way in — a game's page, a friend's profile, the friends list, a chat, the
 * results of a game, a lobby. The game, its presets (radio chips, nothing to
 * type), and the friends to ask; creating makes the lobby with you in it,
 * asks them, and takes you there.
 *
 * In a group chat nobody is picked: the game's card goes to the group, and
 * its members join from the card. Into a lobby that already exists, only the
 * friends are asked for.
 *
 * Drawn over the page through a portal: the chat's game button sits inside
 * the composer's form, and a form inside a form is not a form.
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
  /** the game is the page's own: offer its presets, not a choice of game */
  lockGame?: boolean;
}): React.JSX.Element | null {
  const title = useTitle(target);
  if (!open) return null;
  return createPortal(
    <Modal open onClose={onClose} label={title}>
      {/* mounted only while open, so every opening starts from the presets */}
      <InviteForm target={target} lockGame={lockGame} onDone={onClose} />
    </Modal>,
    document.body,
  );
}

/**
 * The sheet's form, also drawn in place on a game's own page (Peyvok Battle,
 * Rhyme Match), where "make a game" and "ask friends" are the same step.
 */
export function InviteForm({
  target,
  lockGame = false,
  onDone,
  heading = true,
}: {
  target: InviteTarget;
  lockGame?: boolean;
  /** after the invites went out (the sheet closes) */
  onDone?: () => void;
  /** the page already says what this is: no heading of its own */
  heading?: boolean;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const navigate = useNavigate();
  const { refresh } = usePlayInvites();
  const title = useTitle(target);
  // Stories is offered once a story is published (asked only when it could be offered)
  const storiesOpen = useStoriesAvailable(!(lockGame || target.kind === 'lobby')) !== 'none';
  const fixedStory = target.kind === 'new' ? (target.story ?? null) : null;
  const gameFixed = lockGame || target.kind === 'lobby';

  const [game, setGame] = useState<PlayGame>(
    target.kind === 'lobby' ? target.game : target.kind === 'new' && target.game ? target.game : 'wordle-battle',
  );
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [dialect, setDialect] = useState<Dialect>(() => fixedStory?.dialect ?? defaultVariety(locale));
  // a friend's invite is a game for two; a group's, for the group
  const [mode, setMode] = useState<StoryMode>(target.kind === 'group' ? 'group' : 'duo');
  const [length, setLength] = useState<StoryLength>(fixedStory?.length ?? 'short');
  const [count, setCount] = useState<QuestionCount>(DEFAULT_QUESTION_COUNT[fixedStory?.length ?? 'short']);
  // the timer follows the mode until it is set by hand, as in the game's own setup
  const [timer, setTimer] = useState<TimerSeconds>(DEFAULT_TIMER[mode]);
  const [timerTouched, setTimerTouched] = useState(false);
  const [text, setText] = useState<TextDuring>('visible');
  const [friends, setFriends] = useState<string[]>(target.kind === 'new' && target.friend ? [target.friend.userId] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rated or Friendly (Game Ranks): the host's last choice for this game, else
  // Friendly — every game made here is among friends or in a chat
  const [rated, setRated] = useRatedChoice(game, false);

  // the lengths a story game can be made with: those with a published story
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
  }, [mode]); // the mode alone: a timer set by hand stays as set

  const games: PlayGame[] = ['wordle-battle', 'rhyme-match', ...(storiesOpen || game === 'stories' ? (['stories'] as const) : [])];
  const max =
    target.kind === 'lobby'
      ? Math.max(0, Math.min(MAX_INVITEES_PER_REQUEST, target.room))
      : game === 'stories' && mode === 'duo'
        ? 1
        : MAX_INVITEES_PER_REQUEST;
  // a game for two keeps the one friend chosen last
  useEffect(() => {
    setFriends((f) => (f.length > max ? f.slice(-max) : f));
  }, [max]);

  const storyReady = game !== 'stories' || lengths.length > 0;

  function settings(): Record<string, unknown> {
    switch (game) {
      case 'wordle-battle':
        return { difficulty, rated };
      case 'rhyme-match':
        return { dialect, rated };
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

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    if (target.kind === 'lobby') {
      const res = await client.post<{ ok: true; invited: number }>('/play/invites', {
        game: target.game,
        lobbyId: target.lobbyId,
        userIds: friends,
      });
      setBusy(false);
      if (!res.ok) return setError(playError(res.error, t));
      rememberFriends(friends);
      refresh();
      onDone?.();
      return;
    }
    const res = await client.post<{ game: PlayGame; lobbyId: string; invited: number }>('/play/lobbies', {
      game,
      settings: settings(),
      // every friend asked gets the game's card in your conversation with
      // them, so an invite from a DM lands in that DM like any other
      ...(target.kind === 'group' ? { chat: { groupId: target.groupId } } : friends.length > 0 ? { invite: friends } : {}),
    });
    setBusy(false);
    if (!res.ok) return setError(playError(res.error, t));
    rememberFriends(friends);
    refresh();
    onDone?.();
    navigate(lobbyPath(res.data.game, res.data.lobbyId));
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

  return (
    <form
      className="invite-sheet"
      onSubmit={(e) => {
        e.preventDefault();
        // the chat's composer is this form's parent in React's tree, portal
        // or not: its own submit would send whatever is typed in the chat
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

      {target.kind !== 'lobby' && game === 'rhyme-match' && (
        <ChipRadio
          label={t('games.dialect')}
          value={dialect}
          onChange={setDialect}
          options={(['kurmanci', 'sorani'] as const).map((d) => ({ value: d, label: dialectName(d) }))}
        />
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
        <FriendPicker selected={friends} onChange={setFriends} max={max} exclude={target.kind === 'lobby' ? target.exclude : undefined} />
      )}

      {error && (
        <p className="msg msg-error" role="alert">
          {error}
        </p>
      )}
      <div className="story-setup-submit">
        <Button
          type="submit"
          size="lg"
          block
          disabled={busy || !storyReady || (target.kind === 'lobby' && friends.length === 0)}
        >
          {busy ? t('play.invite.sending') : submitLabel}
        </Button>
      </div>
    </form>
  );
}
