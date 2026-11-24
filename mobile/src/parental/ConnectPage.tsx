import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Animated, StyleSheet, Text, TextInput, View } from 'react-native';
import { PARENT_CODE_LENGTH, normalizeParentCode } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { describeError, isMaintenance } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import type { RootNavigation } from '../navigation/rootStack';
import { Avatar } from '../profile/Avatar';
import { useDirection } from '../reports/direction';
import { SettingsPage } from '../settings/list';
import { useShake } from '../theme/animate';
import { BottomSheet } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { connectParent, lookupParentCode, nameOf, type PersonRef } from './api';
import { shownParentCode, typedParentCode } from './format';
import { keepParentalOverview } from './overview';
import { SuccessMoment } from './parts';
import { useSupervision } from './supervision';

/** What a parent will be able to do and see, and what never, as the confirming sheet lists it. */
const PROMISES: ReadonlyArray<{ icon: IconName; key: TranslationKey }> = [
  { icon: 'timer', key: 'parental.confirm.limits' },
  { icon: 'shield', key: 'parental.confirm.switches' },
  { icon: 'eye', key: 'parental.confirm.sees' },
  { icon: 'eye-off', key: 'parental.confirm.never' },
];

/**
 * A teen connecting a parent: the code the parent made, typed or pasted into one field that draws it as two groups of
 * four as it fills, then the parent's face and names to be sure it is them, and what they will see. Confirming is the
 * teen's consent. A code that does not work says so under the field and keeps what was typed.
 */
export function ConnectPage({ onExit }: { onExit: () => void }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client, user } = useAuth();
  const { take } = useSupervision();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const shake = useShake();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [parent, setParent] = useState<PersonRef | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState<PersonRef | null>(null);

  const refuse = (why: string): void => {
    setError(why);
    haptic('error');
    shake.run();
  };

  const change = (text: string): void => {
    setTyped(typedParentCode(text));
    if (error) setError(null);
  };

  const lookUp = async (): Promise<void> => {
    const code = normalizeParentCode(typed);
    if (!code) {
      refuse(t('parental.error.code'));
      return;
    }
    setLooking(true);
    const res = await lookupParentCode(client, code);
    setLooking(false);
    if (res.ok) {
      haptic('tap');
      setParent(res.data.parent);
    } else if (!isMaintenance(res.error)) refuse(describeError(res.error, t));
  };

  const connect = async (): Promise<void> => {
    const code = normalizeParentCode(typed);
    if (!code || !parent) return;
    setConnecting(true);
    const res = await connectParent(client, code);
    setConnecting(false);
    if (!res.ok) {
      setParent(null);
      if (!isMaintenance(res.error)) refuse(describeError(res.error, t));
      return;
    }
    haptic('celebrate');
    take(res.data.supervision);
    if (user) keepParentalOverview(user.id, { role: 'teen', parents: res.data.parents, supervision: res.data.supervision });
    setParent(null);
    setConnected(parent);
  };

  const complete = typed.length === PARENT_CODE_LENGTH;
  return (
    <SettingsPage
      title={t('parental.teen.connect')}
      onExit={onExit}
      overlay={connected ? <SuccessMoment text={t('parental.connected', { name: nameOf(connected) })} onDone={() => navigation.goBack()} /> : null}
    >
      <View style={styles.page}>
        <Text style={[styles.label, dir.text, { color: colors.textPrimary }]}>{t('parental.code.label')}</Text>
        <Animated.View style={[styles.fieldWrap, { transform: [{ translateX: shake.translateX }] }]}>
          <TextInput
            value={shownParentCode(typed)}
            onChangeText={change}
            onSubmitEditing={() => void lookUp()}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            textContentType="none"
            returnKeyType="go"
            // Room for the dash the field draws.
            maxLength={PARENT_CODE_LENGTH + 4}
            accessibilityLabel={t('parental.code.label')}
            accessibilityHint={t('parental.code.hint')}
            testID="parent-code-input"
            style={[
              styles.field,
              { color: colors.textPrimary, backgroundColor: colors.glassFill, borderColor: error ? colors.danger : 'transparent' },
            ]}
          />
        </Animated.View>
        {error ? (
          <View style={[styles.error, { flexDirection: dir.row }]} accessibilityLiveRegion="polite" testID="parent-code-error">
            <Icon name="alert" size={16} color={colors.danger} />
            <Text style={[styles.errorText, dir.text, { color: colors.danger }]}>{error}</Text>
          </View>
        ) : (
          <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('parental.code.hint')}</Text>
        )}
        <ClayButton
          label={t('common.continue')}
          tone="primary"
          size="large"
          busy={looking}
          disabled={!complete}
          onPress={() => void lookUp()}
          style={styles.continue}
          testID="parent-code-continue"
        />

        <BottomSheet visible={parent !== null} onClose={() => setParent(null)} dismissible={!connecting} testID="parent-confirm">
          {parent ? (
            <View style={styles.sheet}>
              <Avatar name={nameOf(parent)} photoUrl={parent.avatarUrl} size={72} />
              <View style={styles.who}>
                <Text style={[styles.name, styles.center, { color: colors.textPrimary }]}>{t('parental.confirm.title', { name: nameOf(parent) })}</Text>
                <Text style={[styles.handle, styles.center, { color: colors.textSecondary }]}>@{parent.username}</Text>
              </View>
              <View style={styles.promises}>
                {PROMISES.map((p) => (
                  <View key={p.key} style={[styles.promise, { flexDirection: dir.row }]}>
                    <Icon name={p.icon} size={20} color={colors.textSecondary} />
                    <Text style={[styles.promiseText, dir.text, { color: colors.textPrimary }]}>{t(p.key)}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.actions}>
                <ClayButton
                  label={t('parental.confirm.connect')}
                  tone="primary"
                  size="large"
                  busy={connecting}
                  onPress={() => void connect()}
                  testID="parent-connect"
                />
                <ClayButton label={t('common.cancel')} variant="outline" disabled={connecting} onPress={() => setParent(null)} />
              </View>
            </View>
          ) : null}
        </BottomSheet>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: layout.gutter, paddingTop: spacing.md, gap: spacing.sm + 4 },
  label: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  lead: { fontSize: typography.sizes.text, lineHeight: 22 },
  fieldWrap: { alignSelf: 'stretch' },
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
  error: { alignItems: 'flex-start', gap: spacing.sm },
  errorText: { flex: 1, fontSize: typography.sizes.text, lineHeight: 20 },
  continue: { marginTop: spacing.sm },
  sheet: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  who: { alignItems: 'center', gap: 2 },
  name: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  handle: { fontSize: typography.sizes.text },
  center: { textAlign: 'center' },
  promises: { alignSelf: 'stretch', gap: spacing.sm + 2 },
  promise: { alignItems: 'flex-start', gap: spacing.sm + 4 },
  promiseText: { flex: 1, fontSize: typography.sizes.text, lineHeight: 22 },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
});
