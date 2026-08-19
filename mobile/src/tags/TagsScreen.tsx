import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { ClayButton, GradientBackground } from '../theme/glass';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { claimTag, myClaimedTags, myTags, setTagDisplayed, tagCatalog, unclaimTag } from './api';
import { TagBadge } from './TagBadge';
import { claimableCatalog, purchasableTags, tagLabel, type ClaimedTag, type ProfileTags, type TagRow } from './types';

/**
 * Tags & badges management (KUR-287): shows the user's effective main tag +
 * claimable/auto tags, lets them claim self-claim tags (sensitive ones require
 * explicit consent, #109), show/hide claimed tags, and revoke them. Purchase
 * tags (e.g. Kurdish) link out to the Shop.
 */
export function TagsScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const topInset = useScreenTopInset();

  const [profile, setProfile] = useState<ProfileTags | null>(null);
  const [claimed, setClaimed] = useState<ClaimedTag[]>([]);
  const [catalog, setCatalog] = useState<TagRow[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  // inline claim form state
  const [claiming, setClaiming] = useState<TagRow | null>(null);
  const [value, setValue] = useState('');
  const [consent, setConsent] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [p, mine, c] = await Promise.all([myTags(client), myClaimedTags(client), tagCatalog(client)]);
    if (!p.ok || !mine.ok || !c.ok) {
      setError((!p.ok && p.error) || (!mine.ok && mine.error) || (!c.ok ? c.error : null));
      return;
    }
    setProfile(p.data);
    setClaimed(mine.data.tags);
    setCatalog(c.data.tags);
  }, [client]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const startClaim = (tag: TagRow) => {
    setClaiming(tag);
    setValue('');
    setConsent(false);
  };

  const submitClaim = useCallback(async () => {
    if (!claiming || busy) return;
    if (claiming.sensitive && !consent) {
      Alert.alert('Consent needed', 'Sensitive tags are optional. Tick consent to add this tag.');
      return;
    }
    setBusy(true);
    const res = await claimTag(client, { key: claiming.key, value: value.trim() || undefined, consent: claiming.sensitive ? true : undefined });
    setBusy(false);
    if (!res.ok) {
      Alert.alert('Couldn’t add tag', 'Please try again.');
      return;
    }
    setClaiming(null);
    await load();
  }, [claiming, consent, value, busy, client, load]);

  const toggleDisplay = useCallback(
    async (tag: ClaimedTag, displayed: boolean) => {
      setClaimed((prev) => prev.map((t) => (t.key === tag.key ? { ...t, displayed } : t))); // optimistic
      const res = await setTagDisplayed(client, tag.key, displayed);
      if (!res.ok) await load();
    },
    [client, load],
  );

  const revoke = useCallback(
    (tag: ClaimedTag) => {
      Alert.alert('Remove tag', `Remove “${tag.label}” from your profile? This deletes any value you entered.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const res = await unclaimTag(client, tag.key);
            if (res.ok) await load();
          },
        },
      ]);
    },
    [client, load],
  );

  const header = (
    <View style={styles.titleRow}>
      <Pressable onPress={onExit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
        <Icon name="chevron-left" size={24} color={colors.textSecondary} />
      </Pressable>
      <Text style={[styles.title, { color: colors.primary }]}>Tags & badges</Text>
      <View style={{ width: 24 }} />
    </View>
  );

  const autos = profile ? profile.claimable.filter((t) => t.auto) : [];
  const toClaim = catalog ? claimableCatalog(catalog, claimed) : [];
  const toBuy = profile && catalog ? purchasableTags(catalog, profile.main) : [];

  return (
    <GradientBackground>
      <View style={[styles.screen, { paddingTop: topInset }]}>
        {header}
        <AsyncBoundary loading={profile === null} error={profile === null ? error : null} onRetry={() => void load()}>
          {() => profile == null ? null : (
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* main tag */}
            <Text style={[styles.section, { color: colors.textSecondary }]}>Main tag</Text>
            {profile.main ? (
              <View style={styles.chips}>
                <TagBadge label={profile.main.label} tone="main" />
              </View>
            ) : (
              <Text style={[styles.hint, { color: colors.textSecondary }]}>No main tag yet.</Text>
            )}
            {toBuy.map((t) => (
              <ClayButton key={t.key} label={`Get the ${t.label} tag`} tone="primary" onPress={() => navigation.navigate('Shop')} style={styles.buyBtn} />
            ))}

            {/* auto tags */}
            {autos.length > 0 ? (
              <>
                <Text style={[styles.section, { color: colors.textSecondary }]}>Automatic</Text>
                <View style={styles.chips}>
                  {autos.map((t) => (
                    <TagBadge key={t.key} label={tagLabel(t)} />
                  ))}
                </View>
              </>
            ) : null}

            {/* my claimed tags */}
            <Text style={[styles.section, { color: colors.textSecondary }]}>Your tags</Text>
            {claimed.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textSecondary }]}>You haven’t added any tags yet.</Text>
            ) : (
              claimed.map((t) => (
                <View key={t.key} style={[styles.row, { borderColor: colors.glassBorder }]}>
                  <View style={styles.rowMain}>
                    <TagBadge label={tagLabel(t)} />
                    <Text style={[styles.sensitive, { color: colors.textSecondary }]}>
                      {t.displayed ? 'shown on your profile' : 'hidden'}
                      {t.sensitive ? ' · sensitive' : ''}
                    </Text>
                  </View>
                  <Switch value={t.displayed} onValueChange={(v) => void toggleDisplay(t, v)} accessibilityLabel={`Show ${t.label} on profile`} />
                  <Pressable onPress={() => revoke(t)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${t.label}`}>
                    <Icon name="close" size={20} color={colors.danger} />
                  </Pressable>
                </View>
              ))
            )}

            {/* claim new */}
            {toClaim.length > 0 ? (
              <>
                <Text style={[styles.section, { color: colors.textSecondary }]}>Add a tag</Text>
                {toClaim.map((t) => (
                  <View key={t.key} style={[styles.row, { borderColor: colors.glassBorder }]}>
                    <Text style={[styles.claimLabel, { color: colors.textPrimary }]}>
                      {t.label}
                      {t.sensitive ? <Text style={{ color: colors.textSecondary }}> · sensitive</Text> : null}
                    </Text>
                    <ClayButton label="Add" tone="neutral" onPress={() => startClaim(t)} />
                  </View>
                ))}
              </>
            ) : null}
          </ScrollView>
          )}
        </AsyncBoundary>

        {/* inline claim sheet */}
        {claiming ? (
          <View style={[styles.sheet, { backgroundColor: colors.glassFill, borderColor: colors.glassBorder }]}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Add “{claiming.label}”</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder, color: colors.textPrimary }]}
              placeholder={`Your ${claiming.label.toLowerCase()} (optional)`}
              placeholderTextColor={colors.textSecondary}
              value={value}
              onChangeText={setValue}
              maxLength={60}
            />
            {claiming.sensitive ? (
              <View style={styles.consentRow}>
                <Switch value={consent} onValueChange={setConsent} />
                <Text style={[styles.consentText, { color: colors.textSecondary }]}>
                  I consent to showing this sensitive tag. It’s optional and can be removed anytime.
                </Text>
              </View>
            ) : null}
            <View style={styles.sheetActions}>
              <ClayButton label="Cancel" tone="neutral" onPress={() => setClaiming(null)} style={styles.flex} />
              <ClayButton label={busy ? 'Adding…' : 'Add tag'} tone="primary" onPress={submitClaim} style={styles.flex} />
            </View>
          </View>
        ) : null}
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  body: { paddingBottom: spacing.xxl, gap: spacing.sm },
  section: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, marginTop: spacing.md },
  hint: { fontSize: typography.sizes.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  buyBtn: { marginTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radii.md, padding: spacing.sm },
  rowMain: { flex: 1, gap: 2 },
  sensitive: { fontSize: typography.sizes.xs },
  claimLabel: { flex: 1, fontSize: typography.sizes.md },
  sheet: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  sheetTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  input: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.sizes.md },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  consentText: { flex: 1, fontSize: typography.sizes.sm },
  sheetActions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
