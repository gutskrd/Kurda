import { describe, expect, it } from 'vitest';
import { RANK_TIER_KEYS } from '@kurda/shared';
import { LOCALES, TRANSLATIONS } from '../i18n/translations';
import { TIER_NAME_KEY } from './format';

describe('tier names', () => {
  it('has a name for every tier in every language', () => {
    for (const locale of LOCALES) {
      for (const tier of RANK_TIER_KEYS) expect(TRANSLATIONS[locale][TIER_NAME_KEY[tier]], `${locale} ${tier}`).toBeTruthy();
    }
  });
});
