import { Fragment, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { statValue } from '../theme/fonts';
import { BottomSheet } from '../theme/BottomSheet';
import { Icon } from '../theme/Icon';
import { pressedDim } from '../theme/motion';
import { Pressable } from '../theme/Pressable';
import { SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/**
 * The figures of a profile, laid out as on the website (web/src/profile/FullProfile.tsx): a row of them beside the
 * face, or split by hairlines inside a sheet, and the row that opens what only the owner sees.
 */

/** One figure and what it counts; a button where there is a page or a sheet behind it. */
export interface ProfileFact {
  key: string;
  label: string;
  /** Null while it loads. */
  value: string | null;
  /** Drawn before the figure, such as the streak's fire. */
  art?: ReactNode;
  /** How a screen reader says it, where the figure alone would not do ("12 days"). */
  spoken?: string;
  onPress?: () => void;
}

/**
 * Up to four figures in a row, the figure over its label. `head` is the row beside a face: large figures with no
 * hairlines, each shrinking to fit its share of the row rather than being cut; otherwise a hairline stands between each.
 */
export function ProfileFacts({ facts, head = false, testID }: { facts: readonly ProfileFact[]; head?: boolean; testID?: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.facts, { flexDirection: dir.row }]} testID={testID}>
      {facts.map((fact, i) => (
        <Fragment key={fact.key}>
          {i > 0 && !head ? <View style={[styles.divider, { backgroundColor: colors.separator }]} /> : null}
          <Fact fact={fact} head={head} />
        </Fragment>
      ))}
    </View>
  );
}

function Fact({ fact, head }: { fact: ProfileFact; head: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const body = (
    <>
      {fact.value === null ? (
        <SkeletonText size={head ? typography.sizes.title : typography.sizes.text} width={28} align="center" />
      ) : (
        <View style={[styles.figureRow, { flexDirection: dir.row }]}>
          {fact.art}
          <Text
            style={[head ? styles.figureHead : styles.figure, { color: colors.textPrimary }]}
            numberOfLines={1}
            adjustsFontSizeToFit={head}
            minimumFontScale={0.5}
          >
            {fact.value}
          </Text>
        </View>
      )}
      <Text
        style={[styles.label, { color: colors.textSecondary }, fact.onPress && !head ? styles.labelLink : null]}
        numberOfLines={1}
        adjustsFontSizeToFit={head}
        minimumFontScale={0.75}
      >
        {fact.label}
      </Text>
    </>
  );
  // "23 Friends", or the label first where the figure needs words of its own ("Streak, 6 days").
  const spoken = fact.spoken ? `${fact.label}, ${fact.spoken}` : `${fact.value ?? '—'} ${fact.label}`;
  if (!fact.onPress) {
    return (
      <View style={styles.fact} accessible accessibilityLabel={spoken}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={fact.onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      style={({ pressed }) => [styles.fact, pressed && { opacity: pressedDim }]}
    >
      {body}
    </Pressable>
  );
}

/**
 * What only the profile's owner sees, as one quiet row (a social app's dashboard): its title and that it is only
 * theirs, opening the whole of it in a sheet.
 */
export function OnlyYou({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${t('profile.onlyYou')}`}
        testID="profile-yours"
        style={({ pressed }) => [styles.yoursRow, { flexDirection: dir.row, backgroundColor: colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
      >
        <View style={styles.yoursText}>
          <Text style={[styles.yoursTitle, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          <View style={[styles.onlyYou, { flexDirection: dir.row }]}>
            <Icon name="lock" size={12} tone="secondary" />
            <Text style={[styles.onlyYouText, { color: colors.textSecondary }]} numberOfLines={1}>
              {t('profile.onlyYou')}
            </Text>
          </View>
        </View>
        <View style={dir.flip}>
          <Icon name="chevron-right" size={16} tone="secondary" />
        </View>
      </Pressable>
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={title} contentStyle={styles.yoursSheet}>
        {children}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  facts: { alignSelf: 'stretch', alignItems: 'stretch' },
  divider: { width: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
  fact: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2, paddingVertical: spacing.xs },
  figureRow: { alignItems: 'center', gap: 4, maxWidth: '100%' },
  figure: { ...statValue },
  figureHead: { flexShrink: 1, fontSize: typography.sizes.title, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  label: { fontSize: typography.sizes.text },
  // A figure with a page behind it is underlined, as a link on the website.
  labelLink: { textDecorationLine: 'underline' },
  yoursRow: { alignItems: 'center', gap: spacing.md, minHeight: 52, borderRadius: radii.lg, paddingHorizontal: spacing.md - 2, paddingVertical: spacing.sm },
  yoursText: { flex: 1, minWidth: 0, gap: 2 },
  yoursTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  onlyYou: { alignItems: 'center', gap: 4 },
  onlyYouText: { fontSize: typography.sizes.text },
  yoursSheet: { gap: spacing.md },
});
