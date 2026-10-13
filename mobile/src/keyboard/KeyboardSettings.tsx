import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ACCENT_MODES, type AccentMode, type TypingDialect } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { GlassCard, GlassRow, GlassSelect } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { KeyboardGuide } from './KeyboardGuide';
import { useKeyboardPrefs, type WordleLayout } from './prefs';

export const ACCENT_LABEL: Record<AccentMode, TranslationKey> = {
  strict: 'keyboard.accent.strict',
  forgiving: 'keyboard.accent.forgiving',
  hidden: 'keyboard.accent.hidden',
};

const ACCENT_HINT: Record<AccentMode, TranslationKey> = {
  strict: 'keyboard.accent.strictHint',
  forgiving: 'keyboard.accent.forgivingHint',
  hidden: 'keyboard.accent.hiddenHint',
};

const LAYOUTS: readonly WordleLayout[] = ['qwerty', 'alphabet'];
const LAYOUT_LABEL: Record<WordleLayout, TranslationKey> = {
  qwerty: 'keyboard.wordle.qwerty',
  alphabet: 'keyboard.wordle.alphabet',
};

/**
 * The race's accents, the key bar and the backtick shortcut, as a choice of
 * three and two switches — one block, used in the race's own settings sheet
 * and in Settings, so the two can never offer different things.
 */
function TypingOptions({ midRace = false }: { midRace?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [prefs, setPrefs] = useKeyboardPrefs();
  const track = { true: colors.primary, false: colors.controlTrack };
  return (
    <>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('keyboard.accent.title')}</Text>
      <View accessibilityRole="radiogroup" style={styles.modes}>
        {ACCENT_MODES.map((mode) => {
          const on = prefs.accentMode === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => setPrefs({ accentMode: mode })}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${t(ACCENT_LABEL[mode])}. ${t(ACCENT_HINT[mode])}`}
              style={[styles.mode, { backgroundColor: colors.controlTrack, borderColor: on ? colors.textPrimary : 'transparent' }]}
            >
              <View style={styles.modeHead}>
                <Text style={[styles.modeName, { color: colors.textPrimary }]}>{t(ACCENT_LABEL[mode])}</Text>
                {on ? <Icon name="check" size={18} color={colors.textPrimary} /> : null}
              </View>
              <Text style={[styles.modeHint, { color: colors.textSecondary }]}>{t(ACCENT_HINT[mode])}</Text>
            </Pressable>
          );
        })}
      </View>
      {/* a race keeps the mode it started in: what counts cannot change half way */}
      {midRace ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('keyboard.accent.nextRace')}</Text> : null}
      <GlassRow
        icon="keyboard"
        title={t('keyboard.keyBar.title')}
        subtitle={t('keyboard.keyBar.hint')}
        trailing={
          <Switch
            value={prefs.keyBar}
            onValueChange={(on) => setPrefs({ keyBar: on })}
            accessibilityLabel={t('keyboard.keyBar.title')}
            trackColor={track}
          />
        }
      />
      <GlassRow
        icon="text"
        title={t('keyboard.backtick.title')}
        subtitle={t('keyboard.backtick.hint')}
        trailing={
          <Switch
            value={prefs.backtick}
            onValueChange={(on) => setPrefs({ backtick: on })}
            accessibilityLabel={t('keyboard.backtick.title')}
            trackColor={track}
          />
        }
      />
    </>
  );
}

/** The race's settings, from the gear in its header: a sheet over the race. */
export function KeyboardSettingsSheet({
  visible,
  dialect,
  midRace,
  onClose,
}: {
  visible: boolean;
  dialect: TypingDialect;
  midRace: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [guide, setGuide] = useState(false);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} accessibilityRole="button" />
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]} accessibilityRole="header">
              {t('keyboard.settings.title')}
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.close}>
              <Icon name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            <TypingOptions midRace={midRace} />
            <GlassRow icon="lightbulb" title={t('keyboard.help')} onPress={() => setGuide(true)} />
          </ScrollView>
        </View>
      </View>
      <KeyboardGuide visible={guide} dialect={dialect} onClose={() => setGuide(false)} />
    </Modal>
  );
}

/**
 * The same settings in Settings, with Wordle's layout and the keyboard guide —
 * one line in SettingsScreen, so the screen's other sections are untouched.
 */
export function KeyboardSettingsSection({ dialect = 'kurmanci' }: { dialect?: TypingDialect }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [prefs, setPrefs] = useKeyboardPrefs();
  const [guide, setGuide] = useState(false);
  return (
    <>
      <Text style={[styles.section, { color: colors.textSecondary }]}>{t('keyboard.settings.title')}</Text>
      <GlassCard>
        <TypingOptions />
        <GlassSelect<WordleLayout>
          label={t('keyboard.wordle.title')}
          icon="grid"
          value={prefs.wordleLayout}
          options={LAYOUTS}
          labelOf={(l) => t(LAYOUT_LABEL[l])}
          onChange={(l) => setPrefs({ wordleLayout: l })}
        />
        <GlassRow icon="lightbulb" title={t('keyboard.help')} onPress={() => setGuide(true)} />
      </GlassCard>
      <KeyboardGuide visible={guide} dialect={dialect} onClose={() => setGuide(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  section: { ...sectionLabel, marginTop: spacing.md, marginLeft: spacing.xs, marginBottom: spacing.xs },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, marginBottom: spacing.sm },
  modes: { gap: spacing.sm, marginBottom: spacing.sm },
  mode: { borderRadius: radii.md, padding: spacing.md, gap: 2, borderWidth: 1.5, minHeight: MIN_TOUCH_TARGET },
  modeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  modeHint: { fontSize: typography.sizes.sm, lineHeight: 19 },
  hint: { fontSize: typography.sizes.sm, lineHeight: 19, marginBottom: spacing.sm },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, maxHeight: '88%', paddingBottom: spacing.lg },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  sheetTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  close: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.xs },
});
