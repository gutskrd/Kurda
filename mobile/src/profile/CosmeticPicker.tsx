import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { assetUrl } from '../api/env';
import { describeError } from '../api/errors';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { equip, inventory, setIconVisibility, type CosmeticSlot, type InventoryItem } from './cosmetics';

/**
 * The things you own, and putting them on (KUR-088).
 *
 * The phone's shop has sold backgrounds and icons since it opened and there was
 * nowhere to wear them: you could spend Zêr on a background and then never see
 * it. Everything here is already yours — buying still happens in the Shop,
 * which the phone already has, rather than being built a second time.
 *
 * Tapping what you are already wearing takes it off, because the alternative is
 * a wardrobe you can add to and never empty.
 */
export function CosmeticPicker({
  equippedBackground,
  equippedIcon,
  iconVisible,
  onChanged,
}: {
  equippedBackground: string | null;
  equippedIcon: string | null;
  iconVisible: boolean;
  /** told after anything lands, so the screen above can re-read /me */
  onChanged: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();

  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIcon, setShowIcon] = useState(iconVisible);

  useEffect(() => {
    let alive = true;
    void inventory(client).then((res) => {
      if (alive) setItems(res.ok ? res.data.items : []);
    });
    return () => {
      alive = false;
    };
  }, [client]);

  const choose = useCallback(
    (slot: CosmeticSlot, sku: string, equipped: boolean) => {
      if (busy) return;
      setBusy(sku);
      setError(null);
      // tapping what you have on takes it off
      void equip(client, slot, equipped ? null : sku).then((res) => {
        setBusy(null);
        if (res.ok) onChanged();
        else setError(describeError(res.error, t));
      });
    },
    [busy, client, onChanged, t],
  );

  const toggleIcon = useCallback(
    (next: boolean) => {
      setShowIcon(next);
      void setIconVisibility(client, next).then((res) => {
        if (res.ok) onChanged();
        else {
          setShowIcon(!next);
          setError(describeError(res.error, t));
        }
      });
    },
    [client, onChanged, t],
  );

  const backgrounds = (items ?? []).filter((i) => i.category === 'background');
  const icons = (items ?? []).filter((i) => i.category === 'icon');

  const shelf = (slot: CosmeticSlot, owned: InventoryItem[], equippedSku: string | null, emptyKey: 'edit.noBackgrounds' | 'edit.noIcons') => (
    <View style={styles.shelf}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {t(slot === 'background' ? 'edit.background' : 'edit.icon')}
      </Text>
      {owned.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>{t(emptyKey)}</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {owned.map((item) => {
            const on = item.sku === equippedSku;
            const art = assetUrl(item.assetUrl);
            return (
              <Pressable
                key={item.sku}
                onPress={() => choose(slot, item.sku, on)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={on ? t('edit.equipped') : t('edit.equip')}
                style={[
                  styles.tile,
                  {
                    backgroundColor: colors.controlTrack,
                    borderColor: on ? colors.textPrimary : colors.glassBorder,
                  },
                ]}
              >
                {busy === item.sku ? (
                  <ActivityIndicator color={colors.primary} />
                ) : art ? (
                  <Image source={{ uri: art }} style={styles.art} resizeMode="cover" accessibilityIgnoresInvertColors />
                ) : (
                  <Icon name={slot === 'background' ? 'image' : 'star'} size={20} color={colors.textSecondary} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: colors.textSecondary }]}>{t('edit.cosmetics')}</Text>

      {items === null ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
      ) : (
        <>
          {shelf('background', backgrounds, equippedBackground, 'edit.noBackgrounds')}
          {shelf('icon', icons, equippedIcon, 'edit.noIcons')}

          {/*
            Showing it and owning it are different questions, so they are
            different controls: this hides the icon without giving it up.
          */}
          {icons.length > 0 ? (
            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>{t('edit.showPremiumIcon')}</Text>
              <Switch
                value={showIcon}
                onValueChange={toggleIcon}
                trackColor={{ true: colors.primary, false: colors.controlTrack }}
              />
            </View>
          ) : null}
        </>
      )}

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.sm },
  heading: { ...sectionLabel },
  shelf: { gap: spacing.xs },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  row: { gap: spacing.sm, paddingVertical: 2 },
  tile: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  art: { width: '100%', height: '100%' },
  empty: { fontSize: typography.sizes.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: MIN_TOUCH_TARGET },
  toggleLabel: { fontSize: 17 },
  error: { fontSize: typography.sizes.sm },
});
