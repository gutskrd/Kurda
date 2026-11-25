import { useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { CHILD_NAME_MAX, MIN_CHILD_PROFILE_AGE, MIN_SIGNUP_AGE, childBirthYearChoices, isChildAge } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { describeError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { MonthChips } from '../auth/guide/MonthChips';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import type { TranslationKey } from '../i18n/translations';
import type { RootNavigation } from '../navigation/rootStack';
import { SuccessMoment } from '../parental/parts';
import { Avatar } from '../profile/Avatar';
import { avatarAssetUrl } from '../profile/cosmetics';
import { useDirection } from '../reports/direction';
import { SettingsPage } from '../settings/list';
import { ClayButton } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { addChild, type ChildSummary } from './api';
import { forgetFamily } from './overview';
import { FormError } from './parts';

/** Where the privacy policy says how Hevalo looks after children's data. */
export const CHILDREN_PRIVACY_URL = 'https://hevalo.app/privacy#children';

/** What the notice before consent says, each with its glyph: what is kept, what for, who handles it, and the parent's rights. */
const NOTICE: ReadonlyArray<{ key: TranslationKey; icon: IconName }> = [
  { key: 'family.add.notice.kept', icon: 'notebook' },
  { key: 'family.add.notice.not', icon: 'block' },
  { key: 'family.add.notice.use', icon: 'shield' },
  { key: 'family.add.notice.providers', icon: 'globe' },
  { key: 'family.add.notice.rights', icon: 'eye' },
];

/**
 * A parent makes a child's profile: a first name or nickname, the birth month and year (6 to 12), one of Hevalo's
 * avatars, and their consent, given by ticking the box under the notice of what is kept and why, then Create profile.
 * The server sends the parent an email confirming it, with a link to delete the profile.
 */
export function AddChildPage({ onExit }: { onExit: () => void }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [name, setName] = useState('');
  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatars, setAvatars] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<ChildSummary | null>(null);
  const years = useMemo(() => childBirthYearChoices(), []);

  useEffect(() => {
    let live = true;
    void client.get<{ avatars: Array<{ key: string; requiresPremium: boolean }> }>('/cosmetics/avatars').then((res) => {
      if (live && res.ok) setAvatars((res.data.avatars ?? []).filter((a) => !a.requiresPremium).map((a) => a.key));
    });
    return () => {
      live = false;
    };
  }, [client]);

  const birthOk = month !== null && year !== null && isChildAge({ year, month });
  // Said as soon as both are chosen, so a parent is not sent to the end of the form to learn it.
  const ageProblem = month !== null && year !== null && !birthOk ? t('family.add.ageInvalid', { min: MIN_CHILD_PROFILE_AGE, max: MIN_SIGNUP_AGE - 1 }) : null;
  const ready = name.trim().length > 0 && birthOk && avatar !== null && consent;

  const create = async (): Promise<void> => {
    if (!ready || month === null || year === null || avatar === null) return;
    setBusy(true);
    setError(null);
    const res = await addChild(client, { name: name.trim(), birthYear: year, birthMonth: month, avatar });
    setBusy(false);
    if (!res.ok) {
      haptic('error');
      setError(res.error.code === 'CHILD_AGE' ? t('family.add.ageInvalid', { min: MIN_CHILD_PROFILE_AGE, max: MIN_SIGNUP_AGE - 1 }) : describeError(res.error, t));
      return;
    }
    haptic('celebrate');
    forgetFamily();
    setMade(res.data.child);
  };

  return (
    <SettingsPage
      title={t('family.addChild')}
      onExit={onExit}
      overlay={
        made ? (
          <SuccessMoment
            text={t('family.add.made', { name: made.name })}
            onDone={() => navigation.replace('SettingsPage', { page: 'familyChild', teenId: made.userId })}
          />
        ) : null
      }
    >
      <View style={styles.page}>
        <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('family.add.lead')}</Text>

        <View style={styles.field}>
          <Text style={[styles.label, dir.text, { color: colors.textPrimary }]}>{t('family.add.name')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={CHILD_NAME_MAX}
            autoCapitalize="words"
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            accessibilityLabel={t('family.add.name')}
            accessibilityHint={t('family.add.nameHint')}
            testID="child-name"
            style={[styles.input, dir.text, { color: colors.textPrimary, backgroundColor: colors.glassFill }]}
          />
          <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t('family.add.nameHint')}</Text>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, dir.text, { color: colors.textPrimary }]}>{t('family.add.month')}</Text>
          <MonthChips value={month} onChange={setMonth} />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, dir.text, { color: colors.textPrimary }]}>{t('family.add.year')}</Text>
          <View style={[styles.chips, { flexDirection: dir.row }]} accessibilityRole="radiogroup" testID="child-years">
            {years.map((y) => {
              const chosen = y === year;
              return (
                <PressableScale
                  key={y}
                  onPress={() => {
                    if (!chosen) haptic('select');
                    setYear(y);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: chosen }}
                  style={[styles.chip, { backgroundColor: chosen ? colors.primary : colors.controlTrack }]}
                >
                  <Text style={[styles.chipText, { color: chosen ? colors.textOnPrimary : colors.textPrimary }]}>{yearLabel(y, locale)}</Text>
                </PressableScale>
              );
            })}
          </View>
          {ageProblem ? <FormError text={ageProblem} testID="child-age-problem" /> : null}
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, dir.text, { color: colors.textPrimary }]}>{t('family.add.avatar')}</Text>
          <View style={[styles.avatars, { flexDirection: dir.row }]} accessibilityRole="radiogroup">
            {avatars.map((key, i) => (
              <PressableScale
                key={key}
                onPress={() => {
                  haptic('select');
                  setAvatar(key);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: avatar === key }}
                accessibilityLabel={`${t('edit.avatar')} ${formatNumber(i + 1, locale)}`}
                style={[styles.avatarTile, { borderColor: avatar === key ? colors.primary : 'transparent', backgroundColor: colors.controlTrack }]}
                testID={`child-avatar-${key}`}
              >
                <Avatar name="" size={44} photoUrl={avatarAssetUrl(key)} />
              </PressableScale>
            ))}
          </View>
        </View>

        <View style={[styles.notice, { backgroundColor: colors.glassFill, shadowColor: colors.softShadow }]} testID="child-notice">
          <Text style={[styles.label, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
            {t('family.add.notice.title')}
          </Text>
          {NOTICE.map((n) => (
            <View key={n.key} style={[styles.point, { flexDirection: dir.row }]}>
              <Icon name={n.icon} size={20} color={colors.textSecondary} />
              <Text style={[styles.pointText, dir.text, { color: colors.textPrimary }]}>{t(n.key)}</Text>
            </View>
          ))}
          <ClayButton label={t('family.add.notice.read')} icon="link" variant="outline" onPress={() => void Linking.openURL(CHILDREN_PRIVACY_URL)} />
        </View>

        <PressableScale
          onPress={() => {
            haptic('select');
            setConsent((c) => !c);
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
          accessibilityLabel={t('family.add.consent')}
          style={[styles.consent, { flexDirection: dir.row }]}
          testID="child-consent"
        >
          <View style={[styles.box, { backgroundColor: consent ? colors.primary : colors.controlTrack }]}>
            {consent ? <Icon name="check" size={18} color={colors.textOnPrimary} /> : null}
          </View>
          <Text style={[styles.pointText, dir.text, { color: colors.textPrimary }]}>{t('family.add.consent')}</Text>
        </PressableScale>

        {error ? <FormError text={error} testID="child-error" /> : null}
        <ClayButton label={t('family.add.create')} tone="primary" size="large" busy={busy} disabled={!ready} onPress={() => void create()} testID="child-create" />
      </View>
    </SettingsPage>
  );
}

/** A year as the reader's digits write it, without a thousands mark ("2018", not "2,018"). */
function yearLabel(year: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { useGrouping: false }).format(year);
  } catch {
    return String(year);
  }
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: layout.gutter, paddingTop: spacing.md, gap: spacing.lg },
  lead: { fontSize: typography.sizes.text, lineHeight: 22 },
  field: { gap: spacing.sm },
  label: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  hint: { fontSize: typography.sizes.text, lineHeight: 20 },
  input: { minHeight: MIN_TOUCH_TARGET + 8, borderRadius: radii.md, paddingHorizontal: spacing.md, fontSize: typography.sizes.text },
  chips: { flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: MIN_TOUCH_TARGET, minWidth: 72, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, paddingHorizontal: spacing.md },
  chipText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  avatars: { flexWrap: 'wrap', gap: spacing.sm },
  avatarTile: { width: 56, height: 56, borderRadius: radii.md, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  notice: {
    gap: spacing.sm + 4,
    padding: spacing.md,
    borderRadius: radii.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  point: { alignItems: 'flex-start', gap: spacing.sm + 4 },
  pointText: { flex: 1, fontSize: typography.sizes.text, lineHeight: 22 },
  consent: { alignItems: 'center', gap: spacing.sm + 4, minHeight: MIN_TOUCH_TARGET },
  box: { width: 28, height: 28, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
});
