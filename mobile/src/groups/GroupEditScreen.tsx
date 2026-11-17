import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import * as ImagePicker from 'expo-image-picker';
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX, GROUP_NAME_MIN, canEditGroup } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { showActions } from '../theme/actionSheet';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { uploadGroupPhoto } from '../profile/photoUpload';
import { GroupAvatar } from './GroupAvatar';
import { groupError } from './groupError';
import { clearGroupPhoto, groupDetail, updateGroup, type GroupDetail } from './api';
import { Loading } from '../theme/Loading';
import { heldDim } from '../theme/MotionParts';

/**
 * Change how a group presents itself, as its owner or an admin: its picture,
 * its name and what it is about.
 *
 * The picture changes the moment one is chosen — it is its own act, as it is
 * on a profile — and the words change on Save, which stays grey until there is
 * something new to save and the name is long enough, and is violet, as what
 * can be pressed is, once there is. Each field says how much
 * room is left. What the server refuses (a word not allowed here, a role taken
 * away meanwhile) is said in words under the fields, and nothing is lost.
 */
export function GroupEditScreen({ groupId, onExit }: { groupId: string; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // the group could not be read at all: said, with the way to ask again
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    void groupDetail(client, groupId).then((res) => {
      if (!active) return;
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      setDetail(res.data);
      setName(res.data.name);
      setDescription(res.data.description ?? '');
      setPhotoUrl(res.data.photoUrl ?? null);
    });
    return () => {
      active = false;
    };
    // a retry reads the group again
  }, [client, groupId, attempt]);

  const editable = canEditGroup(detail?.myRole ?? null);
  const trimmed = name.trim();
  const nameChanged = detail !== null && trimmed !== detail.name;
  const descriptionChanged = detail !== null && description.trim() !== (detail.description ?? '');
  const valid = GROUP_NAME_MIN <= trimmed.length && trimmed.length <= GROUP_NAME_MAX;
  const canSave = editable && valid && (nameChanged || descriptionChanged) && !saving;

  const save = async (): Promise<void> => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const res = await updateGroup(client, groupId, {
      ...(nameChanged ? { name: trimmed } : {}),
      ...(descriptionChanged ? { description: description.trim() } : {}),
    });
    setSaving(false);
    if (res.ok) onExit();
    else setError(groupError(res.error, t));
  };

  const pickPhoto = async (): Promise<void> => {
    // the system picker hands back only the chosen picture, so there is no permission to ask for
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    setUploading(true);
    setError(null);
    const res = await uploadGroupPhoto(client, groupId, { uri: asset.uri, contentType: asset.mimeType ?? 'image/jpeg' }, t, locale);
    setUploading(false);
    if (res.ok) setPhotoUrl(res.url);
    else setError(res.error || t('groups.photo.failed'));
  };

  const removePhoto = async (): Promise<void> => {
    setUploading(true);
    setError(null);
    const res = await clearGroupPhoto(client, groupId);
    setUploading(false);
    if (res.ok) setPhotoUrl(null);
    else setError(groupError(res.error, t));
  };

  const photoChoices = (): void => {
    if (!photoUrl) {
      void pickPhoto();
      return;
    }
    showActions({
      cancel: t('common.cancel'),
      actions: [
        { label: t('groups.photo.change'), onPress: () => void pickPhoto() },
        { label: t('groups.photo.remove'), destructive: true, onPress: () => void removePhoto() },
      ],
    });
  };

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader
          title={t('groups.edit')}
          onBack={onExit}
          right={
            <Pressable
              onPress={() => void save()}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave, busy: saving }}
              reach="open"
              testID="group-save"
              style={({ pressed }) => [styles.save, pressed && heldDim]}
            >
              {saving ? (
                <ActivityIndicator color={colors.textPrimary} />
              ) : (
                <Text style={[styles.saveText, { color: canSave ? colors.primary : colors.textSecondary }]}>{t('groups.save')}</Text>
              )}
            </Pressable>
          }
        />
        {detail === null ? (
          loadError ? (
            <ErrorRetry message={describeError(loadError, t)} onRetry={() => setAttempt((n) => n + 1)} />
          ) : (
            <Loading style={styles.loading} />
          )
        ) : (
          <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
            <View style={styles.photo}>
              <Pressable
                onPress={photoChoices}
                disabled={!editable || uploading}
                accessibilityRole="button"
                accessibilityLabel={photoUrl ? t('groups.photo.change') : t('groups.photo.add')}
                style={({ pressed }) => pressed && heldDim}
              >
                <GroupAvatar name={trimmed || detail.name} id={detail.id} size={PHOTO} photoUrl={photoUrl} />
                {uploading ? (
                  <View style={[styles.uploading, { backgroundColor: colors.scrim }]}>
                    <ActivityIndicator color={colors.textOnScrim} />
                  </View>
                ) : (
                  <View style={[styles.camera, { backgroundColor: colors.textPrimary, borderColor: colors.background }]}>
                    <Icon name="image" size={16} color={colors.background} />
                  </View>
                )}
              </Pressable>
              {/* drawn 32 tall round its line, so the Pressable reaches it to a fingertip; 12 under the picture keeps it clear of the camera badge */}
              <Pressable
                onPress={photoChoices}
                disabled={!editable || uploading}
                accessibilityRole="button"
                testID="group-photo-link"
                style={({ pressed }) => [styles.photoLinkHit, pressed && heldDim]}
              >
                <Text style={[styles.photoLink, { color: colors.textPrimary }]}>{photoUrl ? t('groups.photo.change') : t('groups.photo.add')}</Text>
              </Pressable>
            </View>

            <Field
              label={t('groups.name')}
              value={name}
              onChange={setName}
              max={GROUP_NAME_MAX}
              placeholder={t('groups.namePlaceholder')}
              editable={editable}
            />
            <Field
              label={t('groups.description')}
              value={description}
              onChange={setDescription}
              max={GROUP_DESCRIPTION_MAX}
              placeholder={t('groups.descriptionPlaceholder')}
              editable={editable}
              multiline
            />

            {error ? <Text style={[styles.error, dir.text, { color: colors.danger }]}>{error}</Text> : null}
            {!editable ? <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('groups.notAdmin')}</Text> : null}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

/** A labelled field with how much of it is used, the count turning to the warning colour only at the end. */
function Field({
  label,
  value,
  onChange,
  max,
  placeholder,
  editable,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  max: number;
  placeholder: string;
  editable: boolean;
  multiline?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const used = value.length;
  return (
    <View style={styles.field}>
      <View style={[styles.fieldTop, { flexDirection: dir.row }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.count, { color: used >= max ? colors.goldText : colors.textSecondary }]} accessibilityElementsHidden importantForAccessibility="no">
          {`${used}/${max}`}
        </Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        maxLength={max}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        editable={editable}
        multiline={multiline}
        accessibilityLabel={label}
        style={[styles.input, multiline && styles.multiline, dir.free, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}
      />
    </View>
  );
}

const PHOTO = 96;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xxl, gap: spacing.lg },
  loading: { marginTop: spacing.xl },
  save: { minWidth: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
  saveText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  photo: { alignItems: 'center', gap: spacing.sm + 4, paddingTop: spacing.md },
  uploading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: Math.round(PHOTO * 0.22), alignItems: 'center', justifyContent: 'center' },
  // a small camera badge at the picture's corner: the picture is the button
  camera: {
    position: 'absolute',
    end: -4,
    bottom: -4,
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLinkHit: { minHeight: 32, justifyContent: 'center' },
  photoLink: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  field: { gap: spacing.xs },
  fieldTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  count: { fontSize: typography.sizes.xs, fontVariant: ['tabular-nums'] },
  input: { minHeight: MIN_TOUCH_TARGET + 4, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.sizes.md },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  error: { fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center' },
  note: { fontSize: typography.sizes.sm, lineHeight: 20 },
});
