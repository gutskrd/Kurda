import { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../theme/Icon';
import { Pressable } from '../theme/Pressable';
import { heldDim } from '../theme/MotionParts';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useDirection } from './direction';

/** Whether a person is checking this account before it may post or message (shared account-hold.ts). */
export function useAccountHeld(): boolean {
  const { user } = useAuth();
  return Boolean(user?.accountHold);
}

/**
 * What a held account sees in place of posting, commenting, messaging, uploading, letters and joining groups: what waits,
 * that learning does not, a short "Why?" and the way to Account standing. The browser says the same
 * (web/src/reports/HeldNotice.tsx). It never says what started the check.
 */
export function HeldNotice({
  standing = true,
  onNavigate,
  style,
}: {
  /** Off on Account standing itself. */
  standing?: boolean;
  /** Called just before Account standing opens, so a sheet this sits in closes itself. */
  onNavigate?: () => void;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const navigation = useNavigation<RootNavigation>();
  const dir = useDirection();
  const [open, setOpen] = useState(false);
  // The ways on and the reasons sit under the words, past the icon, on the side the words start from.
  const inset: ViewStyle = dir.row === 'row-reverse' ? { paddingRight: WORDS_INSET } : { paddingLeft: WORDS_INSET };
  return (
    <View style={[styles.notice, { backgroundColor: colors.controlTrack }, style]} testID="held-notice">
      <View style={[styles.row, { flexDirection: dir.row }]}>
        <Icon name="shield" size={18} color={colors.textSecondary} />
        <Text style={[styles.text, dir.text, { color: colors.textPrimary }]}>{t('hold.title')}</Text>
      </View>
      <View style={[styles.ways, inset, { flexDirection: dir.row }]}>
        <Pressable
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => [styles.way, pressed && heldDim]}
        >
          <Text style={[styles.wayText, { color: colors.primary }]}>{t('hold.why')}</Text>
        </Pressable>
        {standing ? (
          <Pressable
            onPress={() => {
              onNavigate?.();
              navigation.navigate('AccountStanding');
            }}
            accessibilityRole="link"
            style={({ pressed }) => [styles.way, pressed && heldDim]}
          >
            <Text style={[styles.wayText, { color: colors.primary }]}>{t('restriction.seeStanding')}</Text>
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <Text style={[styles.more, inset, dir.text, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
          {t('hold.whyBody')}
        </Text>
      ) : null}
    </View>
  );
}

/** The notice as a screen's banner, shown only while the account is held. */
export function HeldBanner({ style }: { style?: StyleProp<ViewStyle> }): React.JSX.Element | null {
  return useAccountHeld() ? <HeldNotice style={style} /> : null;
}

/** The icon's width and the gap after it. */
const WORDS_INSET = 18 + spacing.sm;

const styles = StyleSheet.create({
  notice: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  row: { alignItems: 'flex-start', gap: spacing.sm },
  text: { flex: 1, fontSize: typography.sizes.sm, lineHeight: 20 },
  ways: { flexWrap: 'wrap', columnGap: spacing.lg },
  way: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  wayText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  more: { fontSize: typography.sizes.sm, lineHeight: 20, paddingBottom: spacing.xs },
});
