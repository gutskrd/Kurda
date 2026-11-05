import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import {
  IMPOSTOR_CLUE_SECONDS,
  IMPOSTOR_DEFAULT_CLUE_SECONDS,
  MAX_INVITEES_PER_REQUEST,
  PLAY_GAMES,
  STORY_DIALECTS,
  type GameDialect,
  type GameDifficulty,
  type InviteLists,
  type PlayGame,
  type StoryDialect,
  type StoryListItem,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError, type Translate } from '../api/errors';
import type { ApiError } from '../api/types';
import type { RootNavigation } from '../navigation/rootStack';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { ClayButton, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { listStories } from '../stories/api';
import { DIALECT_NAME } from '../stories/labels';
import { StoryPresetFields, useCanHostOpen } from '../stories/SetupSheet';
import { changeSetup, initialSetup, inviteSettings, type SetupState } from '../stories/setup';
import { useStoryPrefs } from '../stories/prefs';
import { Note, SectionLabel, Sheet } from '../stories/ui';
import { createLobby, inviteFriends, listFriends, listInvites, type FriendSummary } from './api';
import { GAME_ICON, GAME_NAME_KEY } from './labels';
import { lobbyRoute } from './routes';
import { PickedTickets, SentFan, flightMs, type SendPhase, type TicketHolder } from './SentTickets';
import { SendErrorNotice } from '../reports/SendError';
import { RatedChoice } from '../ranks/Rated';
import { useRatedChoice } from '../ranks/ratedPrefs';
import { restrictionOf } from '../reports/sendErrors';
import { SearchField } from '../theme/SearchField';
import { offeredDialects, useLastLetterAvailability } from '../lastletter/availability';
import { usePartyOffer } from '../party/offer';
import { PARTY_LEVEL_KEY } from '../party/PartyStart';
import { groupDialects, useMpAvailability } from '../games/mpAvailability';
import { BluffChoices, RaceChoices } from '../games/partyChoices';

type Difficulty = 'easy' | 'medium' | 'hard';
const DIFFICULTY_KEY: Record<Difficulty, TranslationKey> = {
  easy: 'games.difficulty.easy',
  medium: 'games.difficulty.medium',
  hard: 'games.difficulty.hard',
};

/** Where the sheet was opened from, which decides what it makes and where a card goes. */
export type InviteTarget =
  /** a new game: from a profile, the friends list, a game page, a results screen */
  | { kind: 'new'; game?: PlayGame; friendId?: string }
  /** a new game from a DM: that friend is invited, and the card goes in the DM */
  | { kind: 'dm'; friendId: string }
  /** a new game from a group chat: its card goes in the group, friends may be asked too */
  | { kind: 'group'; groupId: string }
  /** more friends into a lobby that exists */
  | { kind: 'lobby'; game: PlayGame; lobbyId: string; mode?: 'duo' | 'group' };

/**
 * Friends who came into one of your games lately, newest first: the invites
 * they accepted. An invite that was turned down or ran out is not "played
 * with", so it does not put anybody at the top.
 */
export function recentPlayers(lists: InviteLists): string[] {
  return lists.outgoing.flatMap((o) => o.invitees.filter((i) => i.status === 'accepted').map((i) => i.userId));
}

/** Friends shown first: the ones played with most recently, newest first, then everyone by name. */
export function orderFriends(friends: readonly FriendSummary[], recentIds: readonly string[], query: string): {
  recent: FriendSummary[];
  rest: FriendSummary[];
} {
  const q = query.trim().toLowerCase();
  const match = (f: FriendSummary) =>
    !q || f.username.toLowerCase().includes(q) || (f.displayName ?? '').toLowerCase().includes(q);
  const byId = new Map(friends.map((f) => [f.userId, f]));
  const recent = [...new Set(recentIds)].map((id) => byId.get(id)).filter((f): f is FriendSummary => !!f && match(f)).slice(0, 5);
  const shown = new Set(recent.map((f) => f.userId));
  const rest = friends
    .filter((f) => !shown.has(f.userId) && match(f))
    .sort((a, b) => Number(b.online) - Number(a.online) || (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username));
  return { recent, rest };
}

function inviteError(error: ApiError, t: Translate): string {
  if (error.code === 'OPEN_GAMES_ADULTS_ONLY' || error.code === 'OPEN_NOT_ALLOWED') return t('stories.error.openNotAllowed');
  if (error.code === 'EMPTY_POOL' || error.code === 'EMPTY_LEXICON') return t('games.emptyPool');
  if (error.code === 'NO_STORY') return t('stories.error.noStory');
  if (error.code === 'TOO_MANY_GAMES') return t('stories.error.tooManyGames');
  return describeError(error, t);
}

/**
 * What the sent tickets say: the one friend by name, how many otherwise, and
 * a game posted in a group with nobody else asked as posted there.
 */
export function sentText(going: readonly TicketHolder[], invited: number, t: Translate): string {
  const friends = going.filter((h) => !h.group);
  if (invited === 0 && going.some((h) => h.group)) return t('play.sheet.posted');
  if (invited === 1 && friends.length === 1) return t('play.sheet.sentTo', { name: friends[0]!.name });
  return t('play.sheet.sent', { count: invited });
}

/** How long "sent" stays on a sheet that closes into the new game's lobby, to be seen before it goes. */
const SENT_HOLD_MS = 900;

/**
 * "Invite to play" (contract §B1): every place a game with friends starts —
 * a friend's profile, the friends list, the chat composer, a game's lobby,
 * the end of a game — opens this one sheet: the game, its presets, and
 * friends to ask (search, the ones played with lately first, who is online).
 *
 * Making the game puts the host in its lobby and invites the friends picked;
 * from a chat the game's card is posted in that chat. Inviting more people
 * into a lobby that exists skips the game and its presets.
 *
 * Each friend picked is a ticket written out for them, and Send hands them
 * over (SentTickets.tsx): they fly off, the sheet says who they went to, and
 * then it closes into the lobby — or, in a lobby, stays for more.
 */
export function InviteSheet({ target, onClose }: { target: InviteTarget; onClose: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const { prefs } = useStoryPrefs();
  const canHostOpen = useCanHostOpen();

  const fixedGame = target.kind === 'lobby' ? target.game : target.kind === 'new' ? target.game : undefined;
  const [game, setGame] = useState<PlayGame>(fixedGame ?? 'stories');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [dialect, setDialect] = useState<StoryDialect>(locale === 'ckb' ? 'sorani' : (prefs.dialect ?? 'kurmanci'));
  // The Last Letter, in the dialects whose dictionary can check players' words (asked only where it could be offered)
  const letterDialects = offeredDialects(useLastLetterAvailability(target.kind !== 'lobby'), 'group');
  // the party games, in the varieties and at the levels their approved cards allow
  const impostorOffer = usePartyOffer('impostor', target.kind !== 'lobby') ?? [];
  const dontSayOffer = usePartyOffer('dont-say', target.kind !== 'lobby') ?? [];
  // Kurdish Bluff and the Who Am I? race, where their content lets them be played
  const bluffOffers = useMpAvailability('bluff', target.kind !== 'lobby');
  const raceOffers = useMpAvailability('who-am-i', target.kind !== 'lobby');
  const offeredGames = PLAY_GAMES.filter(
    (g) =>
      fixedGame === g ||
      ((g !== 'last-letter' || letterDialects.length > 0) &&
        (g !== 'impostor' || impostorOffer.length > 0) &&
        (g !== 'dont-say' || dontSayOffer.length > 0) &&
        (g !== 'bluff' || groupDialects(bluffOffers).length > 0) &&
        (g !== 'who-am-i' || groupDialects(raceOffers).length > 0)),
  );
  const [partyLevel, setPartyLevel] = useState<GameDifficulty>('beginner');
  const [clueSeconds, setClueSeconds] = useState<string>(String(IMPOSTOR_DEFAULT_CLUE_SECONDS));
  // Bluff's and the race's choices, handed up by their own fields; null when the game cannot be made in the Kurdish chosen
  const [partySettings, setPartySettings] = useState<Record<string, unknown> | null>(null);
  const [stories, setStories] = useState<StoryListItem[]>([]);
  const [story, setStory] = useState<SetupState>(() => initialSetup({ mode: 'duo', dialect, length: 'short' }));
  const [friends, setFriends] = useState<FriendSummary[] | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const preselected = target.kind === 'dm' ? target.friendId : target.kind === 'new' ? target.friendId : undefined;
  /*
   * From a DM the game is with that friend: the server invites them (and
   * posts the card in the DM) from `chat`, whatever else is picked, so the
   * sheet keeps them picked rather than show a choice it would not honour.
   */
  const lockedId = target.kind === 'dm' ? target.friendId : null;
  const [picked, setPicked] = useState<string[]>(preselected ? [preselected] : []);
  // Rated or Friendly for the game being made, where the host last left it for that game
  const [rated, setRated] = useRatedChoice(game);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** a limit on the account (a chat mute stops game cards too): said as every send path says it, with Account standing */
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const refused = (e: ApiError): void => {
    if (restrictionOf(e)) setRefusal(e);
    else setError(inviteError(e, t));
  };
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<SendPhase>('picking');
  const [refusals, setRefusals] = useState(0);
  /** the tickets just handed over, and what they say */
  const [sent, setSent] = useState<{ holders: TicketHolder[]; text: string } | null>(null);
  /*
   * What waits for the tickets to fly. Going to a new game's lobby is never
   * dropped: a sheet closed while "sent" is still showing goes there at once.
   */
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const goToLobby = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      goToLobby.current?.();
    },
    [],
  );
  const after = (ms: number, then: () => void): void => {
    if (ms <= 0) then();
    else timers.current.push(setTimeout(then, ms));
  };

  // a duo (and a battle or a match for two) invites one friend; a group up to seven
  const single = target.kind === 'lobby' ? target.mode === 'duo' : game === 'stories' && story.mode === 'duo';
  const limit = single ? 1 : MAX_INVITEES_PER_REQUEST;

  useEffect(() => {
    let live = true;
    void listFriends(client).then((res) => {
      if (live) setFriends(res.ok ? res.data.friends : []);
    });
    void listInvites(client).then((res) => {
      if (live && res.ok) setRecentIds(recentPlayers(res.data));
    });
    return () => {
      live = false;
    };
  }, [client]);

  // the variety's published stories, for the lengths and the pick list
  useEffect(() => {
    if (game !== 'stories' || target.kind === 'lobby') return;
    let live = true;
    void listStories(client, { dialect }).then((res) => {
      if (!live || !res.ok) return;
      setStories(res.data.stories);
      const lengths = new Set(res.data.stories.map((s) => s.length));
      setStory((s) => {
        const base = { ...s, dialect, storyId: null };
        return lengths.has(s.length) ? base : changeSetup(base, { length: (['short', 'medium', 'long'] as const).find((l) => lengths.has(l)) ?? 'short' });
      });
    });
    return () => {
      live = false;
    };
  }, [client, game, dialect, target.kind]);

  const others = useMemo(() => (friends ?? []).filter((f) => f.userId !== lockedId), [friends, lockedId]);
  const lockedFriend = lockedId ? (friends ?? []).find((f) => f.userId === lockedId) : undefined;
  const { recent, rest } = useMemo(() => orderFriends(others, recentIds, query), [others, recentIds, query]);
  // a game for two from a DM is with that friend, and nobody else is offered
  const offerOthers = !(lockedId && single);

  const toggle = (id: string): void => {
    if (id === lockedId || phase !== 'picking') return;
    // picking again after a send starts the next tickets
    setSent(null);
    setPicked((list) => {
      if (list.includes(id)) return list.filter((x) => x !== id);
      if (single) return [id];
      return list.length >= limit ? list : [...list, id];
    });
  };

  /** A party game's lobby: a variety it is offered in (the chosen one when it is), at a level offered there. */
  const partyChoice = (): { dialect: GameDialect; levels: GameDifficulty[]; level: GameDifficulty } => {
    const offer = game === 'impostor' ? impostorOffer : dontSayOffer;
    const wanted: GameDialect = dialect === 'sorani' ? 'ckb' : 'kmr';
    const here = offer.find((o) => o.dialect === wanted) ?? offer[0];
    const levels = here?.difficulties ?? [];
    return { dialect: here?.dialect ?? wanted, levels, level: levels.includes(partyLevel) ? partyLevel : (levels[0] ?? 'beginner') };
  };

  const settings = (): Record<string, unknown> => {
    if (game === 'wordle-battle') return { difficulty, rated };
    if (game === 'rhyme-match') return { dialect, rated };
    if (game === 'impostor' || game === 'dont-say') {
      const party = partyChoice();
      return {
        dialect: party.dialect,
        difficulty: party.level,
        ...(game === 'impostor' ? { clueSeconds: Number(clueSeconds) } : {}),
        rated,
      };
    }
    if (game === 'last-letter') {
      // a Last Letter lobby is in one dialect the dictionary can check: the chosen one if it is offered
      const wanted = dialect === 'sorani' ? 'ckb' : 'kmr';
      return { dialect: letterDialects.includes(wanted) || letterDialects.length === 0 ? wanted : letterDialects[0], rated };
    }
    if (game === 'bluff' || game === 'who-am-i') return { ...(partySettings ?? {}), rated };
    return { ...inviteSettings({ ...story, dialect }), rated };
  };

  // whom the tickets are written out for: the group a game is posted in, and each friend picked
  const holders = useMemo((): TicketHolder[] => {
    const byId = new Map((friends ?? []).map((f) => [f.userId, f]));
    const people = picked
      .map((id) => byId.get(id))
      .filter((f): f is FriendSummary => !!f)
      .map((f) => ({ id: f.userId, name: f.displayName ?? f.username, photoUrl: f.avatarUrl }));
    return target.kind === 'group' ? [{ id: 'group', name: t(GAME_NAME_KEY[game]), photoUrl: null, group: true }, ...people] : people;
  }, [friends, picked, target.kind, game, t]);

  const submit = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setRefusal(null);
    setSent(null);
    setPhase('sending');
    const going = holders;
    const chat = target.kind === 'dm' ? { userId: target.friendId } : target.kind === 'group' ? { groupId: target.groupId } : undefined;
    // the DM's friend is invited by `chat` (that is what posts the card in the DM)
    const invite = picked.filter((id) => !(target.kind === 'dm' && id === target.friendId));
    const res =
      target.kind === 'lobby'
        ? await inviteFriends(client, target.game, target.lobbyId, picked)
        : await createLobby(client, { game, settings: settings(), invite: invite.length ? invite : undefined, chat });
    if (!res.ok) {
      // the tickets are set back down, with a shake, beside the reason
      setBusy(false);
      setPhase('picking');
      setRefusals((n) => n + 1);
      haptic('error');
      refused(res.error);
      return;
    }
    haptic('tap');
    setPhase('flying');
    const text = sentText(going, res.data.invited, t);
    const created = 'lobbyId' in res.data ? lobbyRoute(res.data.game, res.data.lobbyId) : null;
    if (created) goToLobby.current = () => navigation.navigate(created.name, created.params as never);
    after(flightMs(going.length, reduce), () => {
      setPhase('picking');
      setSent({ holders: going, text });
      // the line under the sent tickets is a polite live region on Android; iOS is told once
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text);
      if (!created) {
        setBusy(false);
        setPicked([]);
        return;
      }
      after(SENT_HOLD_MS, () => {
        const go = goToLobby.current;
        goToLobby.current = null;
        onClose();
        go?.();
      });
    });
  };

  const needsFriend = target.kind === 'lobby' || target.kind === 'new' || target.kind === 'dm';
  const disabled = needsFriend && picked.length === 0;
  const storyDisabled = game === 'stories' && target.kind !== 'lobby' && stories.length === 0;
  const partyDisabled = (game === 'bluff' || game === 'who-am-i') && target.kind !== 'lobby' && partySettings === null;

  const friendRow = (f: FriendSummary) => {
    const locked = f.userId === lockedId;
    const on = locked || picked.includes(f.userId);
    const name = f.displayName ?? f.username;
    return (
      <Pressable
        key={f.userId}
        onPress={() => toggle(f.userId)}
        disabled={locked}
        accessibilityRole={single ? 'radio' : 'checkbox'}
        accessibilityState={{ checked: on, disabled: locked }}
        accessibilityLabel={f.online ? t('play.sheet.friendOnline', { name }) : name}
        style={({ pressed }) => [styles.friend, { backgroundColor: on ? colors.controlTrack : 'transparent', opacity: pressed ? 0.8 : 1 }]}
      >
        <View>
          <InitialsAvatar name={name} id={f.userId} size={36} photoUrl={f.avatarUrl} />
          {f.online ? <View style={[styles.online, { backgroundColor: colors.success, borderColor: colors.background }]} /> : null}
        </View>
        <View style={styles.friendText}>
          <Text style={[styles.friendName, { color: colors.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          {f.displayName ? (
            <Text style={[styles.friendHandle, { color: colors.textSecondary }]} numberOfLines={1}>
              @{f.username}
            </Text>
          ) : null}
        </View>
        <View style={[styles.check, { borderColor: on ? colors.primary : colors.textSecondary, backgroundColor: on ? colors.primary : 'transparent' }]}>
          {on ? <Icon name="check" size={14} color={colors.textOnPrimary} /> : null}
        </View>
      </Pressable>
    );
  };

  const title =
    target.kind === 'lobby' ? t('play.sheet.inviteTitle') : target.kind === 'group' ? t('play.sheet.groupTitle') : t('play.sheet.title');

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          {sent ? (
            <SentFan game={game} holders={sent.holders} text={sent.text} />
          ) : (
            <PickedTickets game={game} holders={holders} phase={phase} refused={refusals} />
          )}
          <SendErrorNotice error={refusal} onNavigate={onClose} style={styles.notice} />
          {error ? <Note tone="danger" icon="alert">{error}</Note> : null}
          <ClayButton
            label={
              target.kind === 'lobby'
                ? t('play.sheet.send', { count: picked.length })
                : target.kind === 'group'
                  ? t('play.sheet.postToGroup')
                  : t('play.sheet.createAndInvite')
            }
            tone="primary"
            size="large"
            busy={busy}
            disabled={disabled || storyDisabled || partyDisabled}
            onPress={() => void submit()}
          />
        </>
      }
    >
      {target.kind !== 'lobby' ? (
        <>
          {fixedGame ? null : (
            <View style={styles.field}>
              <SectionLabel>{t('play.sheet.game')}</SectionLabel>
              <View accessibilityRole="radiogroup" accessibilityLabel={t('play.sheet.game')} style={styles.games}>
                {offeredGames.map((g) => {
                  const on = g === game;
                  return (
                    <Pressable
                      key={g}
                      onPress={() => {
                        if (!on) haptic('select');
                        setGame(g);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={t(GAME_NAME_KEY[g])}
                      style={({ pressed }) => [
                        styles.gameTile,
                        { backgroundColor: on ? colors.primary : colors.controlTrack, opacity: pressed ? 0.85 : 1 },
                      ]}
                    >
                      <Icon name={GAME_ICON[g]} size={22} color={on ? colors.textOnPrimary : colors.primary} />
                      <Text style={[styles.gameName, { color: on ? colors.textOnPrimary : colors.textPrimary }]} numberOfLines={2}>
                        {t(GAME_NAME_KEY[g])}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {game === 'wordle-battle' ? (
            <View style={styles.field}>
              <SectionLabel>{t('games.difficulty')}</SectionLabel>
              <Segmented<Difficulty>
                groupLabel={t('games.difficulty')}
                options={['easy', 'medium', 'hard']}
                value={difficulty}
                onChange={setDifficulty}
                labelOf={(d) => t(DIFFICULTY_KEY[d])}
              />
            </View>
          ) : (
            <View style={styles.field}>
              <SectionLabel>{t('stories.variety')}</SectionLabel>
              <Segmented<StoryDialect>
                groupLabel={t('stories.variety')}
                options={STORY_DIALECTS}
                value={dialect}
                onChange={setDialect}
                labelOf={(d) => DIALECT_NAME[d]}
              />
            </View>
          )}

          {(game === 'impostor' || game === 'dont-say') && partyChoice().levels.length > 0 ? (
            <View style={styles.field}>
              <SectionLabel>{t('games.party.level')}</SectionLabel>
              <Segmented<GameDifficulty>
                groupLabel={t('games.party.level')}
                options={partyChoice().levels}
                value={partyChoice().level}
                onChange={setPartyLevel}
                labelOf={(d) => t(PARTY_LEVEL_KEY[d])}
              />
            </View>
          ) : null}
          {game === 'impostor' ? (
            <View style={styles.field}>
              <SectionLabel>{t('games.impostor.clueTime')}</SectionLabel>
              <Segmented<string>
                groupLabel={t('games.impostor.clueTime')}
                options={IMPOSTOR_CLUE_SECONDS.map(String)}
                value={clueSeconds}
                onChange={setClueSeconds}
                labelOf={(sec) => t('games.party.seconds', { count: Number(sec) })}
              />
            </View>
          ) : null}
          {game === 'bluff' ? <BluffChoices offers={bluffOffers ?? []} dialect={dialect === 'sorani' ? 'ckb' : 'kmr'} onChange={setPartySettings} /> : null}
          {game === 'who-am-i' ? <RaceChoices offers={raceOffers ?? []} dialect={dialect === 'sorani' ? 'ckb' : 'kmr'} onChange={setPartySettings} /> : null}

          <View style={styles.field}>
            <SectionLabel>{t('ranks.gameType')}</SectionLabel>
            <RatedChoice value={rated} onChange={setRated} />
          </View>

          {game === 'stories' ? (
            <>
              <View style={styles.field}>
                <SectionLabel>{t('stories.setup.mode')}</SectionLabel>
                <Segmented<'duo' | 'group'>
                  groupLabel={t('stories.setup.mode')}
                  options={['duo', 'group']}
                  value={story.mode === 'group' ? 'group' : 'duo'}
                  onChange={(mode) => {
                    setStory((s) => changeSetup(s, { mode }));
                    if (mode === 'duo') setPicked((p) => p.slice(0, 1));
                  }}
                  labelOf={(m) => (m === 'duo' ? t('stories.mode.duo') : t('stories.mode.group'))}
                />
              </View>
              {storyDisabled ? (
                <Note icon="story">{t(dialect === 'sorani' ? 'stories.empty.sorani' : 'stories.empty.kurmanci')}</Note>
              ) : (
                <StoryPresetFields state={{ ...story, dialect }} onChange={setStory} stories={stories} canHostOpen={canHostOpen} />
              )}
            </>
          ) : null}
        </>
      ) : null}

      <View style={styles.field}>
        <SectionLabel>{target.kind === 'group' ? t('play.sheet.alsoInvite') : t('play.sheet.friends')}</SectionLabel>
        {target.kind === 'group' ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('play.sheet.groupHint')}</Text>
        ) : null}
        {lockedFriend ? friendRow(lockedFriend) : null}
        {offerOthers ? (
          <SearchField value={query} onChangeText={setQuery} label={t('play.sheet.search')} returnKeyType="done" />
        ) : null}
        {friends === null || !offerOthers ? null : friends.length === 0 ? (
          <Note>{t('play.sheet.noFriends')}</Note>
        ) : (
          <>
            {recent.length > 0 ? (
              <>
                <Text style={[styles.subhead, { color: colors.textSecondary }]}>{t('play.sheet.recent')}</Text>
                {recent.map(friendRow)}
                <Text style={[styles.subhead, { color: colors.textSecondary }]}>{t('play.sheet.allFriends')}</Text>
              </>
            ) : null}
            {rest.map(friendRow)}
          </>
        )}
        {!single && picked.length >= limit ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('play.sheet.limit', { count: limit })}</Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  notice: { marginHorizontal: 0, marginBottom: 0 },
  field: { gap: spacing.sm },
  // eight games and more: four to a row, so each name still has room
  games: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gameTile: {
    flexGrow: 1,
    flexBasis: '22%',
    minHeight: 72,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  gameName: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, textAlign: 'center' },
  hint: { fontSize: typography.sizes.sm, lineHeight: 19 },
  subhead: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, marginTop: spacing.xs },
  friend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
  },
  online: { position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: radii.pill, borderWidth: 2 },
  friendText: { flex: 1 },
  friendName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  friendHandle: { fontSize: typography.sizes.sm },
  check: { width: 24, height: 24, borderRadius: radii.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
