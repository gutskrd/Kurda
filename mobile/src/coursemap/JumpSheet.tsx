import { StyleSheet, Text, View } from 'react-native';
import { PATH_JUMP, type PathUnit } from '@kurda/shared';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { BottomSheet } from '../theme/BottomSheet';
import { display } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import type { ToneColors } from './path';
import type { SkillNode } from './types';

/**
 * The offer behind "Jump here?": what jumping does — a short test opens the
 * unit, and the lessons skipped stay open to come back to — how long the test
 * is and what passes it (shared `PATH_JUMP`), and one button to start it.
 */
export function JumpSheet({
  unit,
  tone,
  onClose,
  onStart,
}: {
  unit: PathUnit<SkillNode> | null;
  tone: ToneColors | null;
  onClose: () => void;
  onStart: () => void;
}): React.JSX.Element {
  return (
    <BottomSheet visible={unit !== null} onClose={onClose} testID="lp-jump-sheet">
      {unit && tone ? <Offer unit={unit} tone={tone} onStart={onStart} /> : null}
    </BottomSheet>
  );
}

function Offer({ unit, tone, onStart }: { unit: PathUnit<SkillNode>; tone: ToneColors; onStart: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const n = formatNumber(unit.number, locale);
  const facts: Array<{ icon: IconName; words: string }> = [
    { icon: 'question', words: t('coursemap.jump.questions', { count: formatNumber(PATH_JUMP.questions, locale) }) },
    { icon: 'check', words: t('coursemap.jump.mistakes', { count: formatNumber(PATH_JUMP.maxMistakes, locale) }) },
  ];
  return (
    <View style={styles.body}>
      <View style={[styles.head, { flexDirection: dir.row }]}>
        <View style={[styles.badge, { backgroundColor: tone.fill }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name="skip-forward" size={26} color={tone.ink} style={dir.flip} />
        </View>
        <View style={styles.words}>
          <Text style={[styles.eyebrow, dir.text, { color: tone.text }]}>{`${t('coursemap.path.unit', { n })} · ${unit.title}`}</Text>
          <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
            {t('coursemap.jump.title', { n })}
          </Text>
        </View>
      </View>
      <Text style={[styles.line, dir.text, { color: colors.textSecondary }]}>{t('coursemap.jump.body', { n })}</Text>
      <View style={styles.facts}>
        {facts.map((fact) => (
          <View key={fact.icon} style={[styles.fact, { flexDirection: dir.row }]}>
            <Icon name={fact.icon} size={18} color={tone.text} />
            <Text style={[styles.factText, dir.text, { color: colors.textPrimary }]}>{fact.words}</Text>
          </View>
        ))}
      </View>
      <ClayButton label={t('coursemap.jump.start')} tone="primary" size="large" onPress={onStart} style={styles.action} />
    </View>
  );
}

const BADGE = 52;

const styles = StyleSheet.create({
  body: { gap: spacing.sm + 4, paddingBottom: spacing.sm },
  head: { alignItems: 'center', gap: spacing.md },
  badge: { width: BADGE, height: BADGE, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, gap: 2 },
  eyebrow: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  title: { ...display(typography.sizes.lg) },
  line: { fontSize: typography.sizes.md, lineHeight: 22 },
  facts: { gap: spacing.xs },
  fact: { alignItems: 'center', gap: spacing.sm },
  factText: { flex: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  action: { marginTop: spacing.xs },
});
