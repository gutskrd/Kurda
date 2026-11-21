import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, StyleSheet, Text, View, useWindowDimensions, type ViewToken } from 'react-native';
import { Pressable } from '../theme/Pressable';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { Segmented } from '../theme/glass';
import { Chips } from '../theme/Chips';
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
 * Rankings' boards: by XP (this week or all time), Zêr or Gewher, compared with everyone, friends or your country, a
 * page at a time. What is ranked is the first choice, the span a quieter one under it for XP, and who you are compared
 * with the last; the screen keeps all three. `header` goes above the rows, where XP this week puts your league.
 */

/** What a board ranks; the ids are the API's (`GET /leaderboards/:type`). */
export type BoardType = 'weekly_xp' | 'all_time_xp' | 'zer' | 'gewher';
/** What Rankings ranks by. */
export type RankKind = 'xp' | 'zer' | 'gewher';
/** Over what span the XP board counts. */
export type XpSpan = 'week' | 'all';

/** The three scopes, as on the web. */
export type Scope = 'global' | 'friends' | 'country';
const SCOPES: { key: Scope; labelKey: TranslationKey }[] = [
  { key: 'global', labelKey: 'rankings.scope.global' },
  { key: 'friends', labelKey: 'nav.friends' },
  { key: 'country', labelKey: 'rankings.scope.country' },
];

const KINDS: { key: RankKind; labelKey: TranslationKey }[] = [
  { key: 'xp', labelKey: 'rankings.board.xp' },
  { key: 'zer', labelKey: 'rankings.board.zer' },
  { key: 'gewher', labelKey: 'rankings.board.gewher' },
];

const SPANS: { key: XpSpan; labelKey: TranslationKey }[] = [
  { key: 'week', labelKey: 'rankings.span.week' },
  { key: 'all', labelKey: 'rankings.span.all' },
];

/** Each board's line above its rows, saying what it ranks. */
const BLURB: Record<BoardType, TranslationKey> = {
  weekly_xp: 'rankings.board.weeklyXpBlurb',
  all_time_xp: 'rankings.board.allTimeXpBlurb',
  zer: 'rankings.board.zerBlurb',
  gewher: 'rankings.board.gewherBlurb',
};

/** The board behind a choice: XP is this week's or all time's, the balances are their own. */
function boardFor(kind: RankKind, span: XpSpan): BoardType {
  if (kind === 'xp') return span === 'all' ? 'all_time_xp' : 'weekly_xp';
  return kind;
}

const isXp = (type: BoardType): boolean => type === 'weekly_xp' || type === 'all_time_xp';

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
  /** Every board but this week's lists the top this many and no further. */
  depth?: number;
  /** Country scope only; null when the profile has no country set. */
  country?: string | null;
}

/** One page of the board. The browser uses the same size. */
const PAGE = 25;

export function Leaderboard({
  kind,
  span,
  scope,
  onKind,
  onSpan,
  onScope,
  header,
}: {
  kind: RankKind;
  span: XpSpan;
  scope: Scope;
  onKind: (next: RankKind) => void;
  onSpan: (next: XpSpan) => void;
  onScope: (next: Scope) => void;
  header?: ReactNode;
}): React.JSX.Element {
  const { client } = useAuth();
  const { t } = useI18n();
  const type = boardFor(kind, span);
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
  const choose =
    <T,>(now: T, set: (next: T) => void) =>
    (next: T): void => {
      if (next === now) return;
      reset();
      set(next);
    };

  return (
    <>
      <View style={styles.choosers}>
        <BoardSwitch value={kind} onChange={choose(kind, onKind)} />
        {kind === 'xp' ? (
          <Chips<XpSpan> options={SPANS.map((s) => s.key)} value={span} onChange={choose(span, onSpan)} labelOf={(key) => t(SPANS.find((s) => s.key === key)!.labelKey)} />
        ) : null}
      </View>
      <BoardList
        board={board}
        error={error}
        onRetry={() => load(0)}
        type={type}
        entries={entries}
        scope={scope}
        loadingMore={loadingMore}
        onMore={() => load(entries.length)}
        head={header}
        scopes={
          <Segmented<Scope>
            options={SCOPES.map((s) => s.key)}
            value={scope}
            onChange={choose(scope, onScope)}
            labelOf={(key) => t(SCOPES.find((s) => s.key === key)!.labelKey)}
            groupLabel={t('rankings.compareWith')}
            wrap
          />
        }
      />
    </>
  );
}

/**
 * What is ranked, a segmented control announced as one choice of three. It is all in view because switching is the
 * first thing anyone does here. A long name takes a second line on a narrow phone rather than being cut.
 */
export function BoardSwitch({ value, onChange }: { value: RankKind; onChange: (next: RankKind) => void }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <Segmented<RankKind>
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
  if (isXp(type)) return t('leagues.xpCount', { xp: n });
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
  if (isXp(type)) return <Text style={[styles.score, { color: colors.textPrimary }]}>{t('leagues.xpCount', { xp: short })}</Text>;
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

/** Where your own row is against the screen: on it, scrolled past, still below, or not on the page yet. */
type MeAt = 'shown' | 'above' | 'below' | 'absent';

/**
 * A board a page at a time under its header, which stays while the board loads or fails. Your row is picked out in
 * place and kept at the foot of the screen while the page has not reached it or it is still further down. The empty
 * state names the scope (nobody at all, none of your friends, nobody from your country), and a capped board's foot
 * says it shows the top.
 */
function BoardList({
  board,
  error,
  onRetry,
  type,
  entries,
  scope,
  loadingMore,
  onMore,
  head,
  scopes,
}: {
  board: Board | null;
  error: ApiError | null;
  onRetry: () => void;
  type: BoardType;
  entries: BoardEntry[];
  scope: Scope;
  loadingMore: boolean;
  onMore: () => void;
  head: ReactNode;
  scopes: ReactNode;
}): React.JSX.Element {
  const { locale, t } = useI18n();
  const { colors } = useTheme();
  const { user } = useAuth();
  const myId = user?.id ?? null;
  const mine = entries.findIndex((e) => e.userId === myId);
  const [meAt, setMeAt] = useState<MeAt>(mine >= 0 ? 'shown' : 'absent');
  useEffect(() => setMeAt(mine >= 0 ? 'shown' : 'absent'), [mine]);
  // The rows on screen say where yours is; kept in a ref, since the list reads its handler once.
  const mineRef = useRef(mine);
  mineRef.current = mine;
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const at = mineRef.current;
    if (at < 0) return;
    const seen = viewableItems.map((v) => v.index ?? -1).filter((i) => i >= 0);
    if (seen.length === 0) return;
    setMeAt(seen.includes(at) ? 'shown' : at > Math.max(...seen) ? 'below' : 'above');
  }).current;

  const top = (
    <View style={styles.head}>
      {head}
      <Text style={[styles.hint, { color: colors.textSecondary }]}>{t(BLURB[type])}</Text>
      {scopes}
    </View>
  );
  const empty = emptyKeys(scope, type);
  const noCountry = scope === 'country' && board !== null && board.country == null;
  const more = board ? Math.min(PAGE, board.total - entries.length) : 0;
  const topOnly = board !== null && entries.length > 0 && more <= 0 && board.depth !== undefined && board.total >= board.depth;
  const pinned = board?.me != null && !noCountry && (meAt === 'absent' || meAt === 'below');
  return (
    <View style={styles.fill}>
      <FlatList
        data={noCountry ? [] : entries}
        keyExtractor={(e) => e.userId}
        contentContainerStyle={styles.list}
        onViewableItemsChanged={onViewable}
        ListHeaderComponent={top}
        renderItem={({ item }) => <BoardRow entry={item} type={type} self={item.userId === myId} depth={board?.depth} />}
        ListEmptyComponent={
          !board ? (
            <AsyncBoundary loading={!error} error={error} onRetry={onRetry} skeleton={<RowsSkeleton />}>
              {null}
            </AsyncBoundary>
          ) : noCountry ? (
            <View style={styles.centered}>
              <Icon name="globe" size={48} tone="secondary" />
              <Text style={[styles.title, { color: colors.textPrimary }]}>{t('rankings.noCountry')}</Text>
              <Text style={[styles.hint, styles.center, { color: colors.textSecondary }]}>{t('rankings.noCountryBody')}</Text>
            </View>
          ) : (
            <View style={styles.centered}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{t(empty[0])}</Text>
              <Text style={[styles.hint, styles.center, { color: colors.textSecondary }]}>{t(empty[1])}</Text>
            </View>
          )
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
              {t('rankings.topOnly', { count: formatNumber(board!.depth!, locale) })}
            </Text>
          ) : null
        }
      />
      {/* Your standing, at the foot of the screen while the board above has not reached you. */}
      {pinned && board?.me ? (
        <View
          style={[styles.pinned, { backgroundColor: colors.background, borderTopColor: colors.separator }]}
          testID="rankings-pinned"
          // On the board as well, further down: a screen reader finds it there.
          {...(mine >= 0 ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const } : {})}
        >
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
            <Text style={[styles.hint, styles.note, { color: colors.textSecondary }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {t('rankings.notInTop', { count: formatNumber(board.depth, locale) })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** This week's empty states talk about earning this week, the balances' about holding some; all time has neither. */
function emptyKeys(scope: Scope, type: BoardType): readonly [TranslationKey, TranslationKey] {
  if (scope === 'friends') return ['rankings.empty.friends', 'rankings.empty.friendsBody'];
  if (scope === 'country') return ['rankings.empty.country', type === 'weekly_xp' ? 'rankings.empty.countryBody' : 'rankings.empty.balanceCountryBody'];
  return ['rankings.empty.global', isXp(type) ? 'rankings.empty.globalBody' : 'rankings.empty.balanceGlobalBody'];
}

/** The height of a row, for how many grey ones fill the screen while the board loads. */
const ROW = MIN_TOUCH_TARGET + 4 + spacing.xs;

/** The rows while the board loads: place, face, name and amount, in grey. */
function RowsSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  const { height } = useWindowDimensions();
  const rows = Math.max(8, Math.ceil((height - 420) / ROW));
  return (
    <View style={styles.rows} accessibilityLabel={t('common.loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonText size={typography.sizes.text} width={14} align="center" style={styles.rankSkeleton} />
          <Skeleton width={32} height={32} radius={radii.pill} />
          <SkeletonText size={typography.sizes.text} width={i % 2 ? '40%' : '56%'} style={styles.nameSkeleton} />
          <SkeletonText size={typography.sizes.text} width={52} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  choosers: { paddingHorizontal: layout.gutter, marginBottom: spacing.xs, gap: spacing.xs },
  list: { paddingHorizontal: layout.gutter, paddingVertical: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs, paddingBottom: spacing.xxl },
  head: { gap: spacing.sm, marginBottom: spacing.sm },
  rows: { gap: spacing.xs },
  pinned: { paddingHorizontal: layout.gutter, paddingTop: spacing.xs, paddingBottom: spacing.sm, gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingHorizontal: spacing.sm, minHeight: MIN_TOUCH_TARGET + 4 },
  rank: { width: 26, textAlign: 'center', fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  name: { flex: 1, fontSize: typography.sizes.text },
  nameSelf: { fontWeight: typography.weights.bold },
  amount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  score: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  title: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center' },
  hint: { fontSize: typography.sizes.text, lineHeight: 19 },
  note: { paddingHorizontal: spacing.sm },
  center: { textAlign: 'center' },
  end: { paddingVertical: spacing.md },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  more: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, minHeight: MIN_TOUCH_TARGET },
  busy: { opacity: 0.5 },
  moreText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  rankSkeleton: { width: 26 },
  nameSkeleton: { flex: 1 },
});
