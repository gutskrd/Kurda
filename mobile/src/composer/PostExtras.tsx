import { useCallback, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent, type PressableProps } from 'react-native';
import type { FeedImage, PostMediaView } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import type { ApiError } from '../api/types';
import { deletePost } from '../feed/api';
import type { FeedItem } from '../feed/types';
import { haptic } from '../feedback/haptics';
import type { RootNavigation } from '../navigation/rootStack';
import { SendErrorNotice } from '../reports/SendError';
import { BottomSheet } from '../theme/BottomSheet';
import { display } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { postDeleted } from './postDeleted';

/**
 * The pieces of a post's own page that came with pictures on written posts:
 * the pictures as the grid takes them, the "Source / credit" line, and the
 * author's menu to edit or delete it.
 */

/** A post's pictures, as the grid shows them; a picture the server could not address is left out. */
export function postImages(post: { media?: PostMediaView[] }): FeedImage[] {
  return (post.media ?? [])
    .filter((m): m is PostMediaView & { url: string } => !!m.url)
    .map((m) => ({ url: m.url, alt: m.altText, width: m.width, height: m.height }));
}

/** "Source: …", under the post — where a quote or a picture came from. */
export function SourceCredit({ text }: { text: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.credit}>
      <Icon name="quotes" size={14} color={colors.textSecondary} />
      <Text style={[styles.creditText, { color: colors.textSecondary }]}>{t('composer.source', { source: text })}</Text>
    </View>
  );
}

/** A post as its menu needs it: which of the two tables it is in, and whose it is. */
export type MenuPost = Pick<FeedItem, 'targetType' | 'id'> & { authorId: string };

export interface PostMenu {
  /** undefined on anybody else's post, so there is nothing to offer */
  open: (() => void) | undefined;
  /** the menu while it is open; render it anywhere, it is a sheet over the screen */
  sheet: React.JSX.Element | null;
  /** the same menu for a screen reader, as an action on whatever opens it */
  a11y: Pick<PressableProps, 'accessibilityActions' | 'onAccessibilityAction'>;
}

/**
 * Your own post's menu: Edit for a written post (a picture's caption is not
 * edited on the phone) and Delete, which asks first, since nothing brings a
 * post back. A deleted post leaves every list showing it (postDeleted.ts)
 * and `onDeleted` runs, so the page it was deleted from can close.
 *
 * `onActivate` is what the element carrying `a11y` does when tapped: naming
 * actions of its own takes over a screen reader's double tap as well, so the
 * tap is handed back to it (as NotificationRow does).
 */
export function usePostMenu(
  post: MenuPost,
  { onDeleted, onActivate }: { onDeleted?: () => void; onActivate?: () => void } = {},
): PostMenu {
  const { user } = useAuth();
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const open = useCallback(() => setShown(true), []);
  const onAction = useCallback(
    (e: AccessibilityActionEvent) => {
      if (e.nativeEvent.actionName === 'postMenu') open();
      else onActivate?.();
    },
    [open, onActivate],
  );
  if (!user || user.id !== post.authorId) return { open: undefined, sheet: null, a11y: {} };
  return {
    open,
    sheet: shown ? <PostMenuSheet post={post} onClose={() => setShown(false)} onDeleted={onDeleted} /> : null,
    a11y: {
      accessibilityActions: [...(onActivate ? [{ name: 'activate' }] : []), { name: 'postMenu', label: t('post.menu') }],
      onAccessibilityAction: onAction,
    },
  };
}

/** "⋯" in the header of your own post's page, opening its menu. */
export function PostMenuButton({ post, onDeleted }: { post: MenuPost; onDeleted?: () => void }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const menu = usePostMenu(post, { onDeleted });
  if (!menu.open) return null;
  return (
    <>
      <Pressable onPress={menu.open} accessibilityRole="button" accessibilityLabel={t('post.menu')} style={styles.menuButton}>
        <Icon name="more" size={22} color={colors.primary} />
      </Pressable>
      {menu.sheet}
    </>
  );
}

/**
 * The menu, from the bottom of the screen; Delete turns it into the question.
 *
 * Asked in the sheet itself rather than in an alert after it: an alert raised
 * while a sheet is still closing is dropped on iOS, and the Delete would seem
 * to do nothing.
 */
function PostMenuSheet({ post, onClose, onDeleted }: { post: MenuPost; onClose: () => void; onDeleted?: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const edit = () => {
    onClose();
    navigation.navigate('Compose', { postId: post.id });
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    const res = await deletePost(client, post);
    setBusy(false);
    if (!res.ok) {
      haptic('error');
      setError(res.error);
      return;
    }
    onClose();
    postDeleted({ targetType: post.targetType, id: post.id });
    onDeleted?.();
  };

  return (
    // not closed while the delete is on its way: closing then would hide whether it worked
    <BottomSheet visible onClose={onClose} dismissible={!busy}>
      {confirming ? (
        <View style={styles.confirm}>
          <Text accessibilityRole="header" style={[styles.confirmTitle, { color: colors.textPrimary }]}>
            {t('post.deleteTitle')}
          </Text>
          <Text style={[styles.confirmBody, { color: colors.textSecondary }]}>{t('common.cantUndo')}</Text>
          <SendErrorNotice error={error} onNavigate={onClose} style={styles.notice} />
          <ClayButton label={t('common.delete')} tone="danger" size="large" busy={busy} onPress={() => void remove()} />
          <ClayButton label={t('common.cancel')} size="large" disabled={busy} onPress={onClose} />
        </View>
      ) : (
        <View>
          {post.targetType === 'library' ? <MenuRow icon="pencil" label={t('composer.edit')} onPress={edit} /> : null}
          <MenuRow icon="trash" label={t('post.delete')} danger onPress={() => setConfirming(true)} />
          <MenuRow icon="close" label={t('common.cancel')} onPress={onClose} />
        </View>
      )}
    </BottomSheet>
  );
}

function MenuRow({ icon, label, danger = false, onPress }: { icon: IconName; label: string; danger?: boolean; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const tint = danger ? colors.danger : colors.textPrimary;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Icon name={icon} size={20} color={tint} />
      <Text style={[styles.rowText, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  credit: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  creditText: { flex: 1, fontSize: typography.sizes.sm, fontStyle: 'italic' },
  menuButton: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  // the height GlassRow gives a row a thumb is meant to land on
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52 },
  pressed: { opacity: 0.6 },
  rowText: { fontSize: typography.ios.row },
  confirm: { gap: spacing.md, paddingBottom: spacing.sm },
  confirmTitle: { ...display(typography.sizes.lg) },
  confirmBody: { fontSize: typography.sizes.md },
  notice: { marginHorizontal: 0, marginBottom: 0 },
});
