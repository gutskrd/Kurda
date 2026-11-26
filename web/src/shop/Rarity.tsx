import { itemRarity, type Rarity } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

const LABEL: Readonly<Record<Rarity, MessageKey>> = {
  classic: 'shop.rarity.classic',
  fine: 'shop.rarity.fine',
  rare: 'shop.rarity.rare',
  masterwork: 'shop.rarity.masterwork',
};

/** An item's step on the price ladder, as a small word in ink (a masterwork's in gold); nothing for what the ladder does not price. */
export function RarityLabel({ item }: { item: { sku?: string; category: string; price: number } }): React.JSX.Element | null {
  const t = useT();
  const rarity = itemRarity(item);
  if (!rarity) return null;
  return <span className={`rarity rarity-${rarity}`}>{t(LABEL[rarity])}</span>;
}
