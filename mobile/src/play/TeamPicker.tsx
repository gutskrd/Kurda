import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MultiGame, MultiSeat, UnitTone } from '@kurda/shared';
import type { Translate } from '../api/errors';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { TONES, type ToneColors } from '../coursemap/path';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { PlayerReportButton } from '../reports/PlayerReportButton';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { multiSeatName } from './GameRoom';

/**
 * Each team's colour, one of the path's tones (the same as the website's,
 * play/TeamPicker.tsx there), and its name: a team is always named as well as
 * coloured, so the colour is never the only way to tell them apart.
 */
export const TEAM_TONE: Readonly<Record<number, UnitTone>> = { 1: 'saffron', 2: 'river', 3: 'rose', 4: 'pine' };
const TEAM_KEY: Readonly<Record<number, TranslationKey>> = { 1: 'play.teams.team1', 2: 'play.teams.team2' };

export function teamName(team: number, t: Translate): string {
  const key = TEAM_KEY[team];
  return key ? t(key) : t('play.teams.teamN', { team });
}

/** A team's colours in the current scheme. */
export function useTeamTone(): (team: number | null | undefined) => ToneColors {
  const { scheme } = useTheme();
  return (team) => TONES[scheme][TEAM_TONE[team ?? 1] ?? 'saffron'];
}

/**
 * The teams of a team game's lobby, on the phone: one block per team in its
 * colour and name, each player by seat (a friend by name, anyone else as
 * "Player N") with a flag to report them, the host marked. A player moves
 * themselves with "Join" on the other team; the host can move anyone. It
 * stands where the lobby's list of people stands in a game without teams
 * (play/GameRoom.tsx).
 */
export function TeamPicker({
  players,
  teams,
  isHost,
  game,
  lobbyId,
  note,
  onTeam,
}: {
  players: readonly MultiSeat[];
  teams: number;
  isHost: boolean;
  game: MultiGame;
  lobbyId: string;
  note?: ReactNode;
  onTeam: (seat: number, team: number) => Promise<void>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const toneOf = useTeamTone();
  const [busy, setBusy] = useState(false);
  const present = players.filter((p) => !p.gone);
  const me = present.find((p) => p.isMe) ?? null;
  const numbers = Array.from({ length: teams }, (_, i) => i + 1);

  const move = async (seat: number, team: number): Promise<void> => {
    haptic('select');
    setBusy(true);
    try {
      await onTeam(seat, team);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.textPrimary }]}>
        {t('play.teams.title')}
      </Text>
      {note}
      {numbers.map((team) => {
        const tone = toneOf(team);
        const members = present.filter((p) => (p.team ?? 1) === team);
        const name = teamName(team, t);
        const others = numbers.filter((n) => n !== team);
        return (
          <View key={team} accessibilityLabel={`${name}, ${members.length}`} style={[styles.team, { borderColor: tone.fill }]}>
            <View style={styles.teamHead}>
              <View style={[styles.swatch, { backgroundColor: tone.fill }]} />
              <Text style={[styles.teamName, { color: tone.text }]}>{name}</Text>
              <Text style={[styles.count, { color: colors.textSecondary }]}>{members.length}</Text>
            </View>
            {members.length === 0 ? <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('play.teams.empty')}</Text> : null}
            {members.map((p) => {
              const who = multiSeatName(p, t);
              return (
                <View key={p.seat} style={styles.member}>
                  <InitialsAvatar name={p.name ?? String(p.seat)} id={`seat-${p.seat}`} size={30} photoUrl={p.avatarUrl} />
                  <Text style={[styles.memberName, { color: p.isMe ? tone.text : colors.textPrimary }]} numberOfLines={1}>
                    {who}
                  </Text>
                  {p.isHost ? <Icon name="crown" size={14} color={colors.gold} /> : null}
                  {isHost
                    ? others.map((to) => (
                        <Pressable
                          key={to}
                          disabled={busy}
                          onPress={() => void move(p.seat, to)}
                          accessibilityRole="button"
                          accessibilityLabel={t('play.teams.moveWho', { name: who, team: teamName(to, t) })}
                          style={({ pressed }) => [styles.moveBtn, { borderColor: toneOf(to).fill, opacity: pressed || busy ? 0.6 : 1 }]}
                        >
                          <Icon name="move-down" size={16} color={toneOf(to).text} />
                        </Pressable>
                      ))
                    : null}
                  {!p.isMe ? <PlayerReportButton game={game} gameId={lobbyId} seat={p.seat} name={p.name ?? null} /> : null}
                </View>
              );
            })}
            {me && (me.team ?? 1) !== team && !isHost ? (
              <Pressable
                disabled={busy}
                onPress={() => void move(me.seat, team)}
                accessibilityRole="button"
                accessibilityLabel={t('play.teams.join', { team: name })}
                style={({ pressed }) => [styles.join, { backgroundColor: tone.fill, opacity: pressed || busy ? 0.7 : 1 }]}
              >
                <Text style={[styles.joinText, { color: tone.ink }]}>{t('play.teams.join', { team: name })}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  heading: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  team: { borderWidth: 1.5, borderRadius: radii.md, padding: spacing.sm, gap: spacing.xs },
  teamHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  teamName: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  count: { fontSize: typography.sizes.sm },
  empty: { fontSize: typography.sizes.sm },
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  memberName: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  moveBtn: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  join: { minHeight: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, marginTop: spacing.xs },
  joinText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
