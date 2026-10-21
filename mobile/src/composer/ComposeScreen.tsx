import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SheetIn } from '../theme/MotionParts';
import { Toggle } from '../theme/Toggle';
import * as ImagePicker from 'expo-image-picker';
import {
  POST_ALT_MAX,
  canPost,
  derivePostType,
  isEmptyDraft,
  toCreatePostRequest,
  type WrittenPostType,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { Skeleton, SkeletonLines } from '../theme/Skeleton';
import type { DeviceStore } from '../keyboard/deviceStore';
import {
  createWrittenPost,
  getWrittenPost,
  listServerDrafts,
  publishWrittenPost,
  updateWrittenPost,
  type ComposerPost,
} from './api';
import { clearDraft, dropPicture, keepPicture, loadDraft, pictureExists, saveDraft } from './drafts';
import { accountLimitOf, describePostError } from './errors';
import { SendErrorNotice } from '../reports/SendError';
import type { ApiError } from '../api/types';
import { postSaved } from './postSaved';
import {
  FIELD_MAX,
  counterFor,
  emptyComposer,
  fromPost,
  fromStoredDraft,
  hasChanges,
  pictureId,
  roomForPictures,
  toStoredDraft,
  toUpdateRequest,
  withPictures,
  type ComposerPicture,
  type ComposerState,
} from './model';
import { uploadPicture } from './upload';
import { haptic } from '../feedback/haptics';

/** A picture somebody picked, before it is kept and uploaded. */
export interface PickedPicture {
  uri: string;
  contentType: string;
}

const KINDS: ReadonlyArray<{ type: WrittenPostType; label: TranslationKey }> = [
  { type: 'gotin', label: 'civak.kind.saying' },
  { type: 'story', label: 'civak.kind.story' },
  { type: 'poem', label: 'civak.kind.poem' },
];

/** The type a picture's file most likely is; the server reads the bytes and decides. */
function typeOf(uri: string): string {
  const ext = /\.([a-z0-9]+)(?:\?|$)/i.exec(uri)?.[1]?.toLowerCase();
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream';
}

/**
 * The photo library, several at once, in the order they were tapped.
 *
 * No permission is asked for first: the system's own picker runs outside the
 * app and hands back only the pictures chosen, so there is nothing to grant.
 * Asking anyway meant somebody who said no could not pick a picture at all.
 */
async function pickFromLibrary(room: number): Promise<PickedPicture[]> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: room > 1,
    selectionLimit: room,
    orderedSelection: true,
    quality: 0.9,
  });
  if (picked.canceled) return [];
  return picked.assets.slice(0, room).map((a) => ({ uri: a.uri, contentType: a.mimeType ?? typeOf(a.uri) }));
}

/**
 * Writing a post: one box for words and up to four pictures, X-style.
 *
 * It replaces "words or a picture first?" — a sheet that sent you to one of
 * two composers, the writing one without sayings and with a "Save draft" that
 * nobody could ever open again. Here the words come first, focused as it
 * opens; pictures can be added at any moment and go up while you write; a
 * title, the kind of post and a source are there when wanted and out of the
 * way when not. Cancel and Post sit at the top, where the keyboard can never
 * cover them.
 *
 * Three ways in, one screen:
 * - a new post — its draft is kept on this phone as it is written and comes
 *   back the next time (drafts.ts);
 * - `postId`: editing your own post — words, title, pictures and their
 *   descriptions, the source;
 * - finishing a draft an earlier version of the app saved on the server,
 *   offered at the top of an empty composer.
 *
 * Everything that decides what may be posted is `@kurda/shared`
 * post-composer, which the API runs too: the counter counts as the server
 * counts, and Post is on exactly when the server would accept the shape.
 */
export function ComposeScreen({
  postId,
  onExit,
  onPosted,
  pick = pickFromLibrary,
  upload = uploadPicture,
  store,
  startWithPictures = false,
  asMeme = false,
}: {
  postId?: string;
  /** open the photo library as it opens — the way in from "Choose a picture" */
  startWithPictures?: boolean;
  /** pictures added are a meme to start with (from Memes); the switch can still turn it off */
  asMeme?: boolean;
  onExit: () => void;
  /** a post went up or was saved */
  onPosted?: (post: ComposerPost) => void;
  pick?: (room: number) => Promise<PickedPicture[]>;
  upload?: typeof uploadPicture;
  /** where the draft is kept; this phone's storage when left out */
  store?: DeviceStore;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const topInset = useScreenTopInset();

  const [mode, setMode] = useState<'new' | 'edit' | 'finish'>(postId ? 'edit' : 'new');
  const [original, setOriginal] = useState<ComposerPost | null>(null);
  const [state, setState] = useState<ComposerState>(() => emptyComposer());
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** a limit on the account: said with the way to Account standing (reports/SendError) */
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [altFor, setAltFor] = useState<string | null>(null);
  const [serverDrafts, setServerDrafts] = useState<ComposerPost[]>([]);
  const [draftsOpen, setDraftsOpen] = useState(false);

  const bodyRef = useRef<TextInput>(null);
  const titleRef = useRef<TextInput>(null);
  const sourceRef = useRef<TextInput>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  // ---- pictures -------------------------------------------------------------

  const patchPicture = useCallback((id: string, patch: Partial<ComposerPicture>) => {
    if (!alive.current) return;
    setState((s) => ({ ...s, pictures: s.pictures.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  }, []);

  const startUpload = useCallback(
    async (picture: Pick<ComposerPicture, 'id' | 'localUri' | 'ownWork'>) => {
      if (!picture.localUri) return;
      patchPicture(picture.id, { status: 'uploading', progress: 0, error: null, mediaKey: null });
      const res = await upload(
        client,
        { uri: picture.localUri, contentType: typeOf(picture.localUri), ownWork: picture.ownWork },
        t,
        (progress) => patchPicture(picture.id, { progress }),
        undefined,
        locale,
      );
      if (res.ok) {
        patchPicture(picture.id, {
          status: 'done',
          progress: 1,
          mediaKey: res.mediaKey,
          // the web build's picked file lives only as long as the tab; the uploaded copy outlasts it
          ...(Platform.OS === 'web' && res.url ? { localUri: res.url } : {}),
        });
      } else patchPicture(picture.id, { status: 'failed', error: res.error });
    },
    [client, t, locale, upload, patchPicture],
  );

  const addPictures = useCallback(async () => {
    const room = roomForPictures(state);
    if (room === 0) return;
    setNotice(null);
    const picked = await pick(room);
    for (const p of picked.slice(0, room)) {
      const localUri = await keepPicture(p.uri);
      const picture: ComposerPicture = {
        id: pictureId(),
        mediaKey: null,
        localUri,
        altText: '',
        ownWork: true,
        status: 'uploading',
        progress: 0,
        error: null,
        existing: false,
      };
      setState((s) =>
        s.pictures.length >= 4
          ? s
          : { draft: asMeme ? { ...s.draft, meme: true } : s.draft, pictures: [...s.pictures, picture] },
      );
      void startUpload(picture);
    }
  }, [pick, startUpload, state, t, asMeme]);

  const removePicture = useCallback(
    (id: string) => {
      const gone = state.pictures.find((p) => p.id === id);
      setState((s) => {
        const pictures = s.pictures.filter((p) => p.id !== id);
        // a meme is a post with pictures; the last one gone, it is a post again
        return { draft: { ...s.draft, meme: s.draft.meme && pictures.length > 0 }, pictures };
      });
      if (gone && !gone.existing) void dropPicture(gone.localUri);
    },
    [state.pictures],
  );

  // ---- loading --------------------------------------------------------------

  useEffect(() => {
    let active = true;
    void (async () => {
      if (postId) {
        const res = await getWrittenPost(client, postId);
        if (!active) return;
        if (!res.ok) {
          setLoadFailed(true);
          return;
        }
        open(res.data, 'edit');
        return;
      }
      // a new post: this phone's draft, and any left on the server by an older app
      const [draft, drafts] = await Promise.all([
        user ? loadDraft(user.id, store) : Promise.resolve(null),
        listServerDrafts(client),
      ]);
      if (!active) return;
      if (drafts.ok) setServerDrafts(drafts.data.posts);
      if (draft) {
        const restored = fromStoredDraft(draft);
        const pictures: ComposerPicture[] = [];
        for (const p of restored.pictures) {
          // a kept file the phone has since lost cannot come back
          if (p.status === 'done' || (await pictureExists(p.localUri))) pictures.push(p);
        }
        if (!active) return;
        setState({ draft: restored.draft, pictures });
        setShowTitle(!!restored.draft.title.trim() || (restored.draft.type !== null && restored.draft.type !== 'gotin'));
        setShowSource(!!restored.draft.sourceCredit.trim());
        for (const p of pictures) if (p.status === 'uploading') void startUpload(p);
      }
      setReady(true);
    })();
    return () => {
      active = false;
    };
    // once, on opening
  }, []);

  // "Choose a picture" opens the library straight away, once — a moment after
  // the composer has finished coming up, since a phone will not show one
  // screen over another that is still on its way in
  const pickedOnOpen = useRef(false);
  const addPicturesNow = useRef(addPictures);
  addPicturesNow.current = addPictures;
  useEffect(() => {
    if (!startWithPictures || !ready || mode !== 'new' || pickedOnOpen.current) return;
    const timer = setTimeout(() => {
      pickedOnOpen.current = true;
      void addPicturesNow.current();
    }, 350);
    return () => clearTimeout(timer);
  }, [startWithPictures, ready, mode]);

  /** Load a post into the composer, to edit it or to finish an old draft. */
  const open = (post: ComposerPost, as: 'edit' | 'finish') => {
    const next = fromPost(post);
    setOriginal(post);
    setMode(as);
    setState(next);
    setShowTitle(!!post.title);
    setShowSource(!!post.sourceCredit);
    setReady(true);
  };

  // The draft is saved a moment after each change, only for a new post. Once
  // the post has gone up or the draft was deleted, a save still waiting would
  // write the words straight back — and the published post would return as a
  // draft next time, its pictures' keys already used — so both stop it first.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discarded = useRef(false);
  useEffect(() => {
    if (!ready || mode !== 'new' || !user || discarded.current) return;
    const timer = setTimeout(() => {
      saveTimer.current = null;
      if (!discarded.current) void saveDraft(user.id, toStoredDraft(state), store);
    }, 500);
    saveTimer.current = timer;
    return () => clearTimeout(timer);
  }, [ready, mode, state, user, store]);

  /** No more saving: the draft is done with. */
  const forgetDraft = async () => {
    discarded.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (user) await clearDraft(user.id, store);
  };

  // ---- what can be posted ---------------------------------------------------

  const draft = withPictures(state);
  const check = canPost(draft);
  const uploading = state.pictures.some((p) => p.status === 'uploading');
  const failedPicture = state.pictures.some((p) => p.status === 'failed');
  const patch = original ? toUpdateRequest(original, state) : null;
  const changed = mode === 'new' ? !isEmptyDraft(toStoredDraft(state)) : hasChanges(patch);
  const kind = derivePostType(state.draft);
  const hasContent = !!state.draft.body.trim() || !!state.draft.title.trim() || state.pictures.length > 0;
  const postable =
    check.ok && !uploading && !failedPicture && !posting && (mode === 'new' ? true : mode === 'finish' || hasChanges(patch));

  const setDraftField = (field: 'title' | 'body' | 'sourceCredit', value: string) =>
    setState((s) => ({ ...s, draft: { ...s.draft, [field]: value } }));

  const chooseKind = (type: WrittenPostType) => {
    setState((s) => ({ ...s, draft: { ...s.draft, type } }));
    if (type !== 'gotin') {
      setShowTitle(true);
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  };

  const toggleTitle = () => {
    if (!showTitle) {
      setShowTitle(true);
      setTimeout(() => titleRef.current?.focus(), 50);
    } else if (!state.draft.title.trim() && kind === 'gotin') {
      setShowTitle(false);
    } else {
      titleRef.current?.focus();
    }
  };

  const toggleSource = () => {
    if (!showSource) {
      setShowSource(true);
      setTimeout(() => sourceRef.current?.focus(), 50);
    } else if (!state.draft.sourceCredit.trim()) {
      setShowSource(false);
    } else {
      sourceRef.current?.focus();
    }
  };

  // ---- posting and leaving ----------------------------------------------------

  const submit = async () => {
    if (!postable) return;
    setPosting(true);
    setError(null);
    setRefusal(null);
    let res;
    if (mode === 'new') {
      const request = toCreatePostRequest(draft);
      if (!request) {
        setPosting(false);
        return;
      }
      res = await createWrittenPost(client, request);
    } else {
      const id = original!.id;
      res = patch && Object.keys(patch).length > 0 ? await updateWrittenPost(client, id, patch) : { ok: true as const, data: original! };
      if (res.ok && mode === 'finish') res = await publishWrittenPost(client, id);
    }
    if (!alive.current) return;
    setPosting(false);
    if (!res.ok) {
      // it did not go out, and the post is still here to send: in the way, so felt as an error
      haptic('error');
      if (accountLimitOf(res.error)) setRefusal(res.error);
      else setError(describePostError(res.error, t));
      return;
    }
    // out in the world (or saved): a light knock as the composer closes, as a comment or a message gets
    haptic('tap');
    if (mode === 'new') {
      await forgetDraft();
      for (const p of state.pictures) void dropPicture(p.localUri);
    }
    if (mode === 'edit') postSaved(res.data);
    onPosted?.(res.data);
    onExit();
  };

  const requestClose = useCallback(() => {
    if (posting) return true;
    if (changed && ready) setClosing(true);
    else onExit();
    return true;
  }, [changed, ready, posting, onExit]);

  // Android's back button asks too, rather than dropping an edit
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', requestClose);
    return () => sub.remove();
  }, [requestClose]);

  const deleteDraft = async () => {
    setClosing(false);
    await forgetDraft();
    for (const p of state.pictures) void dropPicture(p.localUri);
    onExit();
  };

  // ---- drawing --------------------------------------------------------------

  const bodyCounter = counterFor(state.draft.body, FIELD_MAX.body);
  const titleCounter = counterFor(state.draft.title, FIELD_MAX.title);
  const sourceCounter = counterFor(state.draft.sourceCredit, FIELD_MAX.sourceCredit);
  const titleMissing = !check.ok && check.problem.code === 'TITLE_REQUIRED' && (state.draft.type === 'story' || state.draft.type === 'poem');
  const postLabel = mode === 'edit' ? t('composer.save') : mode === 'finish' ? t('composer.publish') : t('post.button');
  const who = user?.displayName || user?.username || '';
  const altPicture = state.pictures.find((p) => p.id === altFor) ?? null;

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.top, styles.column, { paddingTop: topInset }]}>
          <Pressable
            onPress={requestClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={styles.cancel}
            hitSlop={4}
          >
            <Text style={[styles.cancelText, { color: colors.textPrimary }]}>{t('common.cancel')}</Text>
          </Pressable>
          <Text style={[styles.heading, { color: colors.textPrimary }]} accessibilityRole="header" numberOfLines={1}>
            {mode === 'edit' ? t('composer.editTitle') : mode === 'finish' ? t('composer.finishTitle') : t('composer.newTitle')}
          </Text>
          <ClayButton label={postLabel} tone="primary" busy={posting} disabled={!postable} onPress={() => void submit()} style={styles.post} />
        </View>

        <SendErrorNotice error={refusal} onDismiss={() => setRefusal(null)} style={styles.column} />
        {error ? (
          <View style={[styles.banner, styles.column, { backgroundColor: colors.dangerFill }]} accessibilityLiveRegion="assertive" accessibilityRole="alert">
            <Icon name="alert" size={18} color={colors.danger} />
            <Text style={[styles.bannerText, { color: colors.textPrimary }]}>{error}</Text>
          </View>
        ) : null}

        {loadFailed ? (
          <View style={styles.loading}>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('composer.loadFailed')}</Text>
          </View>
        ) : !ready ? (
          <View style={styles.loading} accessibilityLabel={t('common.loading')}>
            <Skeleton width="40%" height={20} />
            <SkeletonLines count={3} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={[styles.body, styles.column]} keyboardShouldPersistTaps="handled">
            {mode === 'new' && serverDrafts.length > 0 && !hasContent ? (
              <Pressable
                onPress={() => setDraftsOpen(true)}
                accessibilityRole="button"
                style={[styles.oldDrafts, { backgroundColor: colors.glassFill }]}
              >
                <Icon name="pencil" size={18} tone="primary" />
                <Text style={[styles.oldDraftsText, { color: colors.textPrimary }]}>
                  {t('composer.oldDrafts', { count: serverDrafts.length })}
                </Text>
                <Icon name="chevron-right" size={16} color={colors.textSecondary} />
              </Pressable>
            ) : null}

            <View style={styles.writeRow}>
              <InitialsAvatar name={who} id={user?.id ?? 'me'} size={40} photoUrl={user?.profilePhotoUrl ?? null} />
              <View style={styles.writeMain}>
                {showTitle ? (
                  <View>
                    <TextInput
                      ref={titleRef}
                      value={state.draft.title}
                      onChangeText={(v) => setDraftField('title', v)}
                      placeholder={t('composer.titlePlaceholder')}
                      placeholderTextColor={colors.textSecondary}
                      accessibilityLabel={t('composer.titleLabel')}
                      style={[styles.titleInput, { color: colors.textPrimary }]}
                      returnKeyType="next"
                      onSubmitEditing={() => bodyRef.current?.focus()}
                    />
                    {titleMissing ? (
                      // a hint while the title is still to come, not an error: nothing has gone wrong yet
                      <Text style={[styles.fieldNote, { color: colors.textSecondary }]}>{t('composer.error.titleRequired')}</Text>
                    ) : null}
                    {titleCounter.show ? <Counter counter={titleCounter} /> : null}
                  </View>
                ) : null}
                <TextInput
                  ref={bodyRef}
                  value={state.draft.body}
                  onChangeText={(v) => setDraftField('body', v)}
                  placeholder={t('composer.placeholder')}
                  placeholderTextColor={colors.textSecondary}
                  accessibilityLabel={t('composer.bodyLabel')}
                  multiline
                  autoFocus={mode === 'new'}
                  textAlignVertical="top"
                  style={[styles.bodyInput, state.pictures.length > 0 && styles.bodyInputShort, { color: colors.textPrimary }]}
                />
              </View>
            </View>

            {state.pictures.length > 0 ? (
              <View style={styles.pictures}>
                {state.pictures.map((p, i) => (
                  <PictureTile
                    key={p.id}
                    picture={p}
                    index={i}
                    total={state.pictures.length}
                    onRemove={() => removePicture(p.id)}
                    onDescribe={() => setAltFor(p.id)}
                    onRetry={() => void startUpload(p)}
                  />
                ))}
              </View>
            ) : null}

            {hasContent ? (
              <View style={styles.kinds}>
                <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>
                  {t('composer.kind')}
                </Text>
                <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('composer.kind')}>
                  {KINDS.map((k) => {
                    const on = kind === k.type;
                    return (
                      <Pressable
                        key={k.type}
                        onPress={() => chooseKind(k.type)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={t(k.label)}
                        style={[styles.chip, { backgroundColor: on ? colors.primary : colors.controlTrack }]}
                      >
                        <Text style={[styles.chipText, { color: on ? colors.textOnPrimary : colors.textPrimary }]}>{t(k.label)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {state.pictures.length > 0 ? (
              <View style={[styles.switchRow, { backgroundColor: colors.glassFill }]}>
                <View style={styles.flex}>
                  <Text style={[styles.switchTitle, { color: colors.textPrimary }]}>{t('composer.meme')}</Text>
                  <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('composer.memeHint')}</Text>
                </View>
                <Toggle
                  value={state.draft.meme}
                  onValueChange={(meme) => setState((s) => ({ ...s, draft: { ...s.draft, meme } }))}
                  accessibilityLabel={t('composer.meme')}
                  trackColor={{ true: colors.primary, false: colors.controlTrack }}
                />
              </View>
            ) : null}

            {showSource ? (
              <View>
                <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{t('composer.sourceLabel')}</Text>
                <TextInput
                  ref={sourceRef}
                  value={state.draft.sourceCredit}
                  onChangeText={(v) => setDraftField('sourceCredit', v)}
                  placeholder={t('composer.sourcePlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  accessibilityLabel={t('composer.sourceLabel')}
                  style={[styles.sourceInput, { color: colors.textPrimary, backgroundColor: colors.controlTrack }]}
                />
                {sourceCounter.show ? <Counter counter={sourceCounter} /> : null}
              </View>
            ) : null}

            {notice ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{notice}</Text> : null}
          </ScrollView>
        )}

        {ready ? (
          <View style={[styles.toolbarWrap, { borderTopColor: colors.separator }]}>
            <Text style={[styles.copyHint, styles.column, { color: colors.textSecondary }]}>{t('composer.copyHint')}</Text>
            <View style={[styles.toolbar, styles.column]}>
              <Tool
                icon="image"
                label={t('composer.addPicture')}
                disabled={roomForPictures(state) === 0}
                onPress={() => void addPictures()}
              />
              <Tool icon="text-t" label={t('composer.addTitle')} on={showTitle} onPress={toggleTitle} />
              <Tool icon="quotes" label={t('composer.addSource')} on={showSource} onPress={toggleSource} />
              <View style={styles.flex} />
              {state.pictures.length > 0 ? (
                <Text style={[styles.count, { color: colors.textSecondary }]}>
                  {t('composer.pictureCount', { count: state.pictures.length, max: 4 })}
                </Text>
              ) : null}
              {bodyCounter.show ? <Counter counter={bodyCounter} /> : null}
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {/* leaving with something written: keep it, throw it away, or stay */}
      <Modal visible={closing} transparent animationType="fade" onRequestClose={() => setClosing(false)}>
        <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]} accessibilityViewIsModal>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]} accessibilityRole="header">
              {mode === 'new' ? t('composer.close.title') : t('composer.close.editTitle')}
            </Text>
            {mode === 'new' ? (
              <>
                <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('composer.close.body')}</Text>
                <ClayButton label={t('composer.close.keep')} tone="primary" onPress={() => { setClosing(false); onExit(); }} />
                <ClayButton label={t('composer.close.delete')} tone="danger" variant="outline" onPress={() => void deleteDraft()} />
              </>
            ) : (
              <ClayButton label={t('composer.close.discard')} tone="danger" variant="outline" onPress={() => { setClosing(false); onExit(); }} />
            )}
            <ClayButton label={t('composer.close.stay')} onPress={() => setClosing(false)} />
          </View>
        </View>
      </Modal>

      {altPicture ? (
        <AltSheet
          picture={altPicture}
          onChange={(patchPic) => {
            patchPicture(altPicture.id, patchPic);
            // "I made this" decides the signature, which is put on at upload: a new choice means a new upload
            if (patchPic.ownWork !== undefined && patchPic.ownWork !== altPicture.ownWork) {
              void startUpload({ ...altPicture, ownWork: patchPic.ownWork });
            }
          }}
          onClose={() => setAltFor(null)}
        />
      ) : null}

      <Modal visible={draftsOpen} transparent animationType="fade" onRequestClose={() => setDraftsOpen(false)}>
        <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]} accessibilityViewIsModal>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]} accessibilityRole="header">
              {t('composer.oldDraftsTitle')}
            </Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('composer.oldDraftsBody')}</Text>
            {serverDrafts.map((d) => (
              <Pressable
                key={d.id}
                onPress={() => {
                  setDraftsOpen(false);
                  open(d, 'finish');
                }}
                accessibilityRole="button"
                style={[styles.draftRow, { backgroundColor: colors.controlTrack }]}
              >
                <Text style={[styles.switchTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {d.title || d.body.slice(0, 60) || t('civak.kind.saying')}
                </Text>
                {d.title && d.body ? (
                  <Text style={[styles.hint, { color: colors.textSecondary }]} numberOfLines={1}>{d.body}</Text>
                ) : null}
              </Pressable>
            ))}
            <ClayButton label={t('common.close')} onPress={() => setDraftsOpen(false)} />
          </View>
        </View>
      </Modal>
    </GradientBackground>
  );
}

/** Characters left, or how many over, counted as the server counts. */
function Counter({ counter }: { counter: { left: number; over: boolean } }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Text
      style={[styles.count, { color: counter.over ? colors.danger : colors.textSecondary }]}
      accessibilityLiveRegion="polite"
    >
      {counter.over ? t('composer.over', { count: -counter.left }) : t('composer.left', { count: counter.left })}
    </Text>
  );
}

function Tool({
  icon,
  label,
  on = false,
  disabled = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  on?: boolean;
  disabled?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: on }}
      style={[styles.tool, on && { backgroundColor: colors.controlTrack }, disabled && styles.disabled]}
    >
      <Icon name={icon} size={22} color={colors.primary} />
    </Pressable>
  );
}

/** A picture on the post being written: remove, describe, and how its upload is going. */
function PictureTile({
  picture,
  index,
  total,
  onRemove,
  onDescribe,
  onRetry,
}: {
  picture: ComposerPicture;
  index: number;
  total: number;
  onRemove: () => void;
  onDescribe: () => void;
  onRetry: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const n = { n: index + 1, total };
  const described = picture.altText.trim().length > 0;
  const status =
    picture.status === 'uploading'
      ? t('composer.picture.uploading', { percent: Math.round(picture.progress * 100) })
      : picture.status === 'failed'
        ? (picture.error ?? t('picture.uploadFailed'))
        : null;
  return (
    <View style={[styles.tile, total === 1 && styles.tileWide, { backgroundColor: colors.controlTrack }]}>
      {picture.localUri ? (
        <Image
          source={{ uri: picture.localUri }}
          style={styles.tileImage}
          resizeMode="cover"
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${t('composer.picture.label', n)}${status ? ` — ${status}` : ''}`}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      {picture.status === 'uploading' ? (
        <View style={[styles.tileShade, { backgroundColor: colors.scrim }]} pointerEvents="none">
          <View style={[styles.progressTrack, { backgroundColor: colors.glassFill }]}>
            <View style={[styles.progressFill, { width: `${Math.max(4, picture.progress * 100)}%`, backgroundColor: colors.primary }]} />
          </View>
        </View>
      ) : null}
      {picture.status === 'failed' ? (
        <View style={[styles.tileFailed, { backgroundColor: colors.dangerFill }]}>
          <Text style={[styles.tileFailedText, { color: colors.textPrimary }]} numberOfLines={3}>
            {status}
          </Text>
          <Pressable onPress={onRetry} accessibilityRole="button" style={[styles.retry, { backgroundColor: colors.background }]}>
            <Text style={[styles.retryText, { color: colors.primary }]}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={t('composer.picture.remove', n)}
        style={styles.tileRemove}
      >
        <View style={[styles.tileRemoveDot, { backgroundColor: colors.background }]}>
          <Icon name="close" size={16} color={colors.textPrimary} />
        </View>
      </Pressable>
      <Pressable
        onPress={onDescribe}
        accessibilityRole="button"
        accessibilityLabel={described ? t('composer.alt.edit', n) : t('composer.alt.add', n)}
        style={styles.tileAlt}
      >
        <View style={[styles.altPill, { backgroundColor: colors.background }]}>
          {described ? <Icon name="check" size={12} color={colors.success} /> : null}
          <Text style={[styles.altPillText, { color: colors.textPrimary }]}>{t('composer.alt.badge')}</Text>
        </View>
      </Pressable>
    </View>
  );
}

/** Describe a picture for someone who cannot see it, and say whose it is. */
function AltSheet({
  picture,
  onChange,
  onClose,
}: {
  picture: ComposerPicture;
  onChange: (patch: Partial<ComposerPicture>) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const counter = counterFor(picture.altText, POST_ALT_MAX);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.scrim, { backgroundColor: colors.scrim }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SheetIn style={[styles.sheet, { backgroundColor: colors.background }]} accessibilityViewIsModal>
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]} accessibilityRole="header">
            {t('composer.alt.title')}
          </Text>
          {picture.localUri ? (
            <Image source={{ uri: picture.localUri }} style={styles.altPreview} resizeMode="contain" accessibilityIgnoresInvertColors />
          ) : null}
          <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{t('composer.alt.label')}</Text>
          <TextInput
            value={picture.altText}
            onChangeText={(altText) => onChange({ altText })}
            placeholder={t('composer.alt.placeholder')}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={t('composer.alt.label')}
            multiline
            autoFocus
            textAlignVertical="top"
            style={[styles.altInput, { color: colors.textPrimary, backgroundColor: colors.controlTrack }]}
          />
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('composer.alt.hint')}</Text>
          {counter.show ? <Counter counter={counter} /> : null}
          {!picture.existing ? (
            <View style={[styles.switchRow, { backgroundColor: colors.glassFill }]}>
              <View style={styles.flex}>
                <Text style={[styles.switchTitle, { color: colors.textPrimary }]}>{t('composer.ownWork')}</Text>
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  {picture.ownWork ? t('composer.ownWorkOn') : t('composer.ownWorkOff')}
                </Text>
              </View>
              <Toggle
                value={picture.ownWork}
                onValueChange={(ownWork) => onChange({ ownWork })}
                accessibilityLabel={t('composer.ownWork')}
                trackColor={{ true: colors.primary, false: colors.controlTrack }}
              />
            </View>
          ) : null}
          <ClayButton label={t('common.done')} tone="primary" onPress={onClose} />
        </SheetIn>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // on a tablet or a wide window the composer keeps a reading width, as X's does
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  cancel: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.xs },
  cancelText: { fontSize: typography.sizes.md },
  heading: { flex: 1, textAlign: 'center', fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  post: { minWidth: 88 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  bannerText: { flex: 1, fontSize: typography.sizes.sm },
  loading: { padding: spacing.lg, gap: spacing.md },
  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  oldDrafts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  oldDraftsText: { flex: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  writeRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  writeMain: { flex: 1, gap: spacing.xs },
  titleInput: {
    minHeight: MIN_TOUCH_TARGET,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    paddingVertical: spacing.sm,
  },
  bodyInput: { minHeight: 140, fontSize: typography.sizes.md + 1, lineHeight: 24, paddingTop: spacing.sm },
  // with pictures under it the box no longer needs room to invite writing; it still grows as you type
  bodyInputShort: { minHeight: 72 },
  fieldNote: { fontSize: typography.sizes.sm },
  pictures: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: '48.5%', aspectRatio: 1, borderRadius: radii.md, overflow: 'hidden' },
  tileWide: { width: '100%', aspectRatio: 4 / 3 },
  tileImage: { width: '100%', height: '100%' },
  // the picture dims while it goes up, with the bar across its middle, clear of the buttons on its corners
  tileShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: spacing.lg },
  progressTrack: { height: 6, borderRadius: radii.pill, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: radii.pill },
  tileFailed: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  tileFailedText: { fontSize: typography.sizes.sm, textAlign: 'center' },
  retry: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, borderRadius: radii.pill, justifyContent: 'center' },
  retryText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  tileRemove: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileRemoveDot: { width: 28, height: 28, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  tileAlt: { position: 'absolute', left: 0, bottom: 0, minWidth: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, justifyContent: 'center', paddingLeft: spacing.sm },
  altPill: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.sm },
  altPillText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.4 },
  kinds: { gap: spacing.xs },
  groupLabel: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, borderRadius: radii.pill, justifyContent: 'center' },
  chipText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.md },
  switchTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  hint: { fontSize: typography.sizes.sm },
  sourceInput: { minHeight: MIN_TOUCH_TARGET, borderRadius: radii.md, paddingHorizontal: spacing.md, fontSize: typography.sizes.md, marginTop: spacing.xs },
  // the rule runs edge to edge; what sits on it keeps the column's edges, as the top bar does
  toolbarWrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.xs, paddingBottom: spacing.sm, gap: 2 },
  copyHint: { fontSize: typography.sizes.xs, paddingHorizontal: spacing.md },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  tool: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  count: { fontSize: typography.sizes.sm, fontVariant: ['tabular-nums'] },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { margin: spacing.md, padding: spacing.lg, borderRadius: radii.lg, gap: spacing.sm, maxWidth: 520, width: '100%', alignSelf: 'center' },
  sheetTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  draftRow: { minHeight: MIN_TOUCH_TARGET, padding: spacing.md, borderRadius: radii.md, gap: 2 },
  altPreview: { width: '100%', height: 160, borderRadius: radii.md },
  altInput: { minHeight: 96, maxHeight: 180, borderRadius: radii.md, padding: spacing.md, fontSize: typography.sizes.md },
});
