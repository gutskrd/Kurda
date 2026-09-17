import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { sectionLabel, display } from '../theme/fonts';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { Icon } from '../theme/Icon';
import { useI18n } from '../i18n/I18nContext';
import { myGroups, type Group } from '../groups/api';

interface Conversation {
  userId: string;
  username: string;
  lastMessage: string;
  lastFromMe: boolean;
  unread: number;
}

/** Conversation list (KUR-083). */
export function ChatListScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  useFocusEffect(
    useCallback(() => {
      void client.get<{ conversations: Conversation[] }>('/chat/conversations').then((r) => {
        if (r.ok) setConvos(r.data.conversations);
      });
      void myGroups(client).then((r) => {
        if (r.ok) setGroups(r.data.groups);
      });
    }, [client]),
  );

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: topInset }]}>
          <Pressable onPress={onExit} hitSlop={10}><Text style={[styles.close, { color: colors.primary }]}>‹ {t('common.back')}</Text></Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('nav.messages')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <FlatList
          data={convos}
          keyExtractor={(c) => c.userId}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            /*
              Always rendered, even with no clubs. The heading is the only way
              through to discovery, and someone in no clubs is exactly the
              person who needs to find one.
            */
            <View style={styles.section}>
              {
                /* the heading is the way in: a club you have not joined is
                   not in this list, so discovery has to be reachable from it */
              }
                <Pressable
                  style={styles.sectionRow}
                  onPress={() => navigation.navigate('Clubs')}
                  accessibilityRole="button"
                  accessibilityLabel={t('groups.discover')}
                >
                  <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('groups.section')}</Text>
                  <Icon name="chevron-right" size={16} tone="secondary" />
                </Pressable>
                {groups.map((g) => (
                  <Pressable
                    key={g.id}
                    style={[styles.row, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]}
                    onPress={() => navigation.navigate('GroupThread', { groupId: g.id, name: g.name })}
                    accessibilityRole="button"
                    accessibilityLabel={t('groups.open', { name: g.name })}
                  >
                    <InitialsAvatar name={g.name} id={g.id} size={44} />
                    <View style={styles.main}>
                      <Text style={[styles.name, { color: colors.textPrimary }]}>{g.name}</Text>
                      <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>
                        {t('groups.memberCount', { count: g.memberCount })}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              {groups.length === 0 ? (
                <Text style={[styles.preview, { color: colors.textSecondary }]}>{t('groups.noGroupsBody')}</Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.row, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]}
              onPress={() => navigation.navigate('Chat', { userId: item.userId, username: item.username })}
            >
              <InitialsAvatar name={item.username} id={item.userId} size={44} />
              <View style={styles.main}>
                <Text style={[styles.name, { color: colors.textPrimary }]}>{item.username}</Text>
                <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.lastFromMe ? t('chat.lastFromYou', { preview: item.lastMessage }) : item.lastMessage}
                </Text>
              </View>
              {item.unread > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.accent }]}><Text style={[styles.badgeText, { color: colors.textOnPrimary }]}>{item.unread}</Text></View>
              ) : null}
            </Pressable>
          )}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>{t('chat.noMessagesBody')}</Text>}
        />
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  close: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, width: 40 },
  title: { ...display(typography.sizes.lg) },
  list: { padding: spacing.lg, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md },
  main: { flex: 1 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  preview: { fontSize: typography.sizes.sm },
  badge: { minWidth: 22, height: 22, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  empty: { textAlign: 'center', marginTop: spacing.xl },
  section: { gap: spacing.xs, marginBottom: spacing.md },
  sectionTitle: { ...sectionLabel },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
