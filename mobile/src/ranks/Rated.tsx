import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ExpectedGains, RankedGame, RatedState } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { getExpectedGains, setLobbyRated } from './api';
import { friendlyReasonKey, rankName, signed } from './format';

/** The ink a Rated pill is written in: dark on the gold, in either scheme. */
const ON_GOLD = '#1A1405';

/**
 * The Rated / Friendly badge (contract 4 §R2), shown before anyone joins: in
 * the invite banner, the game card, the lobby and the game's header. Rated
 * wears the gold, Friendly is quiet — and both say it in words, with an
 * icon, so colour is never the only difference.
 */
export function RatedPill({ rated, small = false, style }: { rated: boolean; small?: boolean; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const label = rated ? t('ranks.rated') : t('ranks.friendlyGame');
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[
        styles.pill,
        small && styles.pillSmall,
        { backgroundColor: rated ? colors.gold : colors.controlTrack },
        style,
      ]}
    >
      <Icon name={rated ? 'mountains' : 'handshake'} size={small ? 12 : 14} color={rated ? ON_GOLD : colors.textSecondary} />
      <Text style={[styles.pillText, small && styles.pillTextSmall, { color: rated ? ON_GOLD : colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

/**
 * The host's choice in a setup or invite sheet: two tiles, each saying what
 * it means, read out as a radio group.
 */
export function RatedChoice({ value, onChange }: { value: boolean; onChange: (rated: boolean) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const options = [
    { rated: true, icon: 'mountains' as const, title: t('ranks.rated'), hint: t('ranks.ratedHint') },
    { rated: false, icon: 'handshake' as const, title: t('ranks.friendlyGame'), hint: t('ranks.friendlyHint') },
  ];
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('ranks.gameType')} style={styles.choice}>
      {options.map((o) => {
        const on = o.rated === value;
        return (
          <Pressable
            key={String(o.rated)}
            onPress={() => onChange(o.rated)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${o.title}. ${o.hint}`}
            style={({ pressed }) => [
              styles.tile,
              {
                backgroundColor: on ? (o.rated ? colors.gold : colors.primary) : colors.controlTrack,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View style={styles.tileHead}>
              <Icon name={o.icon} size={18} color={on ? (o.rated ? ON_GOLD : colors.textOnPrimary) : colors.textPrimary} />
              <Text style={[styles.tileTitle, { color: on ? (o.rated ? ON_GOLD : colors.textOnPrimary) : colors.textPrimary }]}>{o.title}</Text>
            </View>
            <Text style={[styles.tileHint, { color: on ? (o.rated ? ON_GOLD : colors.textOnPrimary) : colors.textSecondary }]}>{o.hint}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A seat's name in a lobby, as the game screen already shows it. */
export type SeatName = (seat: number) => string;

/**
 * The lobby's Rated/Friendly panel: the badge for everyone, the host's switch,
 * and — while it is Rated — the chess.com line per opponent ("Win ≈ +24 ·
 * Lose ≈ −8") from the ratings as they are now, or the plain reason it would
 * play as friendly if it started now. Everyone else is told the host may
 * change it, and that they may leave without penalty if they do.
 *
 * `players` is how many are in the lobby: the expected gains are asked again
 * whenever someone comes or goes, and when the badge changes.
 */
export function LobbyRated({
  game,
  lobbyId,
  rated,
  isHost,
  players,
  seatName,
  onChanged,
}: {
  game: RankedGame;
  lobbyId: string;
  rated: RatedState | undefined;
  isHost: boolean;
  players: number;
  seatName: SeatName;
  /** the lobby changed (refetch its view) */
  onChanged: () => void;
}): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [gains, setGains] = useState<ExpectedGains | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRated = rated?.rated ?? false;

  useEffect(() => {
    if (!isRated) {
      setGains(null);
      return;
    }
    let live = true;
    void getExpectedGains(client, game, lobbyId).then((res) => {
      if (live) setGains(res.ok ? res.data : null);
    });
    return () => {
      live = false;
    };
  }, [client, game, lobbyId, isRated, players]);

  const change = useCallback(
    async (next: boolean) => {
      if (busy || next === isRated) return;
      setBusy(true);
      setError(null);
      const res = await setLobbyRated(client, game, lobbyId, next);
      setBusy(false);
      if (res.ok) onChanged();
      else setError(describeError(res.error, t));
    },
    [busy, isRated, client, game, lobbyId, onChanged, t],
  );

  if (!rated) return null;

  return (
    <View style={[styles.panel, { backgroundColor: colors.controlTrack }]}>
      <View style={styles.panelHead}>
        <RatedPill rated={isRated} />
        <Text style={[styles.panelHint, { color: colors.textSecondary }]} numberOfLines={2}>
          {isRated ? t('ranks.ratedHint') : t('ranks.friendlyHint')}
        </Text>
      </View>

      {isHost ? (
        <Pressable
          onPress={() => void change(!isRated)}
          disabled={busy}
          accessibilityRole="switch"
          accessibilityState={{ checked: isRated, disabled: busy }}
          accessibilityLabel={t('ranks.lobby.ratedSwitch')}
          style={({ pressed }) => [styles.switchRow, { opacity: pressed || busy ? 0.7 : 1 }]}
        >
          <Text style={[styles.switchLabel, { color: colors.textPrimary }]}>{t('ranks.lobby.ratedSwitch')}</Text>
          <View style={[styles.track, { backgroundColor: isRated ? colors.gold : colors.glassBorder }]}>
            <View style={[styles.knob, { backgroundColor: isRated ? ON_GOLD : colors.textOnPrimary, alignSelf: isRated ? 'flex-end' : 'flex-start' }]} />
          </View>
        </Pressable>
      ) : (
        <Text style={[styles.note, { color: colors.textSecondary }]}>{t('ranks.lobby.canLeave')}</Text>
      )}

      {isRated && gains ? <Gains gains={gains} seatName={seatName} /> : null}
      {error ? <Text style={[styles.note, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

function Gains({ gains, seatName }: { gains: ExpectedGains; seatName: SeatName }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  if (!gains.wouldCount && gains.friendlyReason) {
    return (
      <View style={styles.friendlyNow} accessibilityLiveRegion="polite">
        <Icon name="handshake" size={16} color={colors.textSecondary} />
        <Text style={[styles.note, styles.flex, { color: colors.textSecondary }]}>
          {t('ranks.lobby.wouldBeFriendly', { reason: t(friendlyReasonKey(gains.friendlyReason, gains.self)) })}
        </Text>
      </View>
    );
  }
  const group = gains.opponents.length >= 2 && gains.first !== null && gains.last !== null;
  return (
    <View style={styles.gains}>
      {gains.opponents.map((o) => {
        const rank = o.placing || !o.tier ? t('ranks.placingShort') : rankName(t, o.tier, o.division);
        const line = t('ranks.lobby.expected', { win: signed(o.win), lose: signed(o.lose) });
        return (
          <View key={o.seat} style={styles.gainRow} accessible accessibilityLabel={`${seatName(o.seat)}, ${rank}. ${line}`}>
            <View style={styles.flex}>
              <Text style={[styles.gainName, { color: colors.textPrimary }]} numberOfLines={1}>
                {seatName(o.seat)}
              </Text>
              <Text style={[styles.gainRank, { color: colors.textSecondary }]} numberOfLines={1}>
                {rank}
              </Text>
            </View>
            <Text style={[styles.gainLine, { color: colors.textPrimary }]}>{line}</Text>
          </View>
        );
      })}
      {group ? (
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          {t('ranks.lobby.expectedGroup', { first: signed(gains.first!), last: signed(gains.last!) })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  pillSmall: { paddingHorizontal: spacing.sm, paddingVertical: 3, gap: 4 },
  pillText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  pillTextSmall: { fontSize: typography.sizes.xs },

  choice: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, borderRadius: radii.md, padding: spacing.md, gap: spacing.xs, minHeight: 84 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tileTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  tileHint: { fontSize: typography.sizes.xs, lineHeight: 16 },

  panel: { alignSelf: 'stretch', borderRadius: radii.md, padding: spacing.md, gap: spacing.sm },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  panelHint: { flex: 1, fontSize: typography.sizes.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH_TARGET, gap: spacing.md },
  switchLabel: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  track: { width: 50, height: 30, borderRadius: radii.pill, padding: 3, justifyContent: 'center' },
  knob: { width: 24, height: 24, borderRadius: radii.pill },
  note: { fontSize: typography.sizes.sm, lineHeight: 19 },
  flex: { flex: 1 },
  friendlyNow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  gains: { gap: spacing.sm },
  gainRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  gainName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  gainRank: { fontSize: typography.sizes.xs },
  gainLine: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
});
