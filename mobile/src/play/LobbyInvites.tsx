import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { OutgoingInviteState, PlayGame } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useRealtimeReconnect } from '../realtime/RealtimeProvider';
import { useUserEvents } from '../realtime/useUserEvents';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { SectionLabel } from '../stories/ui';
import { cancelInvite, inviteFriends, listInvites } from './api';

/** What the host is told about each friend asked (never more than the soft wording). */
export function inviteStateKey(invite: Pick<OutgoingInviteState, 'status' | 'declineReason'>): TranslationKey | null {
  switch (invite.status) {
    case 'pending':
      return 'play.invited.pending';
    case 'accepted':
      return 'play.invited.joined';
    case 'declined':
      return invite.declineReason === 'not_this_game' ? 'play.invited.otherGame' : 'play.invited.later';
    case 'expired':
      return 'play.invited.expired';
    case 'cancelled':
      return null;
  }
}

const STATE_ICON: Record<OutgoingInviteState['status'], IconName> = {
  pending: 'mail',
  accepted: 'check',
  declined: 'close',
  expired: 'timer',
  cancelled: 'close',
};

/**
 * The lobby's "Invited" list, for the host (contract §B1): each friend asked
 * and where they are — waiting (with Cancel), joined, can't play right now /
 * would rather play something else, or expired (with Invite again). It keeps
 * itself up to date from `play_invite_update` and `play_changed`, and asks
 * again after the connection comes back.
 */
export function LobbyInvites({ game, lobbyId, refreshKey = 0 }: { game: PlayGame; lobbyId: string; refreshKey?: number }): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [invitees, setInvitees] = useState<OutgoingInviteState[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    void listInvites(client).then((res) => {
      if (!res.ok) return;
      const mine = res.data.outgoing.find((o) => o.game === game && o.lobbyId === lobbyId);
      setInvitees(mine ? mine.invitees : []);
    });
  }, [client, game, lobbyId]);

  useEffect(load, [load, refreshKey]);
  useRealtimeReconnect(load);
  useUserEvents(
    useCallback(
      (ev) => {
        if (ev.type === 'play_invite_update') load();
        else if (ev.type === 'play_changed' && ev.game === game && ev.lobbyId === lobbyId) load();
      },
      [load, game, lobbyId],
    ),
  );

  // a friend who came in is in the players list already; one taken back is nobody's business
  const shown = invitees.filter((i) => i.status !== 'cancelled' && i.status !== 'accepted');
  if (shown.length === 0) return null;

  const act = async (invite: OutgoingInviteState): Promise<void> => {
    setBusy(invite.inviteId);
    if (invite.status === 'pending') await cancelInvite(client, invite.inviteId);
    else await inviteFriends(client, game, lobbyId, [invite.userId]);
    setBusy(null);
    load();
  };

  return (
    <View style={styles.wrap}>
      <SectionLabel>{t('play.invited.title')}</SectionLabel>
      {shown.map((i) => {
        const key = inviteStateKey(i);
        // a "not now" is not asked again from here: the server waits a while before it would pass it on
        const action = i.status === 'pending' ? t('play.invited.cancel') : i.status === 'expired' ? t('play.invited.again') : null;
        return (
          <View key={i.inviteId} style={styles.row}>
            <InitialsAvatar name={i.name} id={i.userId} size={32} photoUrl={i.avatarUrl} />
            <View style={styles.main}>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                {i.name}
              </Text>
              {key ? (
                <View style={styles.state}>
                  <Icon name={STATE_ICON[i.status]} size={12} color={i.status === 'accepted' ? colors.success : colors.textSecondary} />
                  <Text style={[styles.stateText, { color: i.status === 'accepted' ? colors.success : colors.textSecondary }]}>{t(key)}</Text>
                </View>
              ) : null}
            </View>
            {action ? (
              <Pressable
                onPress={() => void act(i)}
                disabled={busy === i.inviteId}
                accessibilityRole="button"
                accessibilityLabel={`${action}: ${i.name}`}
                style={[styles.action, { backgroundColor: colors.controlTrack, opacity: busy === i.inviteId ? 0.5 : 1 }]}
              >
                <Text style={[styles.actionText, { color: i.status === 'pending' ? colors.textSecondary : colors.primary }]}>{action}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  main: { flex: 1, gap: 2 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  state: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stateText: { fontSize: typography.sizes.sm },
  action: { minHeight: MIN_TOUCH_TARGET, borderRadius: radii.pill, paddingHorizontal: spacing.md, justifyContent: 'center' },
  actionText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});
