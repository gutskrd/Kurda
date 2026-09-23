import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { display } from '../theme/fonts';
import { ClayButton, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import type { RootNavigation } from '../navigation/rootStack';
import { useI18n } from '../i18n/I18nContext';
import { createGroup, discoverGroups, joinGroup, myGroups, type Group } from './api';

type Privacy = 'open' | 'invite';
const PRIVACIES: readonly Privacy[] = ['open', 'invite'];

/**
 * Find a club and join it (KUR-084).
 *
 * #760 gave the phone club chat and no way to get into a club: you could read
 * a club you had joined in the browser, and that was all. This is the other
 * half — discover, join, and start one.
 *
 * Invite-only clubs are listed but not joinable from here, which is the
 * server's rule and worth showing rather than hiding: a club someone told you
 * about should exist when you go looking for it.
 */
export function ClubsScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();

  const [all, setAll] = useState<Group[] | null>(null);
  const [mineIds, setMineIds] = useState<Set<string>>(new Set());
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(() => {
    void discoverGroups(client).then((r) => {
      if (r.ok) setAll(r.data.groups);
      else {
        setAll([]);
        setError(describeError(r.error, t));
      }
    });
    // which of them the reader is already in, so the row says Joined and not Join
    void myGroups(client).then((r) => {
      if (r.ok) setMineIds(new Set(r.data.groups.map((g) => g.id)));
    });
  }, [client, t]);

  useFocusEffect(load);

  const join = async (group: Group) => {
    if (joining) return;
    setJoining(group.id);
    setError(null);
    const res = await joinGroup(client, group.id);
    setJoining(null);
    if (!res.ok) {
      setError(describeError(res.error, t));
      return;
    }
    setMineIds((prev) => new Set(prev).add(group.id));
    navigation.navigate('GroupThread', { groupId: group.id, name: group.name });
  };

  return (
    <GradientBackground>
      <View style={styles.screen}>
        {/*
          A plus, not a sparkle. Making a club is adding one to a list; a
          sparkle says something delightful is about to happen and leaves you
          guessing what.
        */}
        <ScreenHeader
          title={t('groups.discover')}
          onBack={onExit}
          right={
            <Pressable onPress={() => setComposing(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('groups.new')}>
              <Icon name="plus" size={22} tone="primary" />
            </Pressable>
          }
        />

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <FlatList
          data={all ?? []}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const already = mineIds.has(item.id);
            const inviteOnly = item.privacy === 'invite';
            return (
              <View style={[styles.row, { backgroundColor: colors.controlTrack }]}>
                <InitialsAvatar name={item.name} id={item.id} size={44} />
                <View style={styles.main}>
                  <Text style={[styles.name, { color: colors.textPrimary }]}>{item.name}</Text>
                  <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
                    {t('groups.memberCount', { count: item.memberCount })}
                    {inviteOnly ? ` · ${t('groups.inviteOnly')}` : ''}
                  </Text>
                </View>
                {already ? (
                  <Pressable
                    onPress={() => navigation.navigate('GroupThread', { groupId: item.id, name: item.name })}
                    accessibilityRole="button"
                    accessibilityLabel={t('groups.open', { name: item.name })}
                  >
                    <Text style={[styles.joined, { color: colors.textSecondary }]}>{t('groups.joined')}</Text>
                  </Pressable>
                ) : inviteOnly ? null : (
                  <Pressable onPress={() => void join(item)} accessibilityRole="button" disabled={joining !== null}>
                    <Text style={[styles.join, { color: colors.primary }]}>
                      {joining === item.id ? t('groups.joining') : t('groups.join')}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            all === null ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('groups.nothingToDiscover')}</Text>
            )
          }
        />

        <NewClub
          open={composing}
          onClose={() => setComposing(false)}
          onCreated={(id, name) => {
            setComposing(false);
            load();
            navigation.navigate('GroupThread', { groupId: id, name });
          }}
        />
      </View>
    </GradientBackground>
  );
}

/** A Modal, not a positioned View: this screen sits inside the tab navigator. */
function NewClub({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('open');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (busy || trimmed.length < 2) return;
    setBusy(true);
    setError(null);
    const res = await createGroup(client, {
      name: trimmed,
      description: description.trim() || undefined,
      privacy,
    });
    setBusy(false);
    if (!res.ok) {
      setError(describeError(res.error, t));
      return;
    }
    setName('');
    setDescription('');
    onCreated(res.data.id, trimmed);
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.background }]}
          onPress={() => undefined}
        >
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{t('groups.new')}</Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('groups.name')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}
            value={name}
            onChangeText={setName}
            placeholder={t('groups.namePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            maxLength={60}
            accessibilityLabel={t('groups.name')}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('groups.description')}</Text>
          <TextInput
            style={[styles.input, styles.multiline, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={300}
            accessibilityLabel={t('groups.description')}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('groups.privacy')}</Text>
          <Segmented<Privacy>
            options={PRIVACIES}
            value={privacy}
            onChange={setPrivacy}
            labelOf={(p) => t(p === 'open' ? 'settings.visibility.everyone' : 'groups.inviteOnly')}
          />
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {t(privacy === 'open' ? 'groups.privacy.openHint' : 'groups.privacy.inviteHint')}
          </Text>

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          <ClayButton
            label={busy ? t('groups.creating') : t('groups.create')}
            tone="primary"
            onPress={submit}
            style={name.trim().length >= 2 && !busy ? undefined : styles.dim}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  main: { flex: 1 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  sub: { fontSize: typography.sizes.sm },
  join: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, paddingHorizontal: spacing.sm },
  joined: { fontSize: typography.sizes.sm, paddingHorizontal: spacing.sm },
  empty: { textAlign: 'center', marginTop: spacing.xl },
  error: { textAlign: 'center', fontSize: typography.sizes.sm, paddingHorizontal: spacing.lg },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { margin: spacing.lg, padding: spacing.md, borderRadius: radii.lg, gap: spacing.sm },
  sheetTitle: { ...display(typography.sizes.lg) },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.sizes.md,
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  hint: { fontSize: typography.sizes.xs },
  dim: { opacity: 0.5 },
});
