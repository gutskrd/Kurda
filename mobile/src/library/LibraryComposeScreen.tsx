import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { radii, spacing, typography } from '../theme/tokens';
import { ClayButton, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { createPost } from './api';
import { uploadVoiceNote } from './voiceUpload';
import { VoiceRecorder } from './VoiceRecorder';
import type { PostType } from './types';

/**
 * Author a library post (KUR-284): pick story/poem, write a title + body, and
 * publish (or save as a draft). Audio narration authoring is added with the
 * voice-notes recording pipeline (KUR-282).
 */
export function LibraryComposeScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const topInset = useScreenTopInset();

  const [type, setType] = useState<PostType>('story');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [voiceUri, setVoiceUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (publish: boolean) => {
    if (saving) return;
    if (!title.trim() || !body.trim()) {
      Alert.alert('Missing content', 'A title and some text are required.');
      return;
    }
    setSaving(true);
    // upload the optional narration first so the post references a confirmed key
    let audioMediaId: string | undefined;
    if (voiceUri) {
      const up = await uploadVoiceNote(client, { uri: voiceUri });
      if (!up.ok) {
        setSaving(false);
        Alert.alert('Couldn’t upload narration', up.error);
        return;
      }
      audioMediaId = up.audioMediaId;
    }
    const res = await createPost(client, { type, title: title.trim(), body: body.trim(), publish, audioMediaId });
    setSaving(false);
    if (!res.ok) {
      Alert.alert('Couldn’t save', describeError(res.error).message);
      return;
    }
    onExit();
  };

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={topInset}>
        <View style={[styles.screen, { paddingTop: topInset }]}>
          <View style={styles.titleRow}>
            <Pressable onPress={onExit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel">
              <Icon name="close" size={22} color={colors.textSecondary} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.primary }]}>Write</Text>
            <View style={{ width: 22 }} />
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Segmented options={['story', 'poem'] as const} value={type} onChange={setType} labelOf={(t) => (t === 'story' ? 'Story' : 'Poem')} />
            <TextInput
              style={[styles.titleInput, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder, color: colors.textPrimary }]}
              placeholder="Title"
              placeholderTextColor={colors.textSecondary}
              value={title}
              onChangeText={setTitle}
              maxLength={200}
            />
            <TextInput
              style={[styles.bodyInput, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder, color: colors.textPrimary }]}
              placeholder={type === 'poem' ? 'Your poem…' : 'Your story…'}
              placeholderTextColor={colors.textSecondary}
              value={body}
              onChangeText={setBody}
              multiline
              textAlignVertical="top"
              maxLength={50000}
            />
            <Text style={[styles.narrationLabel, { color: colors.textSecondary }]}>Optional narration</Text>
            <VoiceRecorder value={voiceUri} onChange={setVoiceUri} />
          </ScrollView>

          <View style={styles.actions}>
            <ClayButton label="Save draft" tone="neutral" onPress={() => void submit(false)} style={styles.flex} />
            <ClayButton label={saving ? 'Publishing…' : 'Publish'} tone="primary" onPress={() => void submit(true)} style={styles.flex} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  headerTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  body: { paddingBottom: spacing.xl, gap: spacing.md },
  titleInput: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  bodyInput: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.sizes.md, minHeight: 220 },
  narrationLabel: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  actions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
});
