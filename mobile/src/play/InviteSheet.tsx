import { useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  MAX_INVITEES_PER_REQUEST,
  PLAY_GAMES,
  STORY_DIALECTS,
  type PlayGame,
  type StoryDialect,
  type StoryListItem,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError, type Translate } from '../api/errors';
import type { ApiError } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
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

/** Friends shown first: the ones invited most recently, newest first, then everyone by name. */
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
 * "Invite to play" (contract §B1): every place a game with friends starts —
 * a friend's profile, the friends list, the chat composer, a game's lobby,
 * the end of a game — opens this one sheet: the game, its presets, and
 * friends to ask (search, the ones played with lately first, who is online).
 *
 * Making the game puts the host in its lobby and invites the friends picked;
 * from a chat the game's card is posted in that chat. Inviting more people
 * into a lobby that exists skips the game and its presets.
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
  const [stories, setStories] = useState<StoryListItem[]>([]);
  const [story, setStory] = useState<SetupState>(() => initialSetup({ mode: 'duo', dialect, length: 'short' }));
  const [friends, setFriends] = useState<FriendSummary[] | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const preselected = target.kind === 'dm' ? target.friendId : target.kind === 'new' ? target.friendId : undefined;
  const [picked, setPicked] = useState<string[]>(preselected ? [preselected] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  // a duo (and a battle or a match for two) invites one friend; a group up to seven
  const single = target.kind === 'lobby' ? target.mode === 'duo' : game === 'stories' && story.mode === 'duo';
  const limit = single ? 1 : MAX_INVITEES_PER_REQUEST;

  useEffect(() => {
    let live = true;
    void listFriends(client).then((res) => {
      if (live) setFriends(res.ok ? res.data.friends : []);
    });
    void listInvites(client).then((res) => {
      if (!live || !res.ok) return;
      setRecentIds(res.data.outgoing.flatMap((o) => o.invitees.map((i) => i.userId)));
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

  const { recent, rest } = useMemo(() => orderFriends(friends ?? [], recentIds, query), [friends, recentIds, query]);

  const toggle = (id: string): void => {
    setPicked((list) => {
      if (list.includes(id)) return list.filter((x) => x !== id);
      if (single) return [id];
      return list.length >= limit ? list : [...list, id];
    });
  };

  const settings = (): Record<string, unknown> => {
    if (game === 'wordle-battle') return { difficulty };
    if (game === 'rhyme-match') return { dialect };
    return inviteSettings({ ...story, dialect });
  };

  const submit = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (target.kind === 'lobby') {
      const res = await inviteFriends(client, target.game, target.lobbyId, picked);
      setBusy(false);
      if (!res.ok) {
        setError(inviteError(res.error, t));
        return;
      }
      setSent(res.data.invited);
      setPicked([]);
      return;
    }
    const chat = target.kind === 'dm' ? { userId: target.friendId } : target.kind === 'group' ? { groupId: target.groupId } : undefined;
    // the DM's friend is invited by `chat` (that is what posts the card in the DM)
    const invite = picked.filter((id) => !(target.kind === 'dm' && id === target.friendId));
    const res = await createLobby(client, { game, settings: settings(), invite: invite.length ? invite : undefined, chat });
    setBusy(false);
    if (!res.ok) {
      setError(inviteError(res.error, t));
      return;
    }
    onClose();
    const route = lobbyRoute(res.data.game, res.data.lobbyId);
    navigation.navigate(route.name, route.params as never);
  };

  const needsFriend = target.kind === 'lobby' || target.kind === 'new' || target.kind === 'dm';
  const disabled = needsFriend && picked.length === 0;
  const storyDisabled = game === 'stories' && target.kind !== 'lobby' && stories.length === 0;

  const friendRow = (f: FriendSummary) => {
    const on = picked.includes(f.userId);
    const name = f.displayName ?? f.username;
    return (
      <Pressable
        key={f.userId}
        onPress={() => toggle(f.userId)}
        accessibilityRole={single ? 'radio' : 'checkbox'}
        accessibilityState={{ checked: on }}
        accessibilityLabel={f.online ? t('play.sheet.friendOnline', { name }) : name}
        style={({ pressed }) => [styles.friend, { backgroundColor: on ? colors.successFill : 'transparent', opacity: pressed ? 0.8 : 1 }]}
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
          {error ? <Note tone="danger" icon="alert">{error}</Note> : null}
          {sent !== null ? (
            <Text style={[styles.sent, { color: colors.success }]} accessibilityLiveRegion="polite">
              {t('play.sheet.sent', { count: sent })}
            </Text>
          ) : null}
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
            disabled={disabled || storyDisabled}
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
                {PLAY_GAMES.map((g) => {
                  const on = g === game;
                  return (
                    <Pressable
                      key={g}
                      onPress={() => setGame(g)}
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
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('play.sheet.search')}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t('play.sheet.search')}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.search, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}
        />
        {friends === null ? null : friends.length === 0 ? (
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
  field: { gap: spacing.sm },
  games: { flexDirection: 'row', gap: spacing.sm },
  gameTile: {
    flex: 1,
    minHeight: 72,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  gameName: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, textAlign: 'center' },
  hint: { fontSize: typography.sizes.sm, lineHeight: 19 },
  search: { minHeight: MIN_TOUCH_TARGET, borderRadius: radii.md, paddingHorizontal: spacing.md, fontSize: typography.sizes.md },
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
  sent: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center' },
});
