import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import type { TranslationKey } from '../i18n/translations';
import type { RootNavigation, RootStackParamList } from '../navigation/rootStack';
import { Avatar } from '../profile/Avatar';
import { useDirection } from '../reports/direction';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { Pressable } from '../theme/Pressable';
import { heldDim } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { askParent } from './api';
import { PinPrompt } from './PinSheet';

/** A child's own numbers, read with the account. */
interface Mine {
  xp: number;
  streak: { current: number } | null;
}

type Place = Exclude<keyof RootStackParamList, 'Tabs'>;

/** What a child can open, in three groups, each with its glyph and name. */
const LEARN: ReadonlyArray<{ route: Place; icon: IconName; label: TranslationKey }> = [
  { route: 'PracticeHub', icon: 'target', label: 'child.tile.practice' },
  { route: 'Stories', icon: 'story', label: 'stories.title' },
  { route: 'Alphabet', icon: 'text-t', label: 'nav.alphabet' },
  { route: 'Words', icon: 'text', label: 'words.title' },
  { route: 'Dictionary', icon: 'dictionary', label: 'nav.dictionary' },
  { route: 'Riddles', icon: 'question', label: 'child.tile.riddles' },
  { route: 'Proverbs', icon: 'quotes', label: 'child.tile.proverbs' },
];
const PLAY: ReadonlyArray<{ route: Place; icon: IconName; label: TranslationKey }> = [
  { route: 'Wordle', icon: 'grid', label: 'games.wordle.name' },
  { route: 'BuildSentence', icon: 'tiles', label: 'games.sentence.name' },
  { route: 'HearIt', icon: 'ear', label: 'games.hear.name' },
  { route: 'Race', icon: 'keyboard', label: 'games.race.name' },
];
const MINE: ReadonlyArray<{ route: Place; icon: IconName; label: TranslationKey }> = [
  { route: 'Tree', icon: 'sparkle', label: 'tree.title' },
  { route: 'Badges', icon: 'medal', label: 'badges.title' },
];

/**
 * Child mode's home: a greeting with the child's avatar, their streak and XP, the one main button to the next
 * lesson, and tiles for everything a child may use, with nothing social anywhere. Something that is bought is asked
 * of a parent instead. On a parent's phone a quiet way back to them stands at the end, behind the family PIN.
 */
export function ChildHome(): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  const [mine, setMine] = useState<Mine | null>(null);
  const [asked, setAsked] = useState<'busy' | 'done' | null>(null);
  const [pin, setPin] = useState(false);
  // Two tiles to a row, each half the row less the gap, so a row of one is a half like the others.
  const [gridWidth, setGridWidth] = useState(0);
  const tileWidth = gridWidth > 0 ? (gridWidth - TILE_GAP) / 2 : undefined;
  const parent = user?.child?.parentName ?? '';

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void client.get<{ user: Mine }>('/me').then((res) => {
        if (live && res.ok) setMine({ xp: res.data.user.xp ?? 0, streak: res.data.user.streak ?? null });
      });
      return () => {
        live = false;
      };
    }, [client]),
  );

  const ask = (): void => {
    setAsked('busy');
    void askParent(client, 'plus', 'app.hevalo.family.monthly').then((res) => {
      setAsked(res.ok ? 'done' : null);
      if (res.ok) haptic('celebrate');
    });
  };

  const name = user?.displayName ?? '';
  const streak = mine?.streak?.current ?? 0;
  const tiles = (list: typeof LEARN) => (
    <View style={[styles.grid, { flexDirection: dir.row }]} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
      {list.map((tile) => (
        <PressableScale
          key={tile.route}
          onPress={() => navigation.navigate(tile.route as never)}
          accessibilityRole="button"
          accessibilityLabel={t(tile.label)}
          style={[styles.tile, tileWidth ? { width: tileWidth } : styles.half, { backgroundColor: colors.glassFill, shadowColor: colors.softShadow }]}
          testID={`child-tile-${tile.route}`}
        >
          <Icon name={tile.icon} size={28} color={colors.textPrimary} />
          <Text style={[styles.tileName, { color: colors.textPrimary }]} numberOfLines={2}>
            {t(tile.label)}
          </Text>
        </PressableScale>
      ))}
    </View>
  );

  return (
    <GradientBackground>
      <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => navigation.navigate('ChildProfile')}
          accessibilityRole="button"
          accessibilityLabel={t('child.profile.open', { name })}
          style={({ pressed }) => [styles.hello, { flexDirection: dir.row }, pressed && heldDim]}
          testID="child-hello"
        >
          <Avatar name={name} photoUrl={user?.avatarUrl ?? null} size={64} />
          <View style={styles.helloWords}>
            <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} accessibilityRole="header" numberOfLines={1}>
              {t('child.hello', { name })}
            </Text>
            <View style={[styles.stats, { flexDirection: dir.row }]}>
              <Icon name="flame" size={18} color={colors.textSecondary} />
              <Text style={[styles.stat, { color: colors.textSecondary }]}>
                {streak === 1 ? t('parental.streakOne') : streak > 1 ? t('parental.streak', { count: formatNumber(streak, locale) }) : t('child.streakNone')}
              </Text>
              <Icon name="bolt" size={18} color={colors.textSecondary} />
              <Text style={[styles.stat, { color: colors.textSecondary }]}>{t('family.board.xp', { xp: formatNumber(mine?.xp ?? 0, locale) })}</Text>
            </View>
          </View>
        </Pressable>

        <ClayButton label={t('child.start')} tone="primary" size="large" onPress={() => navigation.navigate('NextLesson')} testID="child-start" />

        <Text style={[styles.section, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
          {t('child.section.learn')}
        </Text>
        {tiles(LEARN)}
        <Text style={[styles.section, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
          {t('child.section.play')}
        </Text>
        {tiles(PLAY)}
        <Text style={[styles.section, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
          {t('child.section.mine')}
        </Text>
        {tiles(MINE)}

        <View style={[styles.ask, { backgroundColor: colors.glassFill, shadowColor: colors.softShadow }]} testID="child-ask">
          <View style={[styles.askHead, { flexDirection: dir.row }]}>
            <Icon name="crown" size={24} color={colors.textPrimary} />
            <Text style={[styles.askTitle, dir.text, { color: colors.textPrimary }]}>{t('child.ask.title')}</Text>
          </View>
          <Text style={[styles.askBody, dir.text, { color: colors.textSecondary }]}>
            {asked === 'done' ? t('child.ask.done', { name: parent }) : t('child.ask.body', { name: parent })}
          </Text>
          {asked === 'done' ? null : <ClayButton label={t('child.ask.action')} icon="heart" variant="outline" busy={asked === 'busy'} onPress={ask} testID="child-ask-go" />}
        </View>

        {user?.child?.returnable ? (
          <Pressable
            onPress={() => setPin(true)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.back, pressed && heldDim]}
            testID="child-back"
          >
            <Icon name="lock" size={16} color={colors.textSecondary} />
            <Text style={[styles.backText, { color: colors.textSecondary }]}>{t('child.back.link', { name: parent })}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <PinPrompt visible={pin} parentName={parent} onClose={() => setPin(false)} />
    </GradientBackground>
  );
}

/** The room between two tiles, across and down. */
const TILE_GAP = spacing.sm + 4;

const styles = StyleSheet.create({
  page: { paddingHorizontal: layout.gutter, gap: spacing.md },
  hello: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.lg },
  helloWords: { flex: 1, gap: spacing.xs },
  title: { fontSize: typography.sizes.title, fontWeight: typography.weights.semibold },
  stats: { alignItems: 'center', gap: spacing.xs + 2, flexWrap: 'wrap' },
  stat: { fontSize: typography.sizes.text, marginEnd: spacing.sm },
  section: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, marginTop: spacing.sm },
  grid: { flexWrap: 'wrap', gap: TILE_GAP },
  half: { width: '47%' },
  tile: {
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 4,
    borderRadius: radii.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  tileName: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, textAlign: 'center' },
  ask: {
    gap: spacing.sm + 4,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  askHead: { alignItems: 'center', gap: spacing.sm },
  askTitle: { flex: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  askBody: { fontSize: typography.sizes.text, lineHeight: 22 },
  back: { minHeight: MIN_TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs + 2, marginTop: spacing.sm },
  backText: { fontSize: typography.sizes.text },
});
