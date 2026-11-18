import { StyleSheet, Text, View } from 'react-native';
import { GuideField } from '../auth/guide/GuideField';
import type { StepTools } from '../auth/guide/StepFlow';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { USERNAME_RULE_VARS, usernameIssueWhileTyping } from './validate';
import { UsernameKeys, useUsernameTyping } from './typing';

/**
 * The username step of sign-up and of claiming a guest account: the field, lowercased as typed (./typing.tsx),
 * the five Kurdish letters as keys, and one line underneath. The line says what a username may contain until
 * there is something to say about the typed name, and then only what more typing cannot fix; the step's full
 * check runs on Continue (StepFlow), whose refusal then takes the line.
 */
export function UsernameStepField({
  tools,
  value,
  onChange,
  label,
  placeholder,
  testID,
}: {
  tools: StepTools;
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder?: string;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const typing = useUsernameTyping(value, onChange);
  const live = tools.error ? null : usernameIssueWhileTyping(value);
  return (
    <View>
      <GuideField
        tools={tools}
        value={value}
        onChangeText={typing.onChangeText}
        selection={typing.selection}
        onSelectionChange={typing.onSelectionChange}
        label={label}
        complete="username"
        placeholder={placeholder}
        testID={testID}
      />
      <UsernameKeys onKey={typing.typeKey} disabled={tools.busy} />
      {tools.error ? null : (
        <Text
          style={[styles.line, dir.text, { color: live && !live.ok ? colors.danger : colors.textSecondary }]}
          accessibilityLiveRegion="polite"
          testID="username-line"
        >
          {live && !live.ok ? t(live.message, live.vars) : t('username.hint', USERNAME_RULE_VARS)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { fontSize: typography.sizes.sm, lineHeight: 20, marginTop: spacing.sm },
});
