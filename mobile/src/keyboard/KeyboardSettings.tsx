import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PressableScale, heldRow } from '../theme/MotionParts';
import { haptic } from '../feedback/haptics';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { ToggleRow } from '../theme/Toggle';
import { ACCENT_MODES, type AccentMode, type TypingDialect } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { GlassRow } from '../theme/glass';
import { SettingsChoice, SettingsRow, SettingsSection, SettingsSwitch } from '../settings/list';
import { Icon } from '../theme/Icon';
import { layout, radii, spacing, typography, wash } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { KeyboardGuide } from './KeyboardGuide';
import { useKeyboardPrefs, type WordleLayout } from './prefs';

export const ACCENT_LABEL: Record<AccentMode, TranslationKey> = {
  strict: 'keyboard.accent.strict',
  forgiving: 'keyboard.accent.forgiving',
  hidden: 'keyboard.accent.hidden',
};

export const ACCENT_HINT: Record<AccentMode, TranslationKey> = {
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
 * The race's accents, key bar and backtick shortcut: a three-way choice and two switches, shared by the race
 * settings sheet and Settings so they always match.
 */
function TypingOptions({ midRace = false }: { midRace?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [prefs, setPrefs] = useKeyboardPrefs();
  return (
    <>
      <Text style={[styles.label, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
        {t('keyboard.accent.title')}
      </Text>
      {/* The active mode is washed, edged and ticked in the ink, as every active choice is. */}
      <View accessibilityRole="radiogroup" accessibilityLabel={t('keyboard.accent.title')} style={styles.modes}>
        {ACCENT_MODES.map((mode) => {
          const on = prefs.accentMode === mode;
          return (
            <PressableScale
              key={mode}
              onPress={() => {
                if (!on) haptic('select');
                setPrefs({ accentMode: mode });
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${t(ACCENT_LABEL[mode])}. ${t(ACCENT_HINT[mode])}`}
              style={[
                styles.mode,
                { backgroundColor: on ? wash(colors.primary) : colors.controlTrack, borderColor: on ? colors.primary : 'transparent' },
              ]}
            >
              <View style={[styles.modeHead, { flexDirection: dir.row }]}>
                <Text style={[styles.modeName, dir.text, { color: on ? colors.primary : colors.textPrimary }]}>{t(ACCENT_LABEL[mode])}</Text>
                {on ? <Icon name="check" size={18} color={colors.primary} /> : null}
              </View>
              <Text style={[styles.modeHint, dir.text, { color: colors.textSecondary }]}>{t(ACCENT_HINT[mode])}</Text>
            </PressableScale>
          );
        })}
      </View>
      {/* A race keeps the mode it started in: what counts cannot change half way. */}
      {midRace ? <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t('keyboard.accent.nextRace')}</Text> : null}
      {/* Each switch is its whole row, words and all, held as a list row is. */}
      <ToggleRow
        label={t('keyboard.keyBar.title')}
        hint={t('keyboard.keyBar.hint')}
        value={prefs.keyBar}
        onValueChange={(on) => setPrefs({ keyBar: on })}
        style={({ pressed }) => pressed && heldRow(colors.controlTrack)}
      >
        {(toggle) => <GlassRow icon="keyboard" title={t('keyboard.keyBar.title')} subtitle={t('keyboard.keyBar.hint')} trailing={toggle} />}
      </ToggleRow>
      <ToggleRow
        label={t('keyboard.backtick.title')}
        hint={t('keyboard.backtick.hint')}
        value={prefs.backtick}
        onValueChange={(on) => setPrefs({ backtick: on })}
        style={({ pressed }) => pressed && heldRow(colors.controlTrack)}
      >
        {(toggle) => <GlassRow icon="text" title={t('keyboard.backtick.title')} subtitle={t('keyboard.backtick.hint')} trailing={toggle} />}
      </ToggleRow>
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
  const { t } = useI18n();
  const [guide, setGuide] = useState(false);
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('keyboard.settings.title')} contentStyle={styles.scroller}>
      <SheetScrollView contentContainerStyle={styles.sheetBody}>
        <TypingOptions midRace={midRace} />
        <GlassRow icon="lightbulb" title={t('keyboard.help')} onPress={() => setGuide(true)} />
      </SheetScrollView>
      {/* In the sheet's own Modal, so the guide is presented over the sheet. */}
      <KeyboardGuide visible={guide} dialect={dialect} onClose={() => setGuide(false)} />
    </BottomSheet>
  );
}

/** The same settings as a Settings page, with Peyvok's layout and the keyboard guide, laid out as rows like the rest of Settings. */
export function KeyboardSettingsList(): React.JSX.Element {
  const { t, locale } = useI18n();
  const [prefs, setPrefs] = useKeyboardPrefs();
  const [guide, setGuide] = useState(false);
  // The guide for the variety last raced in, else the one the app is read in.
  const dialect: TypingDialect = prefs.raceDialect ?? (locale === 'ckb' ? 'sorani' : 'kurmanci');
  return (
    <>
      <SettingsSection title={t('keyboard.accent.title')} first>
        <SettingsChoice<AccentMode>
          label={t('keyboard.accent.title')}
          options={ACCENT_MODES}
          value={prefs.accentMode}
          labelOf={(mode) => t(ACCENT_LABEL[mode])}
          hintOf={(mode) => t(ACCENT_HINT[mode])}
          onChange={(mode) => setPrefs({ accentMode: mode })}
        />
      </SettingsSection>
      <SettingsSection title={t('keyboard.settings.typing')}>
        <SettingsSwitch
          icon="keyboard"
          title={t('keyboard.keyBar.title')}
          subtitle={t('keyboard.keyBar.hint')}
          value={prefs.keyBar}
          onValueChange={(on) => setPrefs({ keyBar: on })}
        />
        <SettingsSwitch
          icon="text"
          title={t('keyboard.backtick.title')}
          subtitle={t('keyboard.backtick.hint')}
          value={prefs.backtick}
          onValueChange={(on) => setPrefs({ backtick: on })}
        />
      </SettingsSection>
      <SettingsSection title={t('keyboard.wordle.title')}>
        <SettingsChoice<WordleLayout>
          label={t('keyboard.wordle.title')}
          options={LAYOUTS}
          value={prefs.wordleLayout}
          labelOf={(l) => t(LAYOUT_LABEL[l])}
          onChange={(l) => setPrefs({ wordleLayout: l })}
        />
      </SettingsSection>
      <SettingsSection>
        <SettingsRow icon="lightbulb" title={t('keyboard.help')} onPress={() => setGuide(true)} />
      </SettingsSection>
      <KeyboardGuide visible={guide} dialect={dialect} onClose={() => setGuide(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, marginBottom: spacing.sm },
  modes: { gap: spacing.sm, marginBottom: spacing.sm },
  mode: { borderRadius: radii.md, padding: spacing.md, gap: 2, borderWidth: 1.5, minHeight: MIN_TOUCH_TARGET },
  modeHead: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  modeName: { flexShrink: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  modeHint: { fontSize: typography.sizes.text, lineHeight: 22 },
  hint: { fontSize: typography.sizes.text, lineHeight: 22, marginBottom: spacing.sm },
  // The gutter is the ScrollView's own, so the options scroll edge to edge.
  scroller: { paddingHorizontal: 0 },
  sheetBody: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm, gap: spacing.xs },
});
