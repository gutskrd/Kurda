import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { FAMILY_CODE_LENGTH, MAX_CHILDREN_PER_PARENT, formatFamilyCode, normalizeFamilyCode, type FamilyRole } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { describeError } from '../api/errors';
import { sayNotSaved } from '../api/optimistic';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import type { TranslationKey } from '../i18n/translations';
import type { RootNavigation } from '../navigation/rootStack';
import { lessonsLabel } from '../parental/format';
import { Hero, PersonRow } from '../parental/parts';
import { Avatar } from '../profile/Avatar';
import { useDirection } from '../reports/direction';
import { SettingsNote, SettingsNotRead, SettingsRow, SettingsSection } from '../settings/list';
import { BottomSheet } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import { Loading } from '../theme/Loading';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import {
  addTeen,
  answerAsk,
  endFamily,
  joinFamily,
  leaveFamily,
  makeInvite,
  readAsks,
  removeMember,
  startFamily,
  type FamilyMember,
  type FamilyOverview,
  type NotAdultReason,
  type PurchaseRequest,
  type TimedCode,
} from './api';
import { forgetFamily, keepFamily, useFamily } from './overview';
import { CodeCard, FormError, asPerson } from './parts';
import { PinSheet } from './PinSheet';

/** How each part in a family is named under a member's name. */
const ROLE_KEY: Record<FamilyRole, TranslationKey> = {
  owner: 'family.role.owner',
  adult: 'family.role.adult',
  teen: 'family.role.teen',
  child: 'family.role.child',
};

/** Why the family page is not an adult's for this account, in one line each. */
const NOT_ADULT_KEY: Record<NotAdultReason, TranslationKey> = {
  guest: 'family.none.guest',
  birth_month: 'family.none.birthMonth',
  email: 'family.none.email',
  standing: 'family.none.standing',
  minor: 'family.none.minor',
  child: 'family.none.minor',
  leaving: 'family.none.standing',
};

/**
 * Settings → Family. An adult with no family is told what one is and can add a child, start a family or join one
 * with a code; in a family, the page lists the caller's children with today's numbers, the family's week of XP (which
 * nobody outside it sees), everyone in it, what a child asked for, and the family PIN, with the owner's ways to invite
 * an adult, add a teen and take people out. A teen in a family sees it and can leave.
 */
export function FamilyPage(): React.JSX.Element {
  const { overview, failed, reload } = useFamily();
  if (!overview) return failed ? <SettingsNotRead failed={failed} retry={reload} /> : <Loading style={styles.loading} />;
  if (!overview.family && !overview.adult) return <NotForYou reason={overview.reason ?? null} />;
  if (!overview.family) return <NoFamilyYet overview={overview} onChanged={reload} />;
  return <FamilyHome overview={overview} onChanged={reload} />;
}

function NotForYou({ reason }: { reason: NotAdultReason | null }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  return (
    <Hero icon="people" title={t('family.title')} body={t(reason ? NOT_ADULT_KEY[reason] : 'family.none.standing')}>
      {reason === 'guest' ? <ClayButton label={t('guest.createAccount')} tone="primary" size="large" onPress={() => navigation.navigate('ClaimAccount')} /> : null}
    </Hero>
  );
}

/** An adult in no family: what a family is, and the three ways in. */
function NoFamilyYet({ overview, onChanged }: { overview: FamilyOverview; onChanged: () => void }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client, user } = useAuth();
  const { t } = useI18n();
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const start = (): void => {
    setStarting(true);
    void startFamily(client).then((res) => {
      setStarting(false);
      if (res.ok && user) keepFamily(user.id, res.data);
      else if (!res.ok) sayNotSaved(res.error, t);
      onChanged();
    });
  };
  return (
    <>
      <Hero icon="people" title={t('family.title')} body={t('family.intro')}>
        <ClayButton
          label={t('family.addChild')}
          icon="user-plus"
          tone="primary"
          size="large"
          onPress={() => navigation.navigate('SettingsPage', { page: 'familyAddChild' })}
          testID="family-add-child"
        />
        <ClayButton label={t('family.start')} variant="outline" busy={starting} onPress={start} testID="family-start" />
        <ClayButton label={t('family.join')} variant="outline" onPress={() => setJoining(true)} testID="family-join" />
      </Hero>
      {overview.children.length > 0 ? <ChildrenSection overview={overview} /> : null}
      <JoinSheet visible={joining} onClose={() => setJoining(false)} onJoined={onChanged} />
    </>
  );
}

/** The caller's own children, each opening their page, and the way to add another. */
function ChildrenSection({ overview, first = false }: { overview: FamilyOverview; first?: boolean }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  const full = overview.children.length >= MAX_CHILDREN_PER_PARENT;
  return (
    <SettingsSection title={t('family.children')} first={first} footer={t('family.children.footer')}>
      {overview.children.map((c) => (
        <PersonRow
          key={c.userId}
          person={asPerson(c)}
          detail={c.canConvert ? t('family.child.thirteen') : t('parental.todayLine', { minutes: c.today.minutes, lessons: lessonsLabel(c.today.lessons, t) })}
          onPress={() => navigation.navigate('SettingsPage', { page: 'familyChild', teenId: c.userId })}
          testID={`family-child-${c.userId}`}
        />
      ))}
      {full || !overview.adult ? null : (
        <SettingsRow icon="user-plus" title={t('family.addChild')} onPress={() => navigation.navigate('SettingsPage', { page: 'familyAddChild' })} testID="family-add-child" />
      )}
    </SettingsSection>
  );
}

function FamilyHome({ overview, onChanged }: { overview: FamilyOverview; onChanged: () => void }): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const family = overview.family!;
  const owner = overview.role === 'owner';
  const full = family.size >= family.max;
  const [invite, setInvite] = useState<TimedCode | 'making' | null>(null);
  const [teens, setTeens] = useState(false);
  const [pin, setPin] = useState(false);
  const [member, setMember] = useState<FamilyMember | null>(null);
  const [leaving, setLeaving] = useState<'ask' | 'busy' | null>(null);
  const [asks, setAsks] = useState<PurchaseRequest[] | null>(null);

  // What a child asked for, read when there is something to answer.
  const loadAsks = useCallback((): void => {
    void readAsks(client).then((res) => {
      if (res.ok) setAsks(res.data.requests.filter((r) => r.status === 'pending'));
    });
  }, [client]);
  useEffect(() => {
    if (overview.asks > 0) loadAsks();
    else setAsks(null);
  }, [overview.asks, loadAsks]);

  const openInvite = (): void => {
    setInvite('making');
    void makeInvite(client).then((res) => {
      if (res.ok) setInvite(res.data);
      else {
        setInvite(null);
        sayNotSaved(res.error, t);
      }
    });
  };
  const leave = (): void => {
    setLeaving('busy');
    void (owner ? endFamily(client) : leaveFamily(client)).then((res) => {
      setLeaving(null);
      if (!res.ok) {
        haptic('error');
        sayNotSaved(res.error, t);
        return;
      }
      forgetFamily();
      onChanged();
    });
  };
  const answer = (request: PurchaseRequest, how: 'approve' | 'decline'): void => {
    haptic('tap');
    void answerAsk(client, request.id, how).then((res) => {
      if (!res.ok) sayNotSaved(res.error, t);
      loadAsks();
      onChanged();
    });
  };

  const mine = new Set(overview.children.map((c) => c.userId));
  return (
    <>
      <ChildrenSection overview={overview} first />

      {asks && asks.length > 0 ? (
        <SettingsSection title={t('family.asks')} footer={t('family.asks.footer')}>
          {asks.map((r) => (
            <View key={r.id} style={styles.ask} testID={`family-ask-${r.id}`}>
              <Text style={[styles.askText, dir.text, { color: colors.textPrimary }]}>{t(`family.asks.${r.kind}`, { name: r.childName })}</Text>
              <View style={[styles.askButtons, { flexDirection: dir.row }]}>
                <ClayButton label={t('family.asks.yes')} variant="outline" onPress={() => answer(r, 'approve')} style={styles.askButton} />
                <ClayButton label={t('family.asks.no')} variant="outline" onPress={() => answer(r, 'decline')} style={styles.askButton} />
              </View>
            </View>
          ))}
        </SettingsSection>
      ) : null}

      <SettingsSection title={t('family.board')} footer={t('family.board.footer')}>
        {family.board.map((row, i) => (
          <View key={row.userId} style={[styles.boardRow, { flexDirection: dir.row }]} testID={`family-board-${i}`}>
            <Text style={[styles.rank, { color: colors.textSecondary }]}>{formatNumber(i + 1, locale)}</Text>
            <Avatar name={row.name} photoUrl={row.avatarUrl} size={36} />
            <Text style={[styles.boardName, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
              {row.userId === user?.id ? t('family.board.you', { name: row.name }) : row.name}
            </Text>
            <Text style={[styles.xp, { color: colors.textPrimary }]}>{t('family.board.xp', { xp: formatNumber(row.xp, locale) })}</Text>
          </View>
        ))}
      </SettingsSection>

      <SettingsSection title={t('family.members', { count: family.size, max: family.max })}>
        {family.members
          .filter((m) => !mine.has(m.userId))
          .map((m) => (
            <PersonRow
              key={m.userId}
              person={asPerson(m)}
              detail={m.userId === user?.id ? t('family.you', { role: t(ROLE_KEY[m.role]) }) : t(ROLE_KEY[m.role])}
              onPress={owner && m.userId !== user?.id ? () => setMember(m) : undefined}
              testID={`family-member-${m.userId}`}
            />
          ))}
        {owner && !full ? <SettingsRow icon="mail" title={t('family.invite')} subtitle={t('family.invite.hint')} onPress={openInvite} testID="family-invite" /> : null}
        {owner && !full && overview.teensToAdd.length > 0 ? (
          <SettingsRow icon="user-plus" title={t('family.addTeen')} subtitle={t('family.addTeen.hint')} onPress={() => setTeens(true)} testID="family-add-teen" />
        ) : null}
      </SettingsSection>
      {full ? <SettingsNote>{t('family.full', { max: family.max })}</SettingsNote> : null}

      {overview.adult ? (
        <SettingsSection title={t('family.pin.title')} footer={t('family.pin.footer')}>
          <SettingsRow icon="lock" title={t('family.pin.label')} value={overview.pinSet ? t('family.pin.isSet') : t('family.pin.notSet')} onPress={() => setPin(true)} testID="family-pin" />
        </SettingsSection>
      ) : null}

      <SettingsSection>
        <SettingsRow icon="sign-out" title={owner ? t('family.end') : t('family.leave')} destructive opens={false} onPress={() => setLeaving('ask')} testID="family-leave" />
      </SettingsSection>

      <BottomSheet visible={invite !== null} onClose={() => setInvite(null)} title={t('family.invite')} testID="family-invite-sheet">
        <View style={styles.sheet}>
          <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('family.invite.lead')}</Text>
          {invite && invite !== 'making' ? (
            <>
              <CodeCard code={formatFamilyCode(invite.code)} label={t('family.invite')} valid={t('family.invite.valid')} testID="family-invite-code" />
              <ClayButton
                label={t('share.title')}
                icon="share"
                variant="outline"
                onPress={() => void Share.share({ message: t('family.invite.shareText', { code: formatFamilyCode(invite.code) }) }).catch(() => undefined)}
              />
            </>
          ) : (
            <Loading style={styles.loading} />
          )}
        </View>
      </BottomSheet>

      <BottomSheet visible={teens} onClose={() => setTeens(false)} title={t('family.addTeen')} testID="family-teens-sheet">
        <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('family.addTeen.lead')}</Text>
        {overview.teensToAdd.map((teen) => (
          <PersonRow
            key={teen.userId}
            person={asPerson(teen)}
            onPress={() => {
              void addTeen(client, teen.userId).then((res) => {
                setTeens(false);
                if (res.ok && user) keepFamily(user.id, res.data);
                else if (!res.ok) sayNotSaved(res.error, t);
              });
            }}
          />
        ))}
      </BottomSheet>

      <BottomSheet visible={member !== null} onClose={() => setMember(null)} title={member ? t('family.remove.title', { name: member.name }) : ''} testID="family-remove-sheet">
        <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>
          {member?.role === 'adult' ? t('family.remove.adult', { name: member.name }) : t('family.remove.body', { name: member?.name ?? '' })}
        </Text>
        <View style={styles.actions}>
          <ClayButton
            label={t('family.remove.confirm')}
            tone="danger"
            size="large"
            onPress={() => {
              const who = member!;
              void removeMember(client, who.userId).then((res) => {
                setMember(null);
                if (!res.ok) sayNotSaved(res.error, t);
                onChanged();
              });
            }}
            testID="family-remove-confirm"
          />
          <ClayButton label={t('common.cancel')} variant="outline" onPress={() => setMember(null)} />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={leaving !== null}
        onClose={() => setLeaving(null)}
        dismissible={leaving !== 'busy'}
        title={owner ? t('family.end') : t('family.leave')}
        testID="family-leave-sheet"
      >
        <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{owner ? t('family.end.body') : t('family.leave.body')}</Text>
        <View style={styles.actions}>
          <ClayButton label={owner ? t('family.end') : t('family.leave')} tone="danger" size="large" busy={leaving === 'busy'} onPress={leave} testID="family-leave-confirm" />
          <ClayButton label={t('common.cancel')} variant="outline" disabled={leaving === 'busy'} onPress={() => setLeaving(null)} />
        </View>
      </BottomSheet>

      <PinSheet
        visible={pin}
        hasPin={overview.pinSet}
        onClose={() => setPin(false)}
        onSet={() => {
          setPin(false);
          onChanged();
        }}
      />
    </>
  );
}

/** An adult joining a family with the owner's code. */
function JoinSheet({ visible, onClose, onJoined }: { visible: boolean; onClose: () => void; onJoined: () => void }): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = normalizeFamilyCode(typed);
  const join = async (): Promise<void> => {
    if (!code) return;
    setBusy(true);
    setError(null);
    const res = await joinFamily(client, code);
    setBusy(false);
    if (!res.ok) {
      haptic('error');
      setError(describeError(res.error, t));
      return;
    }
    haptic('celebrate');
    if (user) keepFamily(user.id, res.data);
    setTyped('');
    onClose();
    onJoined();
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} dismissible={!busy} title={t('family.join')} testID="family-join-sheet">
      <View style={styles.sheet}>
        <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('family.join.lead')}</Text>
        <TextInput
          value={typed}
          onChangeText={(text) => setTyped(text.toUpperCase())}
          onSubmitEditing={() => void join()}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          maxLength={FAMILY_CODE_LENGTH + 4}
          accessibilityLabel={t('family.join.label')}
          testID="family-join-input"
          style={[styles.field, { color: colors.textPrimary, backgroundColor: colors.controlTrack, borderColor: error ? colors.danger : 'transparent' }]}
        />
        {error ? <FormError text={error} /> : null}
        <ClayButton label={t('family.join.action')} tone="primary" size="large" busy={busy} disabled={!code} onPress={() => void join()} testID="family-join-go" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  loading: { paddingTop: spacing.xl },
  sheet: { gap: spacing.md, paddingTop: spacing.xs },
  lead: { fontSize: typography.sizes.text, lineHeight: 22 },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  ask: { padding: spacing.sm + 4, gap: spacing.sm },
  askText: { fontSize: typography.sizes.text, lineHeight: 22 },
  askButtons: { gap: spacing.sm },
  askButton: { flex: 1 },
  boardRow: { alignItems: 'center', gap: spacing.sm + 4, minHeight: 56, paddingHorizontal: spacing.sm + 4, paddingVertical: spacing.xs },
  rank: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, minWidth: 20, textAlign: 'center', fontVariant: ['tabular-nums'] },
  boardName: { flex: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  xp: { fontSize: typography.sizes.text, fontVariant: ['tabular-nums'] },
  field: {
    minHeight: MIN_TOUCH_TARGET + 20,
    borderRadius: radii.lg,
    borderWidth: 2,
    paddingHorizontal: spacing.md,
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.semibold,
    letterSpacing: 4,
    textAlign: 'center',
  },
});
