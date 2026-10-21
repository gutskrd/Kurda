import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { foldForSearch } from '@kurda/shared';
import { BottomSheet } from '../theme/BottomSheet';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ClayButton, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import type { RootNavigation } from '../navigation/rootStack';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { SearchField } from '../shop/ItemFilters';
import { createGroup, discoverGroups, joinGroup, myGroups, type Group } from './api';
import { GroupAvatar } from './GroupAvatar';

type Privacy = 'open' | 'invite';
const PRIVACIES: readonly Privacy[] = ['open', 'invite'];

type Found = Group & { joined?: boolean };

/** Every word typed somewhere in the group's name or description, accents aside. */
function matches(group: Found, words: string[]): boolean {
  if (words.length === 0) return true;
  const said = foldForSearch(`${group.name} ${group.description ?? ''}`);
  return words.every((w) => said.includes(w));
}

/**
 * Find a group and join it (KUR-084).
 *
 * A list the eye can run down: each group's picture in its rounded square
 * (people are circles), its name on one line, what it is about in two, how
 * many are in it, and one small button at the end — Join, or Open for a group
 * you are already in. A search at the top narrows the list by name or
 * description. Making a group is the + in the corner.
 */
export function ClubsScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();

  const [all, setAll] = useState<Found[] | null>(null);
  const [mineIds, setMineIds] = useState<Set<string>>(new Set());
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    void discoverGroups(client).then((r) => {
      if (r.ok) setAll(r.data.groups);
      else {
        setAll([]);
        setError(describeError(r.error, t));
      }
    });
    // which of them the reader is already in, for a server that does not say so itself
    void myGroups(client).then((r) => {
      if (r.ok) setMineIds(new Set(r.data.groups.map((g) => g.id)));
    });
  }, [client, t]);

  useFocusEffect(load);

  const join = async (group: Found) => {
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

  const words = useMemo(() => foldForSearch(query).split(/\s+/).filter(Boolean), [query]);
  const shown = useMemo(() => (all ?? []).filter((g) => matches(g, words)), [all, words]);

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader
          title={t('groups.discover')}
          onBack={onExit}
          right={
            <Pressable onPress={() => setComposing(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('groups.new')} style={styles.plus}>
              <Icon name="plus" size={24} color={colors.textPrimary} />
            </Pressable>
          }
        />

        <FlatList
          data={all === null ? [] : shown}
          keyExtractor={(g) => g.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.top}>
              {(all?.length ?? 0) > 0 ? <SearchField value={query} onChange={setQuery} label={t('groups.search')} /> : null}
              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
            </View>
          }
          ItemSeparatorComponent={() => <View style={[styles.rule, { backgroundColor: colors.separator }]} />}
          renderItem={({ item }) => (
            <DiscoverRow
              group={item}
              joined={item.joined ?? mineIds.has(item.id)}
              joining={joining === item.id}
              disabled={joining !== null}
              onJoin={() => void join(item)}
              onOpen={() => navigation.navigate('GroupThread', { groupId: item.id, name: item.name })}
            />
          )}
          ListEmptyComponent={
            all === null ? (
              <DiscoverSkeleton />
            ) : all.length > 0 ? (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('groups.noMatch', { query: query.trim() })}</Text>
            ) : (
              <View style={styles.nothing}>
                <Icon name="people" size={40} color={colors.textSecondary} />
                <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('groups.nothingToDiscover')}</Text>
                <ClayButton label={t('groups.new')} icon="plus" onPress={() => setComposing(true)} />
              </View>
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

/** One group in the list: its picture, name, what it is about, its size, and Join or Open. */
function DiscoverRow({
  group,
  joined,
  joining,
  disabled,
  onJoin,
  onOpen,
}: {
  group: Found;
  joined: boolean;
  joining: boolean;
  disabled: boolean;
  onJoin: () => void;
  onOpen: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const inviteOnly = group.privacy === 'invite';
  const meta = [t('groups.memberCount', { count: group.memberCount }), inviteOnly ? t('groups.inviteGroup') : null].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={joined ? onOpen : undefined}
      disabled={!joined}
      accessibilityRole={joined ? 'button' : undefined}
      accessibilityLabel={joined ? t('groups.open', { name: group.name }) : undefined}
      style={({ pressed }) => [styles.row, { flexDirection: dir.row }, pressed && joined && { backgroundColor: colors.controlTrack }]}
    >
      <GroupAvatar name={group.name} id={group.id} size={ROW_AVATAR} photoUrl={group.photoUrl} />
      <View style={styles.main}>
        <Text style={[styles.name, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
          {group.name}
        </Text>
        {group.description ? (
          <Text style={[styles.about, dir.free, { color: colors.textSecondary }]} numberOfLines={2}>
            {group.description}
          </Text>
        ) : null}
        <Text style={[styles.meta, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {joined ? (
        <Pill label={t('groups.openThread')} onPress={onOpen} accessibilityLabel={t('groups.open', { name: group.name })} />
      ) : inviteOnly ? null : (
        <Pill
          label={joining ? t('groups.joining') : t('groups.join')}
          filled
          busy={joining}
          disabled={disabled}
          onPress={onJoin}
          accessibilityLabel={`${t('groups.join')}: ${group.name}`}
        />
      )}
    </Pressable>
  );
}

/** A small button at the end of a row: filled in ink for the one thing to do, outlined for the quieter one. */
export function Pill({
  label,
  onPress,
  filled = false,
  busy = false,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  filled?: boolean;
  busy?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [
        styles.pill,
        filled ? { backgroundColor: colors.textPrimary } : { borderColor: colors.textSecondary, borderWidth: StyleSheet.hairlineWidth * 2 },
        (pressed || (disabled && !busy)) && styles.pillDim,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={filled ? colors.background : colors.textPrimary} style={styles.pillBusy} /> : null}
      <Text style={[styles.pillText, { color: filled ? colors.background : colors.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The list while it loads: a few rows in its own shape. */
function DiscoverSkeleton(): React.JSX.Element {
  return (
    <View>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={ROW_AVATAR} height={ROW_AVATAR} radius={Math.round(ROW_AVATAR * 0.22)} />
          <View style={styles.main}>
            <SkeletonText size={typography.sizes.md} width={i % 2 ? '52%' : '68%'} />
            <SkeletonText size={typography.sizes.sm} width="90%" />
            <SkeletonText size={typography.sizes.xs} width="30%" />
          </View>
          <Skeleton width={64} height={32} radius={radii.pill} />
        </View>
      ))}
    </View>
  );
}

const ROW_AVATAR = 52;

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
    // the shared sheet: it moves up out of the keyboard's way while the name is typed
    <BottomSheet visible={open} onClose={onClose} title={t('groups.new')}>
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
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  plus: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: spacing.xxl },
  top: { paddingHorizontal: layout.gutter, paddingTop: spacing.xs, paddingBottom: spacing.sm, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: layout.gutter, paddingVertical: spacing.md, minHeight: 80 },
  // the line between two groups starts where the words do, as in a settings list
  rule: { height: StyleSheet.hairlineWidth, marginStart: layout.gutter + ROW_AVATAR + spacing.md },
  main: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  about: { fontSize: typography.sizes.sm, lineHeight: 20 },
  meta: { fontSize: typography.sizes.xs, marginTop: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: spacing.md, borderRadius: radii.pill },
  pillDim: { opacity: 0.6 },
  pillBusy: { marginEnd: 2 },
  pillText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  nothing: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
  empty: { textAlign: 'center', fontSize: typography.sizes.sm, lineHeight: 20, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  error: { textAlign: 'center', fontSize: typography.sizes.sm },
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
