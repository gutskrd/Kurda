import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { MarkdownView } from '../grammar/MarkdownView';
import { useI18n } from '../i18n/I18nContext';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useDirection } from '../reports/direction';
import { sectionLabel } from '../theme/fonts';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import type { SkillNode } from './types';

/**
 * A unit's guide — the grammar notes of its skills — or one skill's Tips,
 * presented over the path. Each note is fetched the first time the guide asks
 * for it and kept, so opening a unit's guide twice fetches it once, and a path
 * of twenty skills does not fetch twenty notes nobody opened.
 */
export function UnitGuide({ guide, onClose }: { guide: { title: string; skills: SkillNode[] } | null; onClose: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [notes, setNotes] = useState<Record<string, { md: string } | { error: string }>>({});

  useEffect(() => {
    if (!guide) return;
    let live = true;
    for (const skill of guide.skills) {
      const have = notes[skill.skillId];
      if (have && 'md' in have) continue;
      void client.get<{ grammarMd: string }>(`/skills/${encodeURIComponent(skill.skillId)}/grammar`).then((res) => {
        if (!live) return;
        setNotes((n) => ({ ...n, [skill.skillId]: res.ok ? { md: res.data.grammarMd } : { error: describeError(res.error, t) } }));
      });
    }
    return () => {
      live = false;
    };
    // a note once fetched is kept (`notes` is read, not watched): only a new guide asks again
  }, [guide, client, t]);

  return (
    <Modal visible={guide !== null} animationType="slide" onRequestClose={onClose}>
      <GradientBackground>
        <View style={styles.screen}>
          <ScreenHeader title={guide?.title} onBack={onClose} leading="close" hairline />
          <ScrollView contentContainerStyle={styles.body}>
            {guide?.skills.map((skill) => {
              const note = notes[skill.skillId];
              return (
                <View key={skill.skillId} style={styles.section}>
                  {guide.skills.length > 1 ? (
                    <Text style={[styles.skill, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
                      {skill.title}
                    </Text>
                  ) : null}
                  {!note ? (
                    <ActivityIndicator color={colors.textSecondary} accessibilityLabel={t('common.loading')} />
                  ) : 'error' in note ? (
                    <Text style={[styles.error, dir.text, { color: colors.danger }]}>{note.error}</Text>
                  ) : (
                    <MarkdownView source={note.md} />
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </GradientBackground>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm },
  // the skill's name over its note, quieter than the note's own heading
  skill: { ...sectionLabel },
  error: { fontSize: typography.sizes.sm },
});
