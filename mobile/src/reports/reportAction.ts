import { useI18n } from '../i18n/I18nContext';

/**
 * Report among an element's screen-reader actions — and nothing when there is
 * no one else's message to report.
 *
 * For the parts of a chat message reached one by one (a gift to open, an
 * invite link): the row around them is not an element of its own there, so
 * its Report action is out of reach, and each part carries it instead.
 */
export function useReportAction(onReport: (() => void) | undefined): {
  accessibilityActions?: Array<{ name: string; label: string }>;
  onAccessibilityAction?: (event: { nativeEvent: { actionName: string } }) => void;
} {
  const { t } = useI18n();
  if (!onReport) return {};
  return {
    accessibilityActions: [{ name: 'report', label: t('moderation.report') }],
    onAccessibilityAction: (event) => {
      if (event.nativeEvent.actionName === 'report') onReport();
    },
  };
}
