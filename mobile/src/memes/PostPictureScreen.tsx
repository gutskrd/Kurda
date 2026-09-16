import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { radii, spacing, typography } from '../theme/tokens';
import { ClayButton, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { useI18n } from '../i18n/I18nContext';
import { uploadPostImage } from './imageUpload';
import type { Category, ImagePost } from './types';

/** The two things a picture can be posted as, in the order the browser offers them. */
const CATEGORIES: readonly Category[] = ['image', 'meme'];

/**
 * Post a picture (KUR-291), which the phone could read but never write: it
 * showed image posts, reacted to them and commented on them, and had no way to
 * make one.
 *
 * Deliberately not a port of the browser's photo editor — that is a canvas with
 * filters, stickers, text layers and a colour picker, none of which has a place
 * on a phone that already has a camera roll and a system editor. `allowsEditing`
 * hands the crop to the OS, which does it better and is the control people
 * already know.
 *
 * Upload first, create second: the server only accepts a media id it has
 * already validated, resized and scanned.
 */
export function PostPictureScreen({
  onExit,
  onPosted,
}: {
  onExit: () => void;
  onPosted?: (post: ImagePost) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();

  const [asset, setAsset] = useState<{ uri: string; contentType: string } | null>(null);
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<Category>('image');
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    if (busy) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('photo.accessNeeded'), t('picture.accessHelp'));
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // the crop is the system's, not ours, and unconstrained: a meme is not
      // square and neither is most of a camera roll
      allowsEditing: true,
      quality: 0.9,
    });
    const chosen = picked.canceled ? null : picked.assets[0];
    if (!chosen) return;
    setAsset({ uri: chosen.uri, contentType: chosen.mimeType ?? 'image/jpeg' });
  };

  const submit = async () => {
    if (busy || !asset) return;
    setBusy(true);

    const up = await uploadPostImage(client, asset, t);
    if (!up.ok) {
      setBusy(false);
      Alert.alert(t('picture.uploadFailed'), up.error);
      return;
    }

    const made = await client.post<ImagePost>('/images', {
      imageMediaId: up.imageMediaId,
      caption: caption.trim() || undefined,
      category,
    });
    setBusy(false);
    if (!made.ok) {
      // the bytes are stored either way; only the post failed, so say so rather
      // than dropping what they chose without a word
      Alert.alert(t('picture.postFailed'), describeError(made.error, t));
      return;
    }
    onPosted?.(made.data);
    onExit();
  };

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={topInset}
      >
        <View style={[styles.screen, { paddingTop: topInset }]}>
          <View style={styles.titleRow}>
            <Pressable onPress={onExit} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
              <Icon name="close" size={22} color={colors.textSecondary} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.primary }]}>{t('picture.title')}</Text>
            <View style={{ width: 22 }} />
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Pressable
              onPress={pick}
              accessibilityRole="button"
              accessibilityLabel={asset ? t('picture.changePicture') : t('picture.choosePicture')}
              style={[styles.dropzone, { borderColor: colors.glassBorder, backgroundColor: colors.controlTrack }]}
            >
              {asset ? (
                <Image source={{ uri: asset.uri }} style={styles.preview} resizeMode="contain" />
              ) : (
                <View style={styles.empty}>
                  <Icon name="image" size={40} tone="secondary" />
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('picture.choosePicture')}</Text>
                </View>
              )}
            </Pressable>

            <Segmented<Category>
              options={CATEGORIES}
              value={category}
              onChange={setCategory}
              labelOf={(c) => t(c === 'meme' ? 'picture.asMeme' : 'picture.asPicture')}
            />

            <TextInput
              style={[
                styles.caption,
                { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder, color: colors.textPrimary },
              ]}
              placeholder={t('picture.captionPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={2000}
              accessibilityLabel={t('picture.captionLabel')}
            />

            {busy ? (
              <View style={styles.busy}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.busyText, { color: colors.textSecondary }]}>{t('picture.posting')}</Text>
              </View>
            ) : (
              // ClayButton has no disabled state, and adding one to the shared
              // component for this screen alone would be the tail wagging the
              // dog: dim it, and let submit() keep the real guard
              <ClayButton
                label={t('picture.post')}
                tone="primary"
                onPress={submit}
                style={asset ? undefined : styles.dim}
              />
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  body: { gap: spacing.md, paddingBottom: spacing.xxl },
  dropzone: {
    borderWidth: 1,
    borderRadius: radii.lg,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  preview: { width: '100%', height: 260 },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyText: { fontSize: typography.sizes.sm, textAlign: 'center' },
  caption: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 90,
    textAlignVertical: 'top',
    fontSize: typography.sizes.md,
  },
  busy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  busyText: { fontSize: typography.sizes.sm },
  dim: { opacity: 0.5 },
});
