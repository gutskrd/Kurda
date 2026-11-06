import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
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
import { useDirection } from '../reports/direction';
import { SectionLabel } from '../stories/ui';
import { cancelInvite, inviteFriends, listInvites } from './api';
import { Ticket, TicketStamp } from './Ticket';

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
 *
 * Each friend asked holds one of the host's tickets (Ticket.tsx), their face
 * on its stub. A ticket still waiting is drawn in outline, with a light
 * crossing it now and then (only while the lobby is in front); one taken up
 * is stamped "Joined", the stamp dropping in as it happens; one turned down
 * or run out is greyed, with the reason under the name. One taken back is
 * nobody's business, and is not shown.
 */
export function LobbyInvites({ game, lobbyId, refreshKey = 0 }: { game: PlayGame; lobbyId: string; refreshKey?: number }): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [invitees, setInvitees] = useState<OutgoingInviteState[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  /*
   * The invites as this lobby first saw them: one that was taken up before
   * the host got here wears its stamp already; one taken up while they wait
   * gets it dropped on.
   */
  const firstSeen = useRef<Map<string, OutgoingInviteState['status']> | null>(null);

  const load = useCallback(() => {
    void listInvites(client).then((res) => {
      if (!res.ok) return;
      const mine = res.data.outgoing.find((o) => o.game === game && o.lobbyId === lobbyId);
      const list = mine ? mine.invitees : [];
      firstSeen.current ??= new Map(list.map((i) => [i.inviteId, i.status]));
      setInvitees(list);
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

  // one taken back is nobody's business
  const shown = invitees.filter((i) => i.status !== 'cancelled');
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
        const pending = i.status === 'pending';
        const joined = i.status === 'accepted';
        // a "not now" is not asked again from here: the server waits a while before it would pass it on
        const action = pending ? t('play.invited.cancel') : i.status === 'expired' ? t('play.invited.again') : null;
        const landed = joined && firstSeen.current?.get(i.inviteId) !== 'accepted';
        return (
          <View key={i.inviteId} style={[styles.row, { flexDirection: dir.row }]}>
            <Ticket
              tone={game}
              size="mini"
              outlined={pending}
              shimmer={pending}
              muted={!pending && !joined}
              stub={<InitialsAvatar name={i.name} id={i.userId} size={28} photoUrl={i.avatarUrl} />}
              style={styles.ticket}
              bodyStyle={[styles.body, { flexDirection: dir.row }]}
            >
              <View style={styles.main}>
                <Text style={[styles.name, dir.free, { color: joined || pending ? colors.textPrimary : colors.textSecondary }]} numberOfLines={1}>
                  {i.name}
                </Text>
                {key && !joined ? (
                  <View style={[styles.state, { flexDirection: dir.row }]}>
                    <Icon name={STATE_ICON[i.status]} size={12} color={colors.textSecondary} />
                    <Text style={[styles.stateText, dir.text, { color: colors.textSecondary }]} numberOfLines={2}>
                      {t(key)}
                    </Text>
                  </View>
                ) : null}
              </View>
              {joined ? <TicketStamp label={t('play.invited.joined')} tone="success" land={landed} /> : null}
            </Ticket>
            {action ? (
              <PressableScale
                onPress={() => void act(i)}
                disabled={busy === i.inviteId}
                accessibilityRole="button"
                accessibilityLabel={`${action}: ${i.name}`}
                style={[styles.action, { backgroundColor: colors.controlTrack, opacity: busy === i.inviteId ? 0.5 : 1 }]}
              >
                <Text style={[styles.actionText, { color: pending ? colors.textSecondary : colors.primary }]}>{action}</Text>
              </PressableScale>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  ticket: { flex: 1 },
  body: { alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  main: { flex: 1, gap: 2 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  state: { alignItems: 'center', gap: 4 },
  stateText: { flexShrink: 1, fontSize: typography.sizes.sm },
  action: { minHeight: MIN_TOUCH_TARGET, borderRadius: radii.pill, paddingHorizontal: spacing.md, justifyContent: 'center' },
  actionText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});
