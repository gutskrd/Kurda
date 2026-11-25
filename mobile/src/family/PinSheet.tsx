import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { describeError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { BottomSheet } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { setFamilyPin } from './api';
import { PinField, pinReady } from './parts';

/**
 * Setting the family PIN, or changing it: the new one twice, and for a change the one in use, or the account's
 * password when it is forgotten. The PIN is what gives the phone back from a child, so it is asked before the first
 * profile switch.
 */
export function PinSheet({ visible, hasPin, onClose, onSet }: { visible: boolean; hasPin: boolean; onClose: () => void; onSet: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [forgot, setForgot] = useState(false);
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (): void => {
    setCurrent('');
    setPassword('');
    setForgot(false);
    setPin('');
    setAgain('');
    setError(null);
  };
  const close = (): void => {
    reset();
    onClose();
  };
  const proven = !hasPin || (forgot ? password.length > 0 : pinReady(current));
  const ready = proven && pinReady(pin) && again.length > 0;

  const save = async (): Promise<void> => {
    if (pin !== again) {
      setError(t('family.pin.mismatch'));
      haptic('error');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await setFamilyPin(client, pin, hasPin ? (forgot ? { password } : { currentPin: current }) : {});
    setBusy(false);
    if (!res.ok) {
      haptic('error');
      setError(describeError(res.error, t));
      return;
    }
    haptic('correct');
    reset();
    onSet();
  };

  return (
    <BottomSheet visible={visible} onClose={close} dismissible={!busy} title={hasPin ? t('family.pin.change') : t('family.pin.set')} testID="family-pin-sheet">
      <View style={styles.body}>
        <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('family.pin.lead')}</Text>
        {hasPin && !forgot ? <PinField value={current} onChange={setCurrent} label={t('family.pin.current')} autoFocus testID="family-pin-current" /> : null}
        {hasPin && forgot ? (
          <View style={styles.passwordWrap}>
            <Text style={[styles.label, dir.text, { color: colors.textPrimary }]}>{t('auth.password')}</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              accessibilityLabel={t('auth.password')}
              style={[styles.password, { color: colors.textPrimary, backgroundColor: colors.controlTrack }]}
              testID="family-pin-password"
            />
          </View>
        ) : null}
        <PinField value={pin} onChange={setPin} label={t('family.pin.new')} autoFocus={!hasPin} testID="family-pin-new" />
        <PinField value={again} onChange={setAgain} label={t('family.pin.again')} error={error} onSubmit={() => void save()} testID="family-pin-again" />
        <View style={styles.actions}>
          <ClayButton label={t('family.pin.save')} tone="primary" size="large" busy={busy} disabled={!ready} onPress={() => void save()} testID="family-pin-save" />
          {hasPin ? (
            <ClayButton
              label={forgot ? t('family.pin.useCurrent') : t('family.pin.forgot')}
              variant="outline"
              disabled={busy}
              onPress={() => {
                setForgot((f) => !f);
                setError(null);
              }}
            />
          ) : null}
        </View>
      </View>
    </BottomSheet>
  );
}

/**
 * The family PIN asked before a child's session gives the phone back to the parent. Wrong tries count down on the
 * server, which locks it for a while after too many.
 */
export function PinPrompt({ visible, parentName, onClose }: { visible: boolean; parentName: string; onClose: () => void }): React.JSX.Element {
  const { returnToParent } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    setPin('');
    setError(null);
    onClose();
  };
  const giveBack = async (): Promise<void> => {
    if (!pinReady(pin)) return;
    setBusy(true);
    setError(null);
    const failed = await returnToParent(pin);
    setBusy(false);
    if (failed) {
      haptic('error');
      setPin('');
      setError(failed.message);
      return;
    }
    haptic('correct');
  };

  return (
    <BottomSheet visible={visible} onClose={close} dismissible={!busy} title={t('child.back.title', { name: parentName })} testID="child-pin-prompt">
      <View style={styles.body}>
        <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('child.back.lead', { name: parentName })}</Text>
        <PinField value={pin} onChange={setPin} label={t('family.pin.label')} error={error} onSubmit={() => void giveBack()} autoFocus testID="child-pin" />
        <View style={styles.actions}>
          <ClayButton label={t('child.back.action')} tone="primary" size="large" busy={busy} disabled={!pinReady(pin)} onPress={() => void giveBack()} testID="child-pin-go" />
          <ClayButton label={t('common.cancel')} variant="outline" disabled={busy} onPress={close} />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingTop: spacing.xs },
  lead: { fontSize: typography.sizes.text, lineHeight: 22 },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  passwordWrap: { gap: spacing.xs + 2 },
  label: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  password: { minHeight: MIN_TOUCH_TARGET + 8, borderRadius: radii.md, paddingHorizontal: spacing.md, fontSize: typography.sizes.text },
});
