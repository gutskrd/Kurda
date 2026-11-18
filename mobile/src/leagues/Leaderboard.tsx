import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable } from '../theme/Pressable';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { Avatar, ownAvatarUrl } from '../profile/Avatar';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { formatCompact, formatNumber } from '../i18n/format';
import { heldDim } from '../theme/MotionParts';
import { useDirection } from '../reports/direction';

/**
 * The league screen's Leaderboard tab: everyone ranked, a page at a time. What is ranked (this week's XP, or Zêr
 * or Gewher held now) and who you are compared with are two rows of segmented controls; the screen keeps both
 * choices, so returning from the League tab finds the board as it was.
 */

/** What a board ranks; the ids are the API's (`GET /leaderboards/:type`). */
export type BoardType = 'weekly_xp' | 'zer' | 'gewher';

/** The weekly XP board's three scopes, as on the web. Game ranks and their boards live on the Ranks screen. */
export type Scope = 'global' | 'friends' | 'country';
const SCOPES: { key: Scope; labelKey: TranslationKey }[] = [
  { key: 'global', labelKey: 'rankings.scope.global' },
  { key: 'friends', labelKey: 'nav.friends' },
  { key: 'country', labelKey: 'rankings.scope.country' },
];

const KINDS: { key: BoardType; labelKey: TranslationKey; blurbKey: TranslationKey }[] = [
  { key: 'weekly_xp', labelKey: 'rankings.board.weeklyXp', blurbKey: 'rankings.board.weeklyXpBlurb' },
  { key: 'zer', labelKey: 'rankings.board.zer', blurbKey: 'rankings.board.zerBlurb' },
  { key: 'gewher', labelKey: 'rankings.board.gewher', blurbKey: 'rankings.board.gewherBlurb' },
];

export interface BoardEntry {
  userId: string;
  username: string;
  score: number;
  /** Ties share a place, so two rows can carry the same one. */
  rank: number;
  /** Already resolved; an older server sends none, and the row draws the default avatar. */
  avatarUrl?: string | null;
}
interface Board {
  top: BoardEntry[];
  total: number;
  /** Your own place is null only below the cut of a board that stops at `depth`. */
  me: { rank: number | null; score: number } | null;
  /** Zêr and Gewher: the board lists the top this many and no further. */
  depth?: number;
  /** Country scope only; null when the profile has no country set. */
  country?: string | null;
}

/** One page of the board. The browser uses the same size. */
const PAGE = 25;

export function Leaderboard({
  type,
  scope,
  onType,
  onScope,
}: {
  type: BoardType;
  scope: Scope;
  onType: (next: BoardType) => void;
  onScope: (next: Scope) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { t } = useI18n();
  const [board, setBoard] = useState<Board | null>(null);
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Which board the last request was for; an answer for a board switched away from is dropped. */
  const asking = useRef('');

  const load = useCallback(
    (offset: number) => {
      const key = `${type}:${scope}`;
      asking.current = key;
      if (offset > 0) setLoadingMore(true);
      void client.get<Board>(`/leaderboards/${type}?scope=${scope}&limit=${PAGE}&offset=${offset}`).then((res) => {
        if (asking.current !== key) return;
        setLoadingMore(false);
        if (res.ok) {
          setBoard(res.data);
          setEntries((prev) => (offset === 0 ? (res.data.top ?? []) : [...prev, ...(res.data.top ?? [])]));
          setError(null);
        } else setError(res.error);
      });
    },
    [client, type, scope],
  );

  useFocusEffect(useCallback(() => load(0), [load]));

  // A different board starts from its skeleton: the last one's rows, amounts and place do not apply.
  const reset = (): void => {
    setBoard(null);
    setEntries([]);
    setError(null);
  };

  return (
    <>
      <View style={styles.choosers}>
        <BoardSwitch
          value={type}
          onChange={(next) => {
            if (next === type) return;
            reset();
            onType(next);
          }}
        />
        <Segmented<Scope>
          options={SCOPES.map((s) => s.key)}
          value={scope}
          onChange={(next) => {
            if (next === scope) return;
            reset();
            onScope(next);
          }}
          labelOf={(key) => t(SCOPES.find((s) => s.key === key)!.labelKey)}
          wrap
        />
      </View>
      <AsyncBoundary loading={!board && !error} error={!board ? error : null} onRetry={() => load(0)} skeleton={<BoardSkeleton />}>
        {board ? <BoardList board={board} type={type} entries={entries} scope={scope} loadingMore={loadingMore} onMore={() => load(entries.length)} /> : null}
      </AsyncBoundary>
    </>
  );
}

/**
 * The switch between the three boards, a segmented control announced as one choice of three. It is all in view
 * because switching boards is the first thing anyone does here. A long name takes a second line on a narrow phone
 * rather than being cut. The coin and gem sit beside the amounts on every row of their boards.
 */
export function BoardSwitch({ value, onChange }: { value: BoardType; onChange: (next: BoardType) => void }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <Segmented<BoardType>
      options={KINDS.map((k) => k.key)}
      value={value}
      onChange={onChange}
      labelOf={(key) => t(KINDS.find((k) => k.key === key)!.labelKey)}
      groupLabel={t('rankings.rankBy')}
      wrap
    />
  );
}

type I18n = ReturnType<typeof useI18n>;

/** An amount, as a screen reader hears it: the number in full and what it counts. */
export function amountLabel(t: I18n['t'], type: BoardType, amount: number, locale: I18n['locale']): string {
  const n = formatNumber(amount, locale);
  if (type === 'weekly_xp') return t('leagues.xpCount', { xp: n });
  return `${n} ${t(type === 'zer' ? 'rankings.board.zer' : 'rankings.board.gewher')}`;
}

/**
 * An amount short enough for a row's end: XP as the league table writes it, Zêr and Gewher as the coin or gem
 * beside the number, as in the shop's purse.
 */
export function BoardAmount({ type, amount }: { type: BoardType; amount: number }): React.JSX.Element {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const short = formatCompact(amount, locale);
  if (type === 'weekly_xp') return <Text style={[styles.score, { color: colors.textPrimary }]}>{t('leagues.xpCount', { xp: short })}</Text>;
  return (
    <View style={styles.amount}>
      <Icon name={type === 'zer' ? 'coin' : 'gem'} size={16} color={type === 'zer' ? colors.gold : colors.primary} />
      <Text style={[styles.score, { color: colors.textPrimary }]}>{short}</Text>
    </View>
  );
}

/**
 * One board row: place, face, name and amount. Your own row is filled and edged as in the league table, and reads
 * as one line to a screen reader. A place is null only for your row below the cut of a capped board: a dash, with
 * the reason in words.
 */
export function BoardRow({
  entry,
  type,
  self,
  depth,
}: {
  entry: Omit<BoardEntry, 'rank'> & { rank: number | null };
  type: BoardType;
  self: boolean;
  depth?: number;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  // A row starts from the reading side: in Soranî and Arabic the place is on the right and the amount on the left.
  const dir = useDirection();
  const place = entry.rank;
  const name = self ? t('games.you') : entry.username;
  const amount = amountLabel(t, type, entry.score, locale);
  // Read as "#2, azad, 500 Zêr", and below the cut "You, 35 Zêr, Not in the top 1,000 yet.".
  const label =
    place === null ? [name, amount, t('rankings.notInTop', { count: formatNumber(depth ?? 0, locale) })].join(', ') : [`#${place}`, name, amount].join(', ');
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.row, { flexDirection: dir.row }, self && { backgroundColor: colors.glassFill, borderColor: colors.primary, borderWidth: 1 }]}
    >
      <Text style={[styles.rank, { color: colors.textSecondary }]}>{place ?? '–'}</Text>
      <Avatar name={entry.username} size={32} photoUrl={entry.avatarUrl ?? null} />
      <Text style={[styles.name, dir.free, self && styles.nameSelf, { color: colors.textPrimary }]} numberOfLines={1}>
        {name}
      </Text>
      <BoardAmount type={type} amount={entry.score} />
    </View>
  );
}

/**
 * A board a page at a time, with your row pinned above until a page reaches you. The empty state names the scope
 * (nobody at all, none of your friends, nobody from your country), and a capped balance board's foot says it
 * shows the top.
 */
function BoardList({
  board,
  type,
  entries,
  scope,
  loadingMore,
  onMore,
}: {
  board: Board;
  type: BoardType;
  entries: BoardEntry[];
  scope: Scope;
  loadingMore: boolean;
  onMore: () => void;
}): React.JSX.Element {
  const { locale, t } = useI18n();
  const { colors } = useTheme();
  const { user } = useAuth();
  if (scope === 'country' && board.country == null) {
    return (
      <View style={styles.centered}>
        <Icon name="globe" size={48} tone="secondary" />
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('rankings.noCountry')}</Text>
        <Text style={[styles.hint, styles.center, { color: colors.textSecondary }]}>{t('rankings.noCountryBody')}</Text>
      </View>
    );
  }
  const empty = emptyKeys(scope, type);
  const kind = KINDS.find((k) => k.key === type)!;
  // Your own row is picked out in place once a page reaches it, and pinned above the list until then.
  const myId = user?.id ?? null;
  const meInList = entries.some((e) => e.userId === myId);
  const more = Math.min(PAGE, board.total - entries.length);
  const topOnly = entries.length > 0 && more <= 0 && board.depth !== undefined && board.total >= board.depth;
  return (
    <FlatList
      data={entries}
      keyExtractor={(e) => e.userId}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.head}>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t(kind.blurbKey)}</Text>
          {board.me && !meInList ? (
            <View style={styles.pinned}>
              <BoardRow
                entry={{
                  userId: myId ?? 'me',
                  username: user?.displayName ?? user?.username ?? t('games.you'),
                  score: board.me.score,
                  rank: board.me.rank,
                  avatarUrl: ownAvatarUrl(user),
                }}
                type={type}
                self
                depth={board.depth}
              />
              {/* Said in words for everyone who reads the screen; the row already says it to a screen reader. */}
              {board.me.rank === null && board.depth ? (
                <Text
                  style={[styles.hint, styles.note, { color: colors.textSecondary }]}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  {t('rankings.notInTop', { count: formatNumber(board.depth, locale) })}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item }) => <BoardRow entry={item} type={type} self={item.userId === myId} depth={board.depth} />}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t(empty[0])}</Text>
          <Text style={[styles.hint, styles.center, { color: colors.textSecondary }]}>{t(empty[1])}</Text>
        </View>
      }
      ListFooterComponent={
        more > 0 && entries.length > 0 ? (
          <Pressable
            onPress={onMore}
            disabled={loadingMore}
            accessibilityRole="button"
            accessibilityState={{ busy: loadingMore, disabled: loadingMore }}
            style={({ pressed }) => [styles.more, loadingMore && styles.busy, pressed && heldDim]}
          >
            <Text style={[styles.moreText, { color: colors.primary }]}>{t('rankings.showMore', { count: more })}</Text>
          </Pressable>
        ) : topOnly ? (
          <Text style={[styles.hint, styles.center, styles.end, { color: colors.textSecondary }]}>
            {t('rankings.topOnly', { count: formatNumber(board.depth!, locale) })}
          </Text>
        ) : null
      }
    />
  );
}

/** The weekly board's empty states talk about earning this week; a balance has no week. */
function emptyKeys(scope: Scope, type: BoardType): readonly [TranslationKey, TranslationKey] {
  if (scope === 'friends') return ['rankings.empty.friends', 'rankings.empty.friendsBody'];
  if (scope === 'country') return ['rankings.empty.country', type === 'weekly_xp' ? 'rankings.empty.countryBody' : 'rankings.empty.balanceCountryBody'];
  return ['rankings.empty.global', type === 'weekly_xp' ? 'rankings.empty.globalBody' : 'rankings.empty.balanceGlobalBody'];
}

/** The height of a row, for how many grey ones fill the screen while the board loads. */
const ROW = MIN_TOUCH_TARGET + 4 + spacing.xs;

/** The loading placeholder: the board's line, then rows of place, face, name and amount. */
function BoardSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  const { height } = useWindowDimensions();
  const rows = Math.max(10, Math.ceil((height - 320) / ROW));
  return (
    <View style={styles.list} accessibilityLabel={t('common.loading')}>
      <View style={styles.head}>
        <SkeletonText size={typography.sizes.sm} lineHeight={19} width="80%" />
      </View>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonText size={typography.sizes.sm} width={14} align="center" style={styles.rankSkeleton} />
          <Skeleton width={32} height={32} radius={radii.pill} />
          <SkeletonText size={typography.sizes.md} width={i % 2 ? '40%' : '56%'} style={styles.nameSkeleton} />
          <SkeletonText size={typography.sizes.sm} width={52} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  choosers: { paddingHorizontal: layout.gutter, marginBottom: spacing.sm, gap: spacing.sm },
  list: { paddingHorizontal: layout.gutter, paddingVertical: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs, paddingBottom: spacing.xxl },
  head: { gap: spacing.sm, marginBottom: spacing.sm },
  pinned: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingHorizontal: spacing.sm, minHeight: MIN_TOUCH_TARGET + 4 },
  rank: { width: 26, textAlign: 'center', fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  name: { flex: 1, fontSize: typography.sizes.md },
  nameSelf: { fontWeight: typography.weights.bold },
  amount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  score: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  title: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textAlign: 'center' },
  hint: { fontSize: typography.sizes.sm, lineHeight: 19 },
  note: { paddingHorizontal: spacing.sm },
  center: { textAlign: 'center' },
  end: { paddingVertical: spacing.md },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  more: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, minHeight: MIN_TOUCH_TARGET },
  busy: { opacity: 0.5 },
  moreText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  rankSkeleton: { width: 26 },
  nameSkeleton: { flex: 1 },
});
