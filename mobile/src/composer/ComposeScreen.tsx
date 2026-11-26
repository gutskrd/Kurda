import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pressable, ReachReset } from '../theme/Pressable';
import { PressableScale, heldDim } from '../theme/MotionParts';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { ToggleRow } from '../theme/Toggle';
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
import { useHardwareBack } from '../navigation/hardwareBack';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useDirection } from '../reports/direction';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { Avatar, ownAvatarUrl } from '../profile/Avatar';
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
import { HeldNotice, useAccountHeld } from '../reports/HeldNotice';
import { ParentalNote } from '../parental/ParentalNote';
import { useParentalOff } from '../parental/supervision';
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
import { PictureRefusal } from '../pictures/PictureReview';

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
 * The photo library, several at once, in the order tapped. No permission is asked first: the system picker runs outside
 * the app and hands back only the chosen pictures, and asking would block anyone who said no.
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
 * Writing a post: one box for words and up to four pictures, which upload while you write; a title, the kind of post
 * and a source are there when wanted, and Cancel and Post sit at the top, clear of the keyboard. It opens for a new
 * post (its draft kept on this phone, drafts.ts), for editing your own post (`postId`), or to finish a draft an older
 * app saved on the server. `@kurda/shared` post-composer, which the API runs too, decides what may be posted, so Post
 * is enabled exactly when the server would accept it.
 */
export function ComposeScreen({
  postId,
  onExit,
  pick = pickFromLibrary,
  upload = uploadPicture,
  store,
  startWithPictures = false,
  asMeme = false,
}: {
  postId?: string;
  /** Open the photo library as it opens: the way in from "Choose a picture". */
  startWithPictures?: boolean;
  /** Pictures added make a meme to start with (from Memes); the switch can still turn it off. */
  asMeme?: boolean;
  onExit: () => void;
  pick?: (room: number) => Promise<PickedPicture[]>;
  upload?: typeof uploadPicture;
  /** Where the draft is kept; this phone's storage when left out. */
  store?: DeviceStore;
}): React.JSX.Element {
  const { client, user } = useAuth();
  // A held account is told before writing anything, rather than when Post is refused.
  const held = useAccountHeld();
  // A supervised teen whose parent turned posting off is told the same way.
  const postsOff = useParentalOff('posts');
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  // In right-to-left languages the rows start on the right and typing runs right to left, as on every other screen.
  const dir = useDirection();
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
  /** A limit on the account: said with the way to Account standing (reports/SendError). */
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

  // Pictures.

  const patchPicture = useCallback((id: string, patch: Partial<ComposerPicture>) => {
    if (!alive.current) return;
    setState((s) => ({ ...s, pictures: s.pictures.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  }, []);

  const startUpload = useCallback(
    async (picture: Pick<ComposerPicture, 'id' | 'localUri' | 'ownWork'>) => {
      if (!picture.localUri) return;
      patchPicture(picture.id, { status: 'uploading', progress: 0, error: null, mediaKey: null, review: undefined, rejection: null });
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
          review: res.review,
          // The web build's picked file lives only as long as the tab; the uploaded copy outlasts it, unless it is held,
          // when its link is private and lasts minutes.
          ...(Platform.OS === 'web' && res.url && res.review === 'clear' ? { localUri: res.url } : {}),
        });
      } else patchPicture(picture.id, { status: 'failed', error: res.error, rejection: res.rejection ?? null });
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
        // A meme is a post with pictures; with the last one gone, it is a post again.
        return { draft: { ...s.draft, meme: s.draft.meme && pictures.length > 0 }, pictures };
      });
      if (gone && !gone.existing) void dropPicture(gone.localUri);
    },
    [state.pictures],
  );

  // Loading.

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
      // A new post: this phone's draft, and any left on the server by an older app.
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
          // A kept file the phone has since lost cannot come back.
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
    // Once, on opening.
  }, []);

  // "Choose a picture" opens the library once, a moment after the composer has finished coming up, since a phone will
  // not show one screen over another still on its way in.
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

  // The draft is saved a moment after each change, for a new post only. Once the post is up or the draft deleted, a
  // pending save would write it straight back as a draft (with used picture keys), so both cancel it first.
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

  // What can be posted.

  const draft = withPictures(state);
  const check = canPost(draft);
  const uploading = state.pictures.some((p) => p.status === 'uploading');
  const failedPicture = state.pictures.some((p) => p.status === 'failed');
  const patch = original ? toUpdateRequest(original, state) : null;
  const changed = mode === 'new' ? !isEmptyDraft(toStoredDraft(state)) : hasChanges(patch);
  const kind = derivePostType(state.draft);
  const hasContent = !!state.draft.body.trim() || !!state.draft.title.trim() || state.pictures.length > 0;
  const postable =
    !held && check.ok && !uploading && !failedPicture && !posting && (mode === 'new' ? true : mode === 'finish' || hasChanges(patch));

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

  // Posting and leaving.

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
      // It did not go out and the post is still here to send: felt as an error.
      haptic('error');
      if (accountLimitOf(res.error)) setRefusal(res.error);
      else setError(describePostError(res.error, t));
      return;
    }
    // Posted or saved: a light knock as the composer closes, as a comment or a message gets.
    haptic('tap');
    if (mode === 'new') {
      await forgetDraft();
      for (const p of state.pictures) void dropPicture(p.localUri);
    }
    if (mode === 'edit') postSaved(res.data);
    onExit();
  };

  const requestClose = useCallback(() => {
    if (posting) return true;
    if (changed && ready) setClosing(true);
    else onExit();
    return true;
  }, [changed, ready, posting, onExit]);

  // Android's back asks too rather than dropping an edit, only while the composer is in front.
  useHardwareBack(requestClose);

  const deleteDraft = async () => {
    setClosing(false);
    await forgetDraft();
    for (const p of state.pictures) void dropPicture(p.localUri);
    onExit();
  };

  // Drawing.

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
        <View style={[styles.top, styles.column, { flexDirection: dir.row, paddingTop: topInset }]}>
          <Pressable
            onPress={requestClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={({ pressed }) => [styles.cancel, pressed && heldDim]}
            // The way out stands alone at the bar's start, as a back button does, and reaches past every edge.
            reach="open"
          >
            <Text style={[styles.cancelText, { color: colors.textPrimary }]}>{t('common.cancel')}</Text>
          </Pressable>
          <Text style={[styles.heading, { color: colors.textPrimary }]} accessibilityRole="header" numberOfLines={1}>
            {mode === 'edit' ? t('composer.editTitle') : mode === 'finish' ? t('composer.finishTitle') : t('composer.newTitle')}
          </Text>
          <ClayButton label={postLabel} tone="primary" busy={posting} disabled={!postable} onPress={() => void submit()} style={styles.post} />
        </View>

        <SendErrorNotice error={refusal} onDismiss={() => setRefusal(null)} style={styles.column} heldShownBeside />
        {error ? (
          <View style={[styles.banner, styles.column, { flexDirection: dir.row, backgroundColor: colors.dangerFill }]} accessibilityLiveRegion="assertive" accessibilityRole="alert">
            <Icon name="alert" size={18} color={colors.danger} />
            <Text style={[styles.bannerText, dir.text, { color: colors.textPrimary }]}>{error}</Text>
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
        ) : held || postsOff ? (
          <View style={[styles.body, styles.column]}>
            {held ? <HeldNotice /> : <ParentalNote />}
          </View>
        ) : (
          <ScrollView contentContainerStyle={[styles.body, styles.column]} keyboardShouldPersistTaps="handled">
            {mode === 'new' && serverDrafts.length > 0 && !hasContent ? (
              <PressableScale
                onPress={() => setDraftsOpen(true)}
                accessibilityRole="button"
                style={[styles.oldDrafts, { flexDirection: dir.row, backgroundColor: colors.glassFill }]}
              >
                <Icon name="pencil" size={18} tone="primary" />
                <Text style={[styles.oldDraftsText, { color: colors.textPrimary }]}>
                  {t('composer.oldDrafts', { count: serverDrafts.length })}
                </Text>
                <View style={dir.flip}>
                  <Icon name="chevron-right" size={16} color={colors.textSecondary} />
                </View>
              </PressableScale>
            ) : null}

            <View style={[styles.writeRow, { flexDirection: dir.row }]}>
              <Avatar name={who} size={40} photoUrl={ownAvatarUrl(user)} />
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
                      style={[styles.titleInput, dir.free, { color: colors.textPrimary }]}
                      returnKeyType="next"
                      onSubmitEditing={() => bodyRef.current?.focus()}
                    />
                    {titleMissing ? (
                      // A hint while the title is still to come, not an error: nothing has gone wrong yet.
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
                  style={[styles.bodyInput, dir.free, state.pictures.length > 0 && styles.bodyInputShort, { color: colors.textPrimary }]}
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
            {/* Why a picture was refused, under them all, with the way to ask a person; removing it posts the rest. */}
            {state.pictures.map((p, i) =>
              p.status === 'failed' && p.rejection ? (
                <PictureRefusal
                  key={`refused-${p.id}`}
                  rejection={p.rejection}
                  label={state.pictures.length > 1 ? t('composer.picture.label', { n: i + 1, total: state.pictures.length }) : undefined}
                  testID={`composer-refused-${i}`}
                />
              ) : null,
            )}

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
                        style={({ pressed }) => [styles.chip, { backgroundColor: on ? colors.pickedFill : colors.controlTrack }, pressed && heldDim]}
                      >
                        <Text style={[styles.chipText, { color: on ? colors.pickedInk : colors.textPrimary }]}>{t(k.label)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {state.pictures.length > 0 ? (
              <SwitchCard
                title={t('composer.meme')}
                hint={t('composer.memeHint')}
                value={state.draft.meme}
                onValueChange={(meme) => setState((s) => ({ ...s, draft: { ...s.draft, meme } }))}
              />
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
                  style={[styles.sourceInput, dir.free, { color: colors.textPrimary, backgroundColor: colors.controlTrack }]}
                />
                {sourceCounter.show ? <Counter counter={sourceCounter} /> : null}
              </View>
            ) : null}

            {notice ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{notice}</Text> : null}
          </ScrollView>
        )}

        {ready && !held ? (
          <View style={[styles.toolbarWrap, { borderTopColor: colors.separator }]}>
            <Text style={[styles.copyHint, styles.column, { color: colors.textSecondary }]}>{t('composer.copyHint')}</Text>
            <View style={[styles.toolbar, styles.column, { flexDirection: dir.row }]}>
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

      {/* Leaving with something written: keep it, throw it away, or stay. */}
      <Modal visible={closing} transparent animationType="fade" onRequestClose={() => setClosing(false)}>
        <ReachReset>
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
        </ReachReset>
      </Modal>

      {altPicture ? (
        <AltSheet
          picture={altPicture}
          onChange={(patchPic) => {
            patchPicture(altPicture.id, patchPic);
            // "I made this" decides the signature, which is added at upload, so a new choice means a new upload.
            if (patchPic.ownWork !== undefined && patchPic.ownWork !== altPicture.ownWork) {
              void startUpload({ ...altPicture, ownWork: patchPic.ownWork });
            }
          }}
          onClose={() => setAltFor(null)}
        />
      ) : null}

      <Modal visible={draftsOpen} transparent animationType="fade" onRequestClose={() => setDraftsOpen(false)}>
        <ReachReset>
          <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
            <View style={[styles.sheet, { backgroundColor: colors.background }]} accessibilityViewIsModal>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]} accessibilityRole="header">
                {t('composer.oldDraftsTitle')}
              </Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('composer.oldDraftsBody')}</Text>
              {serverDrafts.map((d) => (
                <PressableScale
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
                </PressableScale>
              ))}
              <ClayButton label={t('common.close')} onPress={() => setDraftsOpen(false)} />
            </View>
          </View>
        </ReachReset>
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
      style={({ pressed }) => [styles.tool, on && { backgroundColor: colors.controlTrack }, disabled && styles.disabled, pressed && heldDim]}
    >
      <Icon name={icon} size={22} color={colors.primary} />
    </Pressable>
  );
}

/**
 * A switch on a card of its own, with its name and what it does under it. The whole card toggles it, so the words are
 * the target rather than a 31pt switch at the card's edge.
 */
function SwitchCard({
  title,
  hint,
  value,
  onValueChange,
}: {
  title: string;
  hint: string;
  value: boolean;
  onValueChange: (on: boolean) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <ToggleRow
      label={title}
      hint={hint}
      value={value}
      onValueChange={onValueChange}
      style={({ pressed }) => [styles.switchRow, { flexDirection: dir.row, backgroundColor: colors.glassFill }, pressed && heldDim]}
    >
      {(toggle) => (
        <>
          <View style={styles.flex}>
            <Text style={[styles.switchTitle, dir.text, { color: colors.textPrimary }]}>{title}</Text>
            <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{hint}</Text>
          </View>
          {toggle}
        </>
      )}
    </ToggleRow>
  );
}

/**
 * A picture on the post being written: remove, describe, and how its upload is going. A refused one is dimmed with no
 * retry, since the same picture would be refused again (the reason is said under the pictures); a held one says it is
 * checked before others see it.
 */
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
  const refused = picture.status === 'failed' && !!picture.rejection;
  const held = picture.status === 'done' && picture.review === 'held';
  const status =
    picture.status === 'uploading'
      ? t('composer.picture.uploading', { percent: Math.round(picture.progress * 100) })
      : picture.status === 'failed'
        ? (picture.error ?? t('picture.uploadFailed'))
        : held
          ? t('picture.held.upload')
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
      {refused ? (
        <View style={[styles.tileShade, styles.tileRefused, { backgroundColor: colors.scrim }]} pointerEvents="none" testID="composer-tile-refused">
          <Icon name="eye-off" size={28} color={colors.textOnScrim} />
        </View>
      ) : null}
      {held ? (
        <View style={styles.tileHeld} pointerEvents="none" testID="composer-tile-held">
          <View style={[styles.heldPill, { backgroundColor: colors.background }]}>
            <Icon name="clock" size={12} color={colors.textSecondary} />
            <Text style={[styles.heldPillText, { color: colors.textPrimary }]} numberOfLines={2}>
              {t('picture.held.upload')}
            </Text>
          </View>
        </View>
      ) : null}
      {picture.status === 'failed' && !refused ? (
        <View style={[styles.tileFailed, { backgroundColor: colors.dangerFill }]}>
          <Text style={[styles.tileFailedText, { color: colors.textPrimary }]} numberOfLines={3}>
            {status}
          </Text>
          <PressableScale onPress={onRetry} accessibilityRole="button" style={[styles.retry, { backgroundColor: colors.background }]}>
            <Text style={[styles.retryText, { color: colors.primary }]}>{t('common.retry')}</Text>
          </PressableScale>
        </View>
      ) : null}
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={t('composer.picture.remove', n)}
        style={({ pressed }) => [styles.tileRemove, pressed && heldDim]}
      >
        <View style={[styles.tileRemoveDot, { backgroundColor: colors.background }]}>
          <Icon name="close" size={16} color={colors.textPrimary} />
        </View>
      </Pressable>
      <Pressable
        onPress={onDescribe}
        accessibilityRole="button"
        accessibilityLabel={described ? t('composer.alt.edit', n) : t('composer.alt.add', n)}
        style={({ pressed }) => [styles.tileAlt, pressed && heldDim]}
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
    <BottomSheet visible onClose={onClose} title={t('composer.alt.title')} contentStyle={styles.altScroller}>
      <SheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.altBody}>
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
          <SwitchCard
            title={t('composer.ownWork')}
            hint={picture.ownWork ? t('composer.ownWorkOn') : t('composer.ownWorkOff')}
            value={picture.ownWork}
            onValueChange={(ownWork) => onChange({ ownWork })}
          />
        ) : null}
        <ClayButton label={t('common.done')} tone="primary" onPress={onClose} />
      </SheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // On a tablet or a wide window the composer keeps a reading width.
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  cancel: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.xs },
  cancelText: { fontSize: typography.sizes.text },
  heading: { flex: 1, textAlign: 'center', fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
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
  bannerText: { flex: 1, fontSize: typography.sizes.text },
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
  oldDraftsText: { flex: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  writeRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  writeMain: { flex: 1, gap: spacing.xs },
  titleInput: {
    minHeight: MIN_TOUCH_TARGET,
    fontSize: typography.sizes.text,
    fontWeight: typography.weights.bold,
    paddingVertical: spacing.sm,
  },
  bodyInput: { minHeight: 140, fontSize: typography.sizes.text, lineHeight: 24, paddingTop: spacing.sm },
  // With pictures under it the box no longer needs room to invite writing; it still grows as you type.
  bodyInputShort: { minHeight: 72 },
  fieldNote: { fontSize: typography.sizes.text },
  pictures: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: '48.5%', aspectRatio: 1, borderRadius: radii.md, overflow: 'hidden' },
  tileWide: { width: '100%', aspectRatio: 4 / 3 },
  tileImage: { width: '100%', height: '100%' },
  // The picture dims while it uploads, with the bar across its middle, clear of the corner buttons.
  tileShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: spacing.lg },
  progressTrack: { height: 6, borderRadius: radii.pill, overflow: 'hidden' },
  tileRefused: { alignItems: 'center' },
  // Along the top, clear of the remove button in the corner.
  tileHeld: { position: 'absolute', top: spacing.sm, left: spacing.sm, right: MIN_TOUCH_TARGET },
  heldPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.sm },
  heldPillText: { flexShrink: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
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
  tileFailedText: { fontSize: typography.sizes.text, textAlign: 'center' },
  retry: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, borderRadius: radii.pill, justifyContent: 'center' },
  retryText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
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
  altPillText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, letterSpacing: 0.4 },
  kinds: { gap: spacing.xs },
  groupLabel: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, borderRadius: radii.pill, justifyContent: 'center' },
  chipText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.md },
  switchTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  hint: { fontSize: typography.sizes.text },
  sourceInput: { minHeight: MIN_TOUCH_TARGET, borderRadius: radii.md, paddingHorizontal: spacing.md, fontSize: typography.sizes.text, marginTop: spacing.xs },
  // The rule runs edge to edge; what sits on it keeps the column's edges, as the top bar does.
  toolbarWrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.xs, paddingBottom: spacing.sm, gap: 2 },
  copyHint: { fontSize: typography.sizes.text, paddingHorizontal: spacing.md },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  tool: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  count: { fontSize: typography.sizes.text, fontVariant: ['tabular-nums'] },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { margin: spacing.md, padding: spacing.lg, borderRadius: radii.lg, gap: spacing.sm, maxWidth: 520, width: '100%', alignSelf: 'center' },
  sheetTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  draftRow: { minHeight: MIN_TOUCH_TARGET, padding: spacing.md, borderRadius: radii.md, gap: 2 },
  // The ScrollView keeps the gutter, so the form scrolls edge to edge while the keyboard is up.
  altScroller: { paddingHorizontal: 0 },
  altBody: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm, gap: spacing.sm },
  altPreview: { width: '100%', height: 160, borderRadius: radii.md },
  altInput: { minHeight: 96, maxHeight: 180, borderRadius: radii.md, padding: spacing.md, fontSize: typography.sizes.text },
});
