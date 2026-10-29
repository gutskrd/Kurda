import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, TextInput, View } from 'react-native';
import { GROUP_REQUEST_NOTE_MAX, type GroupRequestState, type GroupStanding } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { noticeTime } from '../notifications/inbox';
import { useDirection } from '../reports/direction';
import { formatDay, formatUntil } from '../reports/sendErrors';
import { BottomSheet } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { askToRejoin, joinGroup, withdrawRejoin } from './api';
import { groupError } from './groupError';
import { CalmCard } from './Welcome';

/** The group as the card shows it. */
interface CardGroup {
  id: string;
  name: string;
  photoUrl: string | null;
  privacy: 'open' | 'invite';
}

/**
 * Where someone who is not in a group stands with it, in place of the chat.
 *
 * Shown to someone who opens a group they are out of (from a notification, a
 * link, the discover list), and to someone removed or banned while the chat
 * was open (`left`: "You're no longer in this group"), never as a raw error.
 *
 * Out and free to come in: an open group has Join; an invite-only one says an
 * admin can add them. Banned: until when, or for good, the reason if one was
 * given, and where asking to come back stands — ask (a sheet with a note for
 * the admins), the request waiting with a way to withdraw it, the day they may
 * ask again, or that the admins are not taking requests from them.
 */
export function StandingCard({
  group,
  standing,
  left,
  onStanding,
  onJoined,
  onReload,
}: {
  group: CardGroup;
  standing: Exclude<GroupStanding, { kind: 'member' }>;
  left: boolean;
  /** the standing changed here (a request sent or withdrawn) */
  onStanding: (standing: GroupStanding) => void;
  onJoined: () => void;
  /** ask the server where the reader stands, when an answer says it changed */
  onReload: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const banned = standing.kind === 'banned' ? standing : null;
  const bannedLine = banned
    ? banned.until
      ? t('groups.standing.bannedUntil', { date: formatUntil(banned.until, locale) })
      : t('groups.standing.bannedForGood')
    : null;
  const heading = left ? t('groups.standing.gone') : (bannedLine ?? t('groups.standing.out'));

  const join = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await joinGroup(client, group.id);
    setBusy(false);
    if (res.ok) {
      haptic('correct');
      onJoined();
      return;
    }
    haptic('wrong');
    // banned since the card was drawn: the card learns how
    if (res.error.code === 'GROUP_BANNED') onReload();
    else setError(groupError(res.error, t));
  };

  const withdraw = async (): Promise<void> => {
    if (!banned) return;
    setBusy(true);
    setError(null);
    const res = await withdrawRejoin(client, group.id);
    setBusy(false);
    if (!res.ok) {
      haptic('wrong');
      setError(groupError(res.error, t));
      return;
    }
    haptic('correct');
    AccessibilityInfo.announceForAccessibility?.(t('groups.standing.withdrawn'));
    onStanding({ ...banned, request: { kind: 'can_ask' } });
  };

  return (
    <CalmCard group={group}>
      <Text style={[styles.heading, { color: colors.textPrimary }]} accessibilityRole="header">
        {heading}
      </Text>
      {left && bannedLine ? <Text style={[styles.line, { color: colors.textPrimary }]}>{bannedLine}</Text> : null}
      {banned?.reason ? <Text style={[styles.line, { color: colors.textSecondary }]}>{t('groups.standing.reason', { reason: banned.reason })}</Text> : null}

      {banned ? (
        <RequestPart request={banned.request} busy={busy} onAsk={() => setAsking(true)} onWithdraw={() => void withdraw()} when={(iso) => noticeTime(iso, t, locale)} day={(iso) => formatDay(iso, locale)} />
      ) : group.privacy === 'open' ? (
        <>
          <Text style={[styles.line, { color: colors.textSecondary }]}>{t('groups.standing.joinOpen')}</Text>
          <ClayButton label={t('groups.standing.join')} tone="primary" busy={busy} onPress={() => void join()} style={styles.action} />
        </>
      ) : (
        <Text style={[styles.line, { color: colors.textSecondary }]}>{t('groups.standing.joinInvite')}</Text>
      )}

      {error ? (
        <Text style={[styles.line, { color: colors.danger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      {banned ? (
        <AskSheet
          visible={asking}
          groupId={group.id}
          onClose={() => setAsking(false)}
          onAnswer={(request) => {
            setAsking(false);
            if (request) onStanding({ ...banned, request });
            else onReload();
          }}
        />
      ) : null}
    </CalmCard>
  );
}

/** Where asking to come back stands, and what can be done about it now. */
function RequestPart({
  request,
  busy,
  onAsk,
  onWithdraw,
  when,
  day,
}: {
  request: GroupRequestState;
  busy: boolean;
  onAsk: () => void;
  onWithdraw: () => void;
  when: (iso: string) => string;
  day: (iso: string) => string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  switch (request.kind) {
    case 'can_ask':
      return <ClayButton label={t('groups.standing.ask')} tone="primary" onPress={onAsk} style={styles.action} />;
    case 'pending':
      return (
        <>
          <Text style={[styles.line, styles.state, { color: colors.textPrimary }]}>{t('groups.standing.pending', { when: when(request.sentAt) })}</Text>
          <ClayButton label={t('groups.standing.withdraw')} variant="outline" busy={busy} onPress={onWithdraw} style={styles.action} />
        </>
      );
    case 'wait':
      return <Text style={[styles.line, styles.state, { color: colors.textPrimary }]}>{t('groups.standing.wait', { date: day(request.until) })}</Text>;
    case 'closed':
      return <Text style={[styles.line, styles.state, { color: colors.textPrimary }]}>{t('groups.standing.closed')}</Text>;
  }
}

/**
 * Asking to come back: an optional note the admins will read, and Send.
 *
 * `onAnswer` gets where the request now stands — waiting, or, when the server
 * says so instead, a wait or requests closed — or null when the standing
 * itself moved (no longer banned, a request already waiting) and should be
 * asked for again. Anything else (asking too often today) stays in the sheet.
 */
function AskSheet({
  visible,
  groupId,
  onClose,
  onAnswer,
}: {
  visible: boolean;
  groupId: string;
  onClose: () => void;
  onAnswer: (request: GroupRequestState | null) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setError(null);
  }, [visible]);

  const send = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await askToRejoin(client, groupId, note.trim() || null);
    setBusy(false);
    if (res.ok) {
      haptic('correct');
      AccessibilityInfo.announceForAccessibility?.(t('groups.standing.sent'));
      setNote('');
      onAnswer(res.data.request);
      return;
    }
    haptic('wrong');
    const until = (res.error.details as { until?: unknown } | undefined)?.until;
    if (res.error.code === 'REQUEST_WAIT' && typeof until === 'string') onAnswer({ kind: 'wait', until });
    else if (res.error.code === 'REQUESTS_CLOSED') onAnswer({ kind: 'closed' });
    else if (res.error.code === 'REQUEST_PENDING' || res.error.code === 'NOT_BANNED' || res.error.code === 'REQUEST_WAIT') onAnswer(null);
    else setError(groupError(res.error, t));
  };

  const label = t('groups.standing.note');
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('groups.standing.ask')} dismissible={!busy}>
      <View style={[styles.fieldTop, { flexDirection: dir.row }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.count, { color: note.length >= GROUP_REQUEST_NOTE_MAX ? colors.goldText : colors.textSecondary }]} accessibilityElementsHidden importantForAccessibility="no">
          {`${note.length}/${GROUP_REQUEST_NOTE_MAX}`}
        </Text>
      </View>
      <TextInput
        value={note}
        onChangeText={setNote}
        maxLength={GROUP_REQUEST_NOTE_MAX}
        multiline
        accessibilityLabel={label}
        accessibilityHint={t('groups.standing.noteHint')}
        style={[styles.input, dir.free, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}
      />
      <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t('groups.standing.noteHint')}</Text>
      {error ? (
        <Text style={[styles.hint, dir.text, { color: colors.danger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <ClayButton label={t('groups.standing.send')} tone="primary" size="large" busy={busy} onPress={() => void send()} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, textAlign: 'center', lineHeight: 23 },
  line: { fontSize: typography.sizes.sm, lineHeight: 21, textAlign: 'center' },
  state: { marginTop: spacing.sm },
  action: { alignSelf: 'stretch', marginTop: spacing.sm },
  fieldTop: { justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  count: { fontSize: typography.sizes.xs, fontVariant: ['tabular-nums'] },
  input: { minHeight: 96, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.sizes.md, textAlignVertical: 'top' },
  hint: { fontSize: typography.sizes.sm, lineHeight: 20 },
});
