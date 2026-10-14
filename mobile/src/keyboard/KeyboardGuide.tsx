import { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { KeyboardPlatform, TypingDialect } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { display } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { HevaloDeer } from '../feedback/HevaloDeer';
import { guidePlatform, guideSteps, lettersTyped, stepParts, tryLetters } from './guide';
import { useKeyboardPrefs } from './prefs';

/** The phones this card has steps for; the browser has its own guide for computers. */
const PHONES: readonly KeyboardPlatform[] = ['ios', 'android'];

const PHONE_LABEL: Record<string, TranslationKey> = {
  ios: 'keyboard.guide.onIphone',
  android: 'keyboard.guide.onAndroid',
};

/**
 * "Get the Kurmancî keyboard": Hevalo the deer, holding up the five letters,
 * shows how to add a Kurdish keyboard to this phone in three or four steps
 * (`@kurda/shared` KEYBOARD_GUIDES) — and then lets you try it.
 *
 * It opens by itself once, before a first Kurmancî race (the clock has not
 * started), and from "Keyboard help" in the race's settings and in Settings
 * whenever wanted. Nobody has to set anything up to race: two ways out are
 * always on the card — the on-screen keys, and forgiving accents.
 */
export function KeyboardGuide({
  visible,
  dialect,
  onClose,
}: {
  visible: boolean;
  dialect: TypingDialect;
  onClose: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();
  const [prefs, setPrefs] = useKeyboardPrefs();
  const detected = useMemo(
    () => guidePlatform(Platform.OS, (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? ''),
    [],
  );
  const [platform, setPlatform] = useState<KeyboardPlatform>(
    detected && PHONES.includes(detected) ? detected : 'android',
  );
  const [tried, setTried] = useState('');
  const letters = tryLetters(dialect);
  const typed = lettersTyped(dialect, tried);
  const allIn = typed.size === letters.length;
  const sorani = dialect === 'sorani';

  // a fresh try every time the card opens
  useEffect(() => {
    if (visible) setTried('');
  }, [visible]);

  useEffect(() => {
    if (allIn) AccessibilityInfo.announceForAccessibility?.(t('keyboard.guide.allIn'));
  }, [allIn, t]);

  const steps = guideSteps(platform, dialect);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.sheet, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.top, { paddingTop: Platform.OS === 'ios' ? spacing.sm : topInset }]}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            hitSlop={8}
            style={styles.close}
          >
            <Icon name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <HevaloDeer size={150} board={{ kind: 'letters', letters: letters.join(' ') }} cheer={allIn} />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
            {t(sorani ? 'keyboard.guide.titleSorani' : 'keyboard.guide.title')}
          </Text>
          <Text style={[styles.lead, { color: colors.textSecondary }]}>
            {t(sorani ? 'keyboard.guide.leadSorani' : 'keyboard.guide.lead')}
          </Text>

          <View style={styles.platformRow} accessibilityRole="radiogroup">
            {PHONES.map((p) => {
              const on = p === platform;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPlatform(p)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={[
                    styles.platform,
                    { backgroundColor: on ? colors.primary : colors.controlTrack },
                  ]}
                >
                  <Text style={[styles.platformText, { color: on ? colors.textOnPrimary : colors.textPrimary }]}>
                    {t(PHONE_LABEL[p]!)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.steps}>
            {steps.map((step, i) => (
              <View key={step.key} style={styles.step}>
                <View style={[styles.stepNo, { backgroundColor: colors.controlTrack }]}>
                  <Text style={[styles.stepNoText, { color: colors.textPrimary }]}>{i + 1}</Text>
                </View>
                <Text style={[styles.stepText, { color: colors.textPrimary }]}>
                  {stepParts(step, t(step.key as TranslationKey)).map((part, j) =>
                    part.ui ? (
                      <Text key={j} style={styles.ui}>
                        {part.text}
                      </Text>
                    ) : (
                      part.text
                    ),
                  )}
                </Text>
              </View>
            ))}
          </View>

          <View style={[styles.try, { backgroundColor: colors.glassFill }]}>
            <Text style={[styles.tryTitle, { color: colors.textPrimary }]}>
              {t('keyboard.guide.tryIt', { letters: letters.join(' ') })}
            </Text>
            <View style={[styles.tryLetters, sorani && styles.rtl]}>
              {letters.map((l) => {
                const lit = typed.has(l);
                return (
                  <View
                    key={l}
                    style={[styles.tryLetter, { backgroundColor: lit ? colors.success : colors.controlTrack }]}
                    accessibilityLabel={t(lit ? 'keyboard.guide.letterDone' : 'keyboard.guide.letterToGo', { letter: l })}
                  >
                    <Text style={[styles.tryLetterText, { color: lit ? colors.textOnPrimary : colors.textPrimary }]}>
                      {l}
                    </Text>
                  </View>
                );
              })}
            </View>
            <TextInput
              value={tried}
              onChangeText={setTried}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              placeholder={letters.join(' ')}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={t('keyboard.guide.tryLabel')}
              style={[
                styles.tryInput,
                { color: colors.textPrimary, backgroundColor: colors.controlTrack },
                sorani && styles.tryInputRtl,
              ]}
            />
            <Text
              style={[styles.tryResult, { color: allIn ? colors.success : colors.textSecondary }]}
              accessibilityLiveRegion="polite"
            >
              {allIn ? t('keyboard.guide.allIn') : t('keyboard.guide.progress', { done: typed.size, total: letters.length })}
            </Text>
          </View>

          <Text style={[styles.hatchLead, { color: colors.textSecondary }]}>{t('keyboard.guide.noTime')}</Text>
          <View style={styles.hatches}>
            <ClayButton
              label={t('keyboard.guide.useKeys')}
              icon="keyboard"
              variant="outline"
              onPress={() => {
                setPrefs({ keyBar: true });
                onClose();
              }}
            />
            {prefs.accentMode !== 'forgiving' ? (
              <ClayButton
                label={t('keyboard.guide.forgiving')}
                variant="outline"
                onPress={() => {
                  setPrefs({ accentMode: 'forgiving' });
                  onClose();
                }}
              />
            ) : null}
          </View>
          <ClayButton label={t('common.done')} tone="primary" size="large" onPress={onClose} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md },
  close: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md, maxWidth: 560, width: '100%', alignSelf: 'center' },
  hero: { alignItems: 'center' },
  title: { ...display(typography.sizes.xl), textAlign: 'center' },
  lead: { fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center' },
  platformRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  platform: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  steps: { gap: spacing.md },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNo: { width: 28, height: 28, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  stepNoText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  stepText: { flex: 1, fontSize: typography.sizes.md, lineHeight: 22 },
  ui: { fontWeight: typography.weights.bold },
  try: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  tryTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  tryLetters: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  rtl: { flexDirection: 'row-reverse' },
  tryLetter: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  tryLetterText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  tryInput: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontSize: typography.sizes.lg,
    textAlign: 'center',
  },
  tryInputRtl: { writingDirection: 'rtl' },
  tryResult: { fontSize: typography.sizes.sm, textAlign: 'center', fontWeight: typography.weights.semibold },
  hatchLead: { fontSize: typography.sizes.sm, textAlign: 'center' },
  hatches: { gap: spacing.sm },
});
