import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import {
  IMPOSTOR_CLUE_SECONDS,
  IMPOSTOR_DEFAULT_CLUE_SECONDS,
  MAX_INVITEES_PER_REQUEST,
  PLAY_GAMES,
  impostorCategoriesInOrder,
  impostorCategoryTone,
  meaningIn,
  STORY_DIALECTS,
  type GameDialect,
  type GameDifficulty,
  type PlayGame,
  type StoryDialect,
  type StoryListItem,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError, type Translate } from '../api/errors';
import type { ApiError } from '../api/types';
import type { RootNavigation } from '../navigation/rootStack';
import { ClayButton, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { useCourseDialect } from '../learn/courseDialect';
import { listStories } from '../stories/api';
import { StoryPresetFields, useCanHostOpen } from '../stories/SetupSheet';
import { changeSetup, initialSetup, inviteSettings, type SetupState } from '../stories/setup';
import { shownDialect, useStoryPrefs } from '../stories/prefs';
import { Note, SectionLabel, Sheet } from '../stories/ui';
import { createLobby, inviteFriends, type FriendSummary } from './api';
import { FriendPicker, togglePick, useFriendsToAsk } from './FriendPicker';
import { GAME_ICON, GAME_NAME_KEY } from './labels';
import { DIFFICULTY_KEY, type Difficulty } from '../wordle/board';
import { lobbyRoute } from './routes';
import { PickedTickets, SentFan, flightMs, type SendPhase, type TicketHolder } from './SentTickets';
import { SendErrorNotice } from '../reports/SendError';
import { restrictionOf } from '../reports/sendErrors';
import { offeredDialects, useLastLetterAvailability } from '../lastletter/availability';
import { CategoryArt } from '../impostor/art';
import { categoriesAt, useImpostorCategories } from '../impostor/categories';
import { PictureTiles } from '../impostor/parts';
import { usePartyOffer } from '../party/offer';
import { PARTY_LEVEL_KEY } from '../party/PartyStart';
import { groupDialects, useMpAvailability } from '../games/mpAvailability';
import { TableChoices } from '../games/partyChoices';
import { pressedDim } from '../theme/motion';
import { dialectNameKey } from '../i18n/dialectName';

/** Where the sheet was opened from, which decides what it makes and where a card goes. */
export type InviteTarget =
  /** A new game: from a profile, the friends list, a game page or a results screen. */
  | { kind: 'new'; game?: PlayGame; friendId?: string }
  /** A new game from a DM: that friend is invited and the card goes in the DM. */
  | { kind: 'dm'; friendId: string }
  /** A new game from a group chat: its card goes in the group, and friends may be asked too. */
  | { kind: 'group'; groupId: string }
  /** More friends into an existing lobby. */
  | { kind: 'lobby'; game: PlayGame; lobbyId: string; mode?: 'duo' | 'group' };

function inviteError(error: ApiError, t: Translate): string {
  if (error.code === 'OPEN_GAMES_ADULTS_ONLY' || error.code === 'OPEN_NOT_ALLOWED') return t('stories.error.openNotAllowed');
  if (error.code === 'EMPTY_POOL' || error.code === 'EMPTY_LEXICON') return t('games.emptyPool');
  if (error.code === 'NO_STORY') return t('stories.error.noStory');
  if (error.code === 'TOO_MANY_GAMES') return t('stories.error.tooManyGames');
  return describeError(error, t);
}

/** What the sent tickets say: the one friend by name, otherwise how many, or "posted" for a group game with nobody else asked. */
export function sentText(going: readonly TicketHolder[], invited: number, t: Translate): string {
  const friends = going.filter((h) => !h.group);
  if (invited === 0 && going.some((h) => h.group)) return t('play.sheet.posted');
  if (invited === 1 && friends.length === 1) return t('play.sheet.sentTo', { name: friends[0]!.name });
  return t('play.sheet.sent', { count: invited });
}

/** How long "sent" stays on a sheet that closes into the new lobby, so it is seen. */
const SENT_HOLD_MS = 900;

/**
 * The Kurdish variety a sheet opens on: the one Stories shows if chosen with its switch, else the learner's course.
 * The course reads as Kurmancî both when it is and while unknown, so only a Soranî course is taken from it;
 * otherwise the interface decides.
 */
function openingVariety(chosen: StoryDialect | null, course: 'kmr' | 'ckb', locale: string): StoryDialect {
  return chosen ?? (course === 'ckb' ? 'sorani' : shownDialect(locale, null));
}

const RHYME_DIALECTS: readonly StoryDialect[] = ['kurmanci', 'sorani'];

/**
 * The varieties a Rhyme Match can be made in now (`GET /rhyme/availability`), since one without enough curated
 * prompts cannot start. Both are offered until the server answers, or if it cannot say.
 */
function useRhymeDialects(enabled: boolean): readonly StoryDialect[] {
  const { client } = useAuth();
  const [open, setOpen] = useState<readonly StoryDialect[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void client.get<{ dialects?: Partial<Record<StoryDialect, { available?: boolean }>> }>('/rhyme/availability').then((r) => {
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

/**
 * "Invite to play" (contract §B1): the one sheet every game with friends starts from (profile, friends list, chat
 * composer, lobby, end of a game), with the game, its presets, and friends to ask (search, recent first, online).
 * Making the game puts the host in its lobby and invites the picked friends; from a chat the card is posted there.
 * For an existing lobby it skips the game and presets.
 *
 * Each picked friend is a ticket, and Send hands them over (SentTickets.tsx); the sheet then says who they went to
 * and closes into the lobby, or stays open in a lobby for more.
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
  // The variety Stories shows (chosen with its switch, which a Soranî interface does not overrule), else the learner's
  // own; it follows these until the host picks one.
  const course = useCourseDialect();
  const [pickedDialect, setDialect] = useState<StoryDialect | null>(null);
  const dialect = pickedDialect ?? openingVariety(prefs.dialect, course, locale);
  // The Last Letter, in dialects whose dictionary can check words (only asked where it could be offered).
  const letterDialects = offeredDialects(useLastLetterAvailability(target.kind !== 'lobby'), 'group');
  // Impostor, in the varieties and levels its approved cards allow.
  const impostorOffer = usePartyOffer('impostor', target.kind !== 'lobby') ?? [];
  // A Who Am I? table, where its content allows.
  const tableOffers = useMpAvailability('who-am-i', target.kind !== 'lobby');
  // A Rhyme Match needs a variety with enough prompts: the chosen one when it has them.
  const rhymeDialects = useRhymeDialects(target.kind !== 'lobby' && game === 'rhyme-match');
  const rhymeDialect: StoryDialect = rhymeDialects.includes(dialect) ? dialect : rhymeDialects[0]!;
  const offeredGames = PLAY_GAMES.filter(
    (g) =>
      fixedGame === g ||
      ((g !== 'last-letter' || letterDialects.length > 0) &&
        (g !== 'impostor' || impostorOffer.length > 0) &&
        (g !== 'who-am-i' || groupDialects(tableOffers).length > 0)),
  );
  const [partyLevel, setPartyLevel] = useState<GameDifficulty>('beginner');
  const [clueSeconds, setClueSeconds] = useState<string>(String(IMPOSTOR_DEFAULT_CLUE_SECONDS));
  // The category Impostor's word is drawn from; '' for any.
  const [category, setCategory] = useState('');
  // Who Am I?'s choices from its own fields; null when it cannot be made in the chosen Kurdish.
  const [partySettings, setPartySettings] = useState<Record<string, unknown> | null>(null);
  const [stories, setStories] = useState<StoryListItem[]>([]);
  const [story, setStory] = useState<SetupState>(() => initialSetup({ mode: 'duo', dialect, length: 'short' }));
  const { friends, recentIds, failed: friendsFailed, retry: retryFriends } = useFriendsToAsk();
  const preselected = target.kind === 'dm' ? target.friendId : target.kind === 'new' ? target.friendId : undefined;
  // From a DM the server invites that friend via `chat` regardless of picks, so they stay picked rather than offer a
  // choice that would not be honoured.
  const lockedId = target.kind === 'dm' ? target.friendId : null;
  const [picked, setPicked] = useState<string[]>(preselected ? [preselected] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** An account limit (a chat mute blocks game cards too), shown as every send path shows it, with Account standing. */
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const refused = (e: ApiError): void => {
    if (restrictionOf(e)) setRefusal(e);
    else setError(inviteError(e, t));
  };
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<SendPhase>('picking');
  const [refusals, setRefusals] = useState(0);
  /** The tickets just handed over, and what they say. */
  const [sent, setSent] = useState<{ holders: TicketHolder[]; text: string } | null>(null);
  // Pending follow-ups while the tickets fly. Going to a new lobby is never dropped: closing early goes there at once.
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

  // A duo (and a two-player battle or match) invites one friend; a group up to seven.
  const single = target.kind === 'lobby' ? target.mode === 'duo' : game === 'stories' && story.mode === 'duo';
  const limit = single ? 1 : MAX_INVITEES_PER_REQUEST;

  // The variety's published stories, for the lengths and the story list.
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

  const lockedFriend = lockedId ? (friends ?? []).find((f) => f.userId === lockedId) : undefined;
  // A two-player game from a DM is with that friend, so nobody else is offered.
  const offerOthers = !(lockedId && single);

  const toggle = (id: string): void => {
    if (id === lockedId || phase !== 'picking') return;
    // Picking again after a send starts the next set of tickets.
    setSent(null);
    setPicked((list) => togglePick(list, id, single, limit));
  };

  /** An Impostor lobby's variety (the chosen one when offered) and a level offered there. */
  const partyChoice = (): { dialect: GameDialect; levels: GameDifficulty[]; level: GameDifficulty } => {
    const wanted: GameDialect = dialect === 'sorani' ? 'ckb' : 'kmr';
    const here = impostorOffer.find((o) => o.dialect === wanted) ?? impostorOffer[0];
    const levels = here?.difficulties ?? [];
    return { dialect: here?.dialect ?? wanted, levels, level: levels.includes(partyLevel) ? partyLevel : (levels[0] ?? 'beginner') };
  };

  // Impostor's word may come from one category with enough approved cards at the chosen level, or any.
  const impostorParty = game === 'impostor' && target.kind !== 'lobby' ? partyChoice() : null;
  const impostorCategories = categoriesAt(useImpostorCategories(impostorParty && impostorOffer.length > 0 ? impostorParty.dialect : null), impostorParty?.level);
  const categoryNow = impostorCategories.some((c) => c.slug === category) ? category : '';
  const settings = (): Record<string, unknown> => {
    if (game === 'wordle-battle') return { difficulty };
    if (game === 'rhyme-match') return { dialect: rhymeDialect };
    if (game === 'impostor') {
      const party = partyChoice();
      return { dialect: party.dialect, difficulty: party.level, clueSeconds: Number(clueSeconds), category: categoryNow || null };
    }
    if (game === 'last-letter') {
      // A Last Letter lobby uses one dialect the dictionary can check: the chosen one if offered.
      const wanted = dialect === 'sorani' ? 'ckb' : 'kmr';
      return { dialect: letterDialects.includes(wanted) || letterDialects.length === 0 ? wanted : letterDialects[0] };
    }
    if (game === 'who-am-i') return { ...partySettings };
    return inviteSettings({ ...story, dialect });
  };

  // Who the tickets are for: the group a game is posted in, and each picked friend.
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
    // The DM's friend is invited by `chat`, which is what posts the card in the DM.
    const invite = picked.filter((id) => !(target.kind === 'dm' && id === target.friendId));
    const res =
      target.kind === 'lobby'
        ? await inviteFriends(client, target.game, target.lobbyId, picked)
        : await createLobby(client, { game, settings: settings(), invite: invite.length ? invite : undefined, chat });
    if (!res.ok) {
      // The tickets are set down with a shake, beside the reason.
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
      // The line under the sent tickets is a polite live region on Android; iOS is told once.
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
  const partyDisabled = game === 'who-am-i' && target.kind !== 'lobby' && partySettings === null;

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
                        { backgroundColor: on ? colors.primary : colors.controlTrack, opacity: pressed ? pressedDim : 1 },
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
          ) : game === 'rhyme-match' ? (
            // A Rhyme Match offers only its available varieties, and asks nothing when there is one.
            rhymeDialects.length > 1 ? (
              <View style={styles.field}>
                <SectionLabel>{t('stories.variety')}</SectionLabel>
                <Segmented<StoryDialect>
                  groupLabel={t('stories.variety')}
                  options={rhymeDialects}
                  value={rhymeDialect}
                  onChange={setDialect}
                  labelOf={(d) => t(dialectNameKey(d))}
                />
              </View>
            ) : null
          ) : (
            <View style={styles.field}>
              <SectionLabel>{t('stories.variety')}</SectionLabel>
              <Segmented<StoryDialect>
                groupLabel={t('stories.variety')}
                options={STORY_DIALECTS}
                value={dialect}
                onChange={setDialect}
                labelOf={(d) => t(dialectNameKey(d))}
              />
            </View>
          )}

          {game === 'impostor' && partyChoice().levels.length > 0 ? (
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
          {game === 'impostor' && impostorCategories.length > 0 ? (
            <View style={styles.field}>
              <SectionLabel>{t('games.impostor.category')}</SectionLabel>
              <PictureTiles<string>
                strip
                label={t('games.impostor.category')}
                value={categoryNow}
                onChange={setCategory}
                options={[
                  { value: '', label: t('games.couch.anyCategory'), art: <CategoryArt category={null} size={48} />, tone: impostorCategoryTone(null) },
                  ...impostorCategoriesInOrder(impostorCategories).map((c) => ({
                    value: c.slug,
                    label: c.ku,
                    hint: meaningIn(c.meanings, locale) ?? undefined,
                    art: <CategoryArt category={c.slug} size={48} />,
                    tone: impostorCategoryTone(c.slug),
                  })),
                ]}
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
          {game === 'who-am-i' ? <TableChoices offers={tableOffers ?? []} dialect={dialect === 'sorani' ? 'ckb' : 'kmr'} onChange={setPartySettings} /> : null}

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
        <FriendPicker
          friends={friends}
          failed={friendsFailed}
          onRetry={retryFriends}
          recentIds={recentIds}
          picked={picked}
          onToggle={toggle}
          single={single}
          limit={limit}
          locked={lockedFriend}
          offerOthers={offerOthers}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  notice: { marginHorizontal: 0, marginBottom: 0 },
  field: { gap: spacing.sm },
  // Four games to a row, so each name has room.
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
  gameName: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, textAlign: 'center' },
  hint: { fontSize: typography.sizes.text, lineHeight: 22 },
});
