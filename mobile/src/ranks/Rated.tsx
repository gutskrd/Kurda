import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { haptic } from '../feedback/haptics';
import type { ExpectedGains, RankedGame, RatedState } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { Icon } from '../theme/Icon';
import { ToggleRow } from '../theme/Toggle';
import { useTheme } from '../theme/ThemeProvider';
import { useDirection } from '../reports/direction';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { getExpectedGains, setLobbyRated } from './api';
import { friendlyReasonKey, rankName, signed } from './format';
import { pressedDim } from '../theme/motion';

/**
 * The Rated / Friendly badge, shown before anyone joins: in the invite banner, the game card, the lobby and the game's
 * header. Rated wears gold and Friendly is quiet; both have a word and an icon, so colour is never the only difference.
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
      <Icon name={rated ? 'mountains' : 'handshake'} size={small ? 12 : 14} color={rated ? colors.textOnGold : colors.textSecondary} />
      <Text style={[styles.pillText, small && styles.pillTextSmall, { color: rated ? colors.textOnGold : colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

/**
 * The host's choice in a setup or invite sheet: two full-width cards, one under the other so long names fit, each
 * saying what it means and read out as a radio group. The chosen one is marked as every choice in the app is, a violet
 * wash and edge, and by a tick as well as colour.
 */
export function RatedChoice({ value, onChange }: { value: boolean; onChange: (rated: boolean) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
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
            onPress={() => {
              if (!on) haptic('select');
              onChange(o.rated);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${o.title}. ${o.hint}`}
            style={({ pressed }) => [
              styles.tile,
              {
                flexDirection: dir.row,
                backgroundColor: on ? `${colors.primary}1F` : colors.controlTrack,
                borderColor: on ? colors.primary : 'transparent',
                opacity: pressed ? pressedDim : 1,
              },
            ]}
          >
            <Icon name={o.icon} size={20} color={on ? colors.primary : colors.textPrimary} />
            <View style={styles.tileText}>
              <Text style={[styles.tileTitle, dir.text, { color: colors.textPrimary }]}>{o.title}</Text>
              <Text style={[styles.tileHint, dir.text, { color: colors.textSecondary }]}>{o.hint}</Text>
            </View>
            <View style={[styles.tick, { borderColor: on ? colors.primary : colors.textSecondary, backgroundColor: on ? colors.primary : 'transparent' }]}>
              {on ? <Icon name="check" size={14} color={colors.textOnPrimary} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A seat's name in a lobby, as the game screen already shows it. */
export type SeatName = (seat: number) => string;

/**
 * The lobby's Rated/Friendly panel: the badge for everyone, the host's switch and, while Rated, the expected change per
 * opponent ("Win ≈ +24 · Lose ≈ −8") or why it would play as friendly if started now. Everyone else is told the host
 * may change it, and that they may then leave without penalty.
 *
 * `players` is the lobby's head count: the expected gains are asked again whenever someone comes or goes, and when the
 * badge changes.
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
  /** The lobby changed (refetch its view). */
  onChanged: () => void;
}): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
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
      <View style={[styles.panelHead, { flexDirection: dir.row }]}>
        <RatedPill rated={isRated} />
        <Text style={[styles.panelHint, dir.text, { color: colors.textSecondary }]}>
          {isRated ? t('ranks.ratedHint') : t('ranks.friendlyHint')}
        </Text>
      </View>

      {isHost ? (
        // The app's own switch in its violet; the whole line toggles it, its words as well as the switch.
        <ToggleRow label={t('ranks.lobby.ratedSwitch')} value={isRated} onValueChange={(next) => void change(next)} disabled={busy}>
          <Text style={[styles.switchLabel, dir.text, { color: colors.textPrimary }]}>{t('ranks.lobby.ratedSwitch')}</Text>
        </ToggleRow>
      ) : (
        <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('ranks.lobby.canLeave')}</Text>
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

  choice: { gap: spacing.sm },
  tile: { alignItems: 'center', gap: spacing.md - 4, minHeight: 64, borderRadius: radii.md, borderWidth: 2, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md - 4 },
  tileText: { flex: 1, gap: 2 },
  tileTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  tileHint: { fontSize: typography.sizes.sm, lineHeight: 19 },
  tick: { width: 22, height: 22, borderRadius: radii.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },

  panel: { alignSelf: 'stretch', borderRadius: radii.md, padding: spacing.md, gap: spacing.sm, marginTop: spacing.sm },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  panelHint: { flex: 1, fontSize: typography.sizes.sm },
  switchLabel: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  note: { fontSize: typography.sizes.sm, lineHeight: 19 },
  flex: { flex: 1 },
  friendlyNow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  gains: { gap: spacing.sm },
  gainRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  gainName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  gainRank: { fontSize: typography.sizes.xs },
  gainLine: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
});
