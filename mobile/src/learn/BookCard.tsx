import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { characterSvg } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/** Hamo's face on the card. */
const ART = 52;

/**
 * Hevalo's book in Stories: one slim card opening the PDF of every online chapter (api/src/books), with Hamo's
 * stories, words and grammar, to keep, share or print. Shown only once a chapter is online, never when the server
 * has no book.
 */
export function BookCard(): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [chapters, setChapters] = useState(0);
  const face = useMemo(() => characterSvg('hamo', { crop: 'head', width: ART, idPrefix: 'book-card', title: '' }), []);

  const load = useCallback(() => {
    let live = true;
    void client.get<{ chapters: number[] }>('/books/road').then((res) => {
      // An answer without a chapter list (an older server) shows no card rather than breaking Learn.
      if (live && res.ok) setChapters(Array.isArray(res.data?.chapters) ? res.data.chapters.length : 0);
    });
    return () => {
      live = false;
    };
  }, [client]);
  useFocusEffect(load);

  if (chapters === 0) return null;
  const sub = chapters === 1 ? t('book.card.subOne') : t('book.card.sub', { count: formatNumber(chapters, locale) });
  const open = (): void => void Linking.openURL(`${client.baseUrl}/books/road.pdf`).catch(() => undefined);
  return (
    <PressableScale
      onPress={open}
      accessibilityRole="link"
      accessibilityLabel={`${t('book.card.title')}. ${sub}`}
      style={[styles.card, { flexDirection: dir.row, backgroundColor: colors.surface }]}
      testID="book-card"
    >
      <View style={[styles.art, { backgroundColor: colors.controlTrack }]}>
        <SvgXml xml={face} width={ART} height={ART} />
      </View>
      <View style={styles.main}>
        <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} numberOfLines={2}>
          {t('book.card.title')}
        </Text>
        {/* What the book holds, shown whole: three lines truncated on narrow phones and in German. */}
        <Text style={[styles.sub, dir.text, { color: colors.textSecondary }]}>{sub}</Text>
      </View>
      <Icon name="book" size={18} color={colors.textSecondary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: spacing.sm + 4, borderRadius: radii.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm + 2 },
  art: { borderRadius: radii.md, overflow: 'hidden' },
  main: { flex: 1, gap: 1 },
  title: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  sub: { fontSize: typography.sizes.text, lineHeight: 20 },
});
