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
 * The name step of signing up and of claiming a guest account: the step's
 * field, written in lowercase as it is typed (./typing.tsx), the five Kurdish
 * letters as keys under it, and one line under those.
 *
 * The line says what a username may be made of until there is something to
 * say about the name typed, and then says that instead, gently: only what more
 * typing cannot mend ("“!” can’t be in a username", a dot at the start), never
 * "too short" under every key. The rest is the step's check, said when
 * Continue is pressed (StepFlow), and once the step has refused the name the
 * flow's own line is the one under the field.
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
