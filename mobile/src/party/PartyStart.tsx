import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { GameDialect } from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { InviteSheet } from '../play/InviteSheet';
import { JoinCodeCard } from '../play/JoinByCode';
import { ClayButton, GlassCard } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { usePartyOffer, type PartyGame } from './offer';

/** A variety is called by its own name in every language, the way a language is. */
export const PARTY_DIALECT_NAME: Record<GameDialect, string> = { kmr: 'Kurmancî', ckb: 'Soranî' };

/** A party game's levels, by the solo games' names for them. */
export const PARTY_LEVEL_KEY = {
  beginner: 'games.solo.difficulty.beginner',
  intermediate: 'games.solo.difficulty.intermediate',
  advanced: 'games.solo.difficulty.advanced',
} as const satisfies Record<string, TranslationKey>;

/**
 * The start of a party game on the phone: how to play in three steps, a game
 * with friends (the invite sheet), and a code from someone else — offered
 * only in the varieties with enough approved cards, and saying so plainly
 * where there are none.
 */
export function PartyStart({
  game,
  icon,
  introKey,
  steps,
  blurbKey,
  notOfferedKey,
}: {
  game: PartyGame;
  icon: IconName;
  introKey: TranslationKey;
  steps: readonly TranslationKey[];
  blurbKey: TranslationKey;
  notOfferedKey: TranslationKey;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const offer = usePartyOffer(game);
  const [inviting, setInviting] = useState(false);
  if (offer === null) return <ActivityIndicator color={colors.primary} style={styles.loading} />;
  if (offer.length === 0) {
    return (
      <GlassCard style={styles.card}>
        <Icon name={icon} size={40} tone="primary" />
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t(notOfferedKey)}</Text>
      </GlassCard>
    );
  }
  return (
    <>
      <GlassCard style={styles.card}>
        <Icon name={icon} size={40} tone="primary" />
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t(introKey)}</Text>
      </GlassCard>
      <GlassCard style={styles.card}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
          {t('games.party.howTitle')}
        </Text>
        <View style={styles.steps}>
          {steps.map((key, i) => (
            <View key={key} style={styles.step}>
              <View style={[styles.stepN, { backgroundColor: colors.gold }]}>
                <Text style={styles.stepNText}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: colors.textPrimary }]}>{t(key)}</Text>
            </View>
          ))}
        </View>
      </GlassCard>
      <GlassCard style={styles.card}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
          {t('games.party.withFriends')}
        </Text>
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t(blurbKey)}</Text>
        <ClayButton label={t('games.party.withFriends')} icon="people" tone="primary" onPress={() => setInviting(true)} style={styles.stretch} />
      </GlassCard>
      {/* a game somebody else made: its code opens it, whichever game it turns out to be */}
      <JoinCodeCard />
      {inviting ? <InviteSheet target={{ kind: 'new', game }} onClose={() => setInviting(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: spacing.sm },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
  loading: { marginTop: spacing.xl },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },
  blurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 22 },
  steps: { alignSelf: 'stretch', gap: spacing.sm },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepN: { width: 26, height: 26, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  stepNText: { color: '#2a1d05', fontWeight: typography.weights.bold },
  stepText: { flex: 1, fontSize: typography.sizes.md, lineHeight: 22 },
});
