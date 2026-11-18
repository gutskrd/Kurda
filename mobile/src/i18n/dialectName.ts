import type { TranslationKey } from './translations';

/** The two Kurdish varieties, under either of the codes the app's data uses for them. */
export type DialectCode = 'kmr' | 'ckb' | 'kurmanci' | 'sorani';

/**
 * The catalogue key for a variety's name. Every Latin-script language spells them Kurmancî and Soranî; Arabic and
 * Soranî readers get them in their own script.
 */
export function dialectNameKey(dialect: DialectCode): TranslationKey {
  return dialect === 'ckb' || dialect === 'sorani' ? 'dialect.sorani' : 'dialect.kurmanci';
}
