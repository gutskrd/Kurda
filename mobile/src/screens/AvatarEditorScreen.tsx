import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AvatarConfig, AvatarSlot } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { KurdishAvatar } from '../avatar/KurdishAvatar';
import {
  cancel,
  initEditor,
  isDirty,
  markSaved,
  select,
  SLOT_LABELS,
  SLOT_ORDER,
  type EditorState,
} from '../avatar/editorState';
import type { RootStackParamList } from '../navigation/rootStack';
import { colors, radii, spacing, typography } from '../theme/tokens';

interface CosmeticListItem {
  id: string;
  slot: AvatarSlot;
  nameKu: string;
  nameEn: string;
  owned: boolean;
  base: boolean;
}

type Props = NativeStackScreenProps<RootStackParamList, 'AvatarEditor'>;

export function AvatarEditorScreen({ navigation }: Props) {
  const { client } = useAuth();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [items, setItems] = useState<CosmeticListItem[]>([]);
  const [slot, setSlot] = useState<AvatarSlot>('outfit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCosmetics = async () => {
    const cosmetics = await client.get<{ items: CosmeticListItem[] }>('/me/cosmetics');
    if (cosmetics.ok) setItems(cosmetics.data.items);
  };

  useEffect(() => {
    (async () => {
      const avatar = await client.get<{ config: AvatarConfig }>('/me/avatar');
      if (avatar.ok) setEditor(initEditor(avatar.data.config));
      await loadCosmetics();
    })();
    // loadCosmetics is stable per client; effect intentionally keys on client only
  }, [client]);

  if (!editor) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await client.put<{ config: AvatarConfig }>('/me/avatar', editor.config);
    setBusy(false);
    if (res.ok) {
      setEditor(markSaved(editor));
      navigation.goBack();
      return;
    }
    // item may have been revoked since the screen loaded (refund edge):
    // surface the error and refresh ownership so locks are accurate
    setError(res.error.message);
    await loadCosmetics();
  };

  return (
    <View style={styles.screen}>
      <View style={styles.preview}>
        <KurdishAvatar config={editor.config} size={140} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
        {SLOT_ORDER.map((s) => (
          <Pressable
            key={s}
            onPress={() => setSlot(s)}
            style={[styles.tab, slot === s && styles.tabActive]}
          >
            <Text style={[styles.tabText, slot === s && styles.tabTextActive]}>
              {SLOT_LABELS[s].ku}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView contentContainerStyle={styles.grid}>
        {items
          .filter((item) => item.slot === slot)
          .map((item) => {
            const selected = editor.config[slot] === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setEditor(select(editor, slot, item.id, item.owned))}
                style={[
                  styles.item,
                  selected && styles.itemSelected,
                  !item.owned && styles.itemLocked,
                ]}
              >
                <Text style={styles.itemName}>{item.nameKu}</Text>
                <Text style={styles.itemSub}>{item.owned ? item.nameEn : `🔒 ${item.nameEn}`}</Text>
              </Pressable>
            );
          })}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.cancel]}
          onPress={() => {
            setEditor(cancel(editor));
            navigation.goBack();
          }}
        >
          <Text style={styles.cancelText}>Betal — Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.save, (!isDirty(editor) || busy) && styles.disabled]}
          disabled={!isDirty(editor) || busy}
          onPress={save}
        >
          {busy ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.saveText}>Tomar bike — Save</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.xl },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  preview: { alignItems: 'center', marginBottom: spacing.md },
  tabs: { flexGrow: 0, paddingHorizontal: spacing.md },
  tab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  tabTextActive: { color: colors.textOnPrimary, fontWeight: typography.weights.medium },
  error: {
    color: colors.danger,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
  },
  item: {
    width: '47%',
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  itemSelected: { borderColor: colors.primary },
  itemLocked: { opacity: 0.5 },
  itemName: {
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    fontWeight: typography.weights.medium,
  },
  itemSub: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  button: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  cancel: { backgroundColor: colors.surface },
  cancelText: { color: colors.textPrimary },
  save: { backgroundColor: colors.primary },
  saveText: { color: colors.textOnPrimary, fontWeight: typography.weights.medium },
  disabled: { opacity: 0.5 },
});
