/**
 * The ranks' tier names, which the season frames are still named by ("Gir frame"). Every word comes from the
 * catalogue: Kurmancî everywhere, in Soranî script in ckb.
 */
import type { RankTier } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';

export const TIER_NAME_KEY: Record<RankTier, TranslationKey> = {
  dest: 'ranks.tier.dest',
  gir: 'ranks.tier.gir',
  zozan: 'ranks.tier.zozan',
  ciya: 'ranks.tier.ciya',
  lutke: 'ranks.tier.lutke',
  sterk: 'ranks.tier.sterk',
};
