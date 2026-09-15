import { Alert } from 'react-native';
import { describeError, type Translate } from '../api/errors';
import type { ApiResult } from '../api/types';

const TITLE = { post: 'moderation.reportPost', comment: 'moderation.reportComment' } as const;

/**
 * Confirm and fire a moderation report, then surface the outcome (KUR-292).
 * Cross-platform (a two-button Alert), so it works on iOS + Android. The report
 * feeds the unified moderation queue where a human reviews it.
 *
 * `what` is a kind rather than a word, and the title is a whole key per kind.
 * It used to build `Report this ${what}?` from a noun, which reads in English
 * and in nothing else: the word order, the article and the agreement all move.
 */
export function confirmReport(t: Translate, what: 'post' | 'comment', run: () => Promise<ApiResult<unknown>>): void {
  Alert.alert(t(TITLE[what]), t('moderation.reviewNote'), [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('moderation.report'),
      style: 'destructive',
      onPress: async () => {
        const res = await run();
        if (res.ok) Alert.alert(t('moderation.report'), t('moderation.reportThanks'));
        else Alert.alert(t('moderation.reportFailed'), describeError(res.error, t));
      },
    },
  ]);
}
