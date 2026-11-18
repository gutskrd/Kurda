import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { InviteSheet } from '../play/InviteSheet';
import { JoinCodeCard } from '../play/JoinByCode';
import { ClayButton, GlassCard } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { usePartyOffer, type PartyGame } from './offer';
import { Loading } from '../theme/Loading';

/** A party game's levels, named as the solo games name them. */
export const PARTY_LEVEL_KEY = {
  beginner: 'games.solo.difficulty.beginner',
  intermediate: 'games.solo.difficulty.intermediate',
  advanced: 'games.solo.difficulty.advanced',
} as const satisfies Record<string, TranslationKey>;

/**
 * The start of a party game: how to play, a game with friends (the invite sheet), and joining by code. Offered
 * only in varieties with enough approved cards, and says so plainly where there are none.
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
  if (offer === null) return <Loading style={styles.loading} />;
  if (offer.length === 0) {
    return (
      <GlassCard>
        <View style={styles.card}>
          <Icon name={icon} size={40} tone="primary" />
          <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t(notOfferedKey)}</Text>
        </View>
      </GlassCard>
    );
  }
  return (
    <>
      <GlassCard>
        <View style={styles.card}>
          <Icon name={icon} size={40} tone="primary" />
          <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t(introKey)}</Text>
        </View>
      </GlassCard>
      <GlassCard>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
            {t('games.party.howTitle')}
          </Text>
          <View style={styles.steps}>
            {steps.map((key, i) => (
              <View key={key} style={styles.step}>
                <View style={[styles.stepN, { backgroundColor: colors.gold }]}>
                  <Text style={[styles.stepNText, { color: colors.textOnGold }]}>{i + 1}</Text>
                </View>
                <Text style={[styles.stepText, { color: colors.textPrimary }]}>{t(key)}</Text>
              </View>
            ))}
          </View>
        </View>
      </GlassCard>
      <GlassCard>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
            {t('games.party.withFriends')}
          </Text>
          <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t(blurbKey)}</Text>
          <ClayButton label={t('games.party.withFriends')} icon="people" tone="primary" onPress={() => setInviting(true)} style={styles.stretch} />
        </View>
      </GlassCard>
      {/* A code opens somebody else's game, whichever game it is. */}
      <JoinCodeCard />
      {inviting ? <InviteSheet target={{ kind: 'new', game }} onClose={() => setInviting(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  // Lay out a card's contents on an inner View: a GlassCard's own style only dresses its outside.
  card: { alignItems: 'center', gap: spacing.sm },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
  loading: { marginTop: spacing.xl },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },
  blurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 22 },
  steps: { alignSelf: 'stretch', gap: spacing.sm },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepN: { width: 26, height: 26, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  stepNText: { fontWeight: typography.weights.bold },
  stepText: { flex: 1, fontSize: typography.sizes.md, lineHeight: 22 },
});
