import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { LOCALE_LABEL } from '../i18n/translations';
import type { RootNavigation } from '../navigation/rootStack';
import { Avatar } from '../profile/Avatar';
import { useDirection } from '../reports/direction';
import { SettingsPage, SettingsRow, SettingsSection } from '../settings/list';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { PinPrompt } from './PinSheet';

/**
 * A child's own page in child mode: their avatar and name, the note that says in a child's words who made the
 * profile and who can see it, the two settings that are theirs (the language and the sounds), and on a parent's
 * phone the way back to the parent.
 */
export function ChildProfile({ onExit }: { onExit: () => void }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [pin, setPin] = useState(false);
  const name = user?.displayName ?? '';
  const parent = user?.child?.parentName ?? '';
  return (
    <SettingsPage title={t('child.profile.title')} onExit={onExit}>
      <View style={styles.head}>
        <Avatar name={name} photoUrl={user?.avatarUrl ?? null} size={88} />
        <Text style={[styles.name, { color: colors.textPrimary }]} accessibilityRole="header">
          {name}
        </Text>
      </View>
      <View style={[styles.note, { backgroundColor: colors.glassFill, shadowColor: colors.softShadow, flexDirection: dir.row }]} testID="child-note">
        <Icon name="heart" size={22} color={colors.textSecondary} />
        <Text style={[styles.noteText, dir.text, { color: colors.textPrimary }]}>{t('child.note')}</Text>
      </View>
      <SettingsSection>
        <SettingsRow icon="translate" title={t('settings.language')} value={LOCALE_LABEL[locale]} onPress={() => navigation.navigate('SettingsPage', { page: 'language' })} />
        <SettingsRow icon="speaker-high" title={t('settings.soundsVibration')} onPress={() => navigation.navigate('SettingsPage', { page: 'sounds' })} />
        <SettingsRow icon="palette" title={t('appearance.theme')} onPress={() => navigation.navigate('SettingsPage', { page: 'theme' })} />
      </SettingsSection>
      {user?.child?.returnable ? (
        <SettingsSection>
          <SettingsRow icon="lock" title={t('child.back.link', { name: parent })} opens={false} onPress={() => setPin(true)} testID="child-profile-back" />
        </SettingsSection>
      ) : null}
      <PinPrompt visible={pin} parentName={parent} onClose={() => setPin(false)} />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md, paddingHorizontal: layout.gutter },
  name: { fontSize: typography.sizes.title, fontWeight: typography.weights.semibold, textAlign: 'center' },
  note: {
    marginHorizontal: layout.gutter,
    marginTop: spacing.lg,
    padding: spacing.md,
    gap: spacing.sm + 4,
    alignItems: 'flex-start',
    borderRadius: radii.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  noteText: { flex: 1, fontSize: typography.sizes.text, lineHeight: 23 },
});
