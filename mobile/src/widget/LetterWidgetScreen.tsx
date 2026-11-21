import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, PixelRatio, Platform, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { DEFAULT_PAPER, letterBirdSvg, letterPaperSvg, paperColors, type WidgetSettings } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { useIntents } from '../api/optimistic';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { useDirection } from '../reports/direction';
import { SettingsNote, SettingsPage, SettingsRow, SettingsSection, SettingsSwitch } from '../settings/list';
import { ErrorRetry } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Loading } from '../theme/Loading';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { widgetAuthorization, widgetImageSize, widgetImageUrl, widgetSkyAt, type WidgetConfig } from './contract';
import { loadWidgetSettings, saveWidgetPrefs } from './prefs';
import { readWidgetConfig } from './storage';
import { widgetDate, widgetText } from './strings';
import { removeEveryWidget } from './tokens';
import { usePageWidth } from '../theme/pageWidth';

/**
 * The letter widget's settings page, opened from the letters screen's header.
 *
 * At the top, what the widget shows now as it appears on the home screen: the server's picture for it (fetched
 * with this device's widget token) with the text overlaid as the widget does. Under it, whether that is the
 * newest letter or a pinned one, with "Always show the newest letter" to unpin (a letter is pinned from the
 * letter itself). Then the privacy choice: show the words, or only the paper and sender, sealed, since anyone
 * holding the phone sees the home screen. Then how to add the widget, this platform's steps first, and, when it
 * is on several devices, a way to remove it from the others.
 *
 * Every change belongs to the account and saves at once; this device's widget is asked to catch up (prefs.ts).
 */

/** A medium widget's shape, which the preview takes: about twice as wide as it is tall. */
const MEDIUM_RATIO = 0.47;
/** The preview width: a medium phone widget's, never wider than a hand nor too narrow to show the paper. */
const PREVIEW_MAX = 360;
const PREVIEW_MIN = 240;

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; settings: WidgetSettings };

export function LetterWidgetScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client, baseUrl } = useAuth();
  const { t, locale } = useI18n();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [othersGone, setOthersGone] = useState(false);

  const fetchSettings = useCallback(async () => {
    const res = await loadWidgetSettings(client);
    setLoad(res.ok ? { kind: 'ready', settings: res.data } : { kind: 'failed' });
  }, [client]);

  useEffect(() => {
    void fetchSettings();
    void readWidgetConfig().then(setConfig);
  }, [fetchSettings]);

  // Back to the newest letter: the preview needs the server's answer to show which, so the row waits for it.
  const showNewest = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    const res = await saveWidgetPrefs(client, { pinnedLetterId: null });
    setBusy(false);
    if (res.ok) setLoad({ kind: 'ready', settings: res.data });
    else setProblem(describeError(res.error, t));
  }, [client, t]);

  // The switch moves under the finger and is sent in the background; it goes back if the server says no.
  const words = useIntents<'showWords', boolean, WidgetSettings>(
    async (_key, showWords) => {
      const res = await saveWidgetPrefs(client, { showWords });
      if (res.ok) setLoad({ kind: 'ready', settings: res.data });
      return res;
    },
    { failed: (error) => setProblem(describeError(error, t)) },
  );
  const setWords = (on: boolean): void => {
    if (load.kind !== 'ready') return;
    setProblem(null);
    words.want('showWords', on, load.settings.showWords);
  };

  const takeOffOthers = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    const done = await removeEveryWidget({ client, apiBase: baseUrl, locale });
    setBusy(false);
    if (!done) {
      setProblem(t('letterWidget.othersFailed'));
      return;
    }
    setOthersGone(true);
    void readWidgetConfig().then(setConfig);
    await fetchSettings();
  }, [baseUrl, client, fetchSettings, locale, t]);

  return (
    <SettingsPage title={t('letterWidget.title')} onExit={onExit}>
      {load.kind === 'loading' ? (
        <Loading size="large" style={styles.loading} />
      ) : load.kind === 'failed' ? (
        <ErrorRetry
          onRetry={() => {
            setLoad({ kind: 'loading' });
            void fetchSettings();
          }}
        />
      ) : (
        <WidgetSettingsBody
          settings={{ ...load.settings, showWords: words.shown('showWords', load.settings.showWords) }}
          config={config}
          busy={busy}
          problem={problem}
          othersGone={othersGone}
          onNewest={() => void showNewest()}
          onWords={setWords}
          onTakeOffOthers={() => void takeOffOthers()}
        />
      )}
    </SettingsPage>
  );
}

function WidgetSettingsBody({
  settings,
  config,
  busy,
  problem,
  othersGone,
  onNewest,
  onWords,
  onTakeOffOthers,
}: {
  settings: WidgetSettings;
  config: WidgetConfig | null;
  busy: boolean;
  problem: string | null;
  othersGone: boolean;
  onNewest: () => void;
  onWords: (on: boolean) => void;
  onTakeOffOthers: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const screen = usePageWidth();
  const width = Math.max(PREVIEW_MIN, Math.min(PREVIEW_MAX, screen - layout.gutter * 2));
  const iphone = (
    <HowToAdd
      title={t('keyboard.guide.onIphone')}
      steps={[t('letterWidget.add.iphone1'), t('letterWidget.add.iphone2'), t('letterWidget.add.iphone3')]}
    />
  );
  const android = (
    <HowToAdd
      title={t('keyboard.guide.onAndroid')}
      steps={[t('letterWidget.add.android1'), t('letterWidget.add.android2'), t('letterWidget.add.android3')]}
    />
  );
  return (
    <>
      <SettingsSection first title={t('letterWidget.now')}>
        <View style={styles.previewWrap}>
          <WidgetPreview settings={settings} config={config} width={width} />
        </View>
        <SettingsNote>{settings.pinned ? t('letterWidget.showsPinned') : t('letterWidget.showsNewest')}</SettingsNote>
        {settings.pinned ? <SettingsRow icon="mail" title={t('letterWidget.newest')} opens={false} onPress={busy ? undefined : onNewest} /> : null}
        {problem ? (
          <Text style={[styles.problem, { color: colors.danger }]} accessibilityLiveRegion="polite">
            {problem}
          </Text>
        ) : null}
      </SettingsSection>
      <SettingsSection footer={t('letterWidget.wordsPrivate')}>
        <SettingsSwitch icon="text-t" title={t('letterWidget.words')} subtitle={t('letterWidget.wordsHint')} value={settings.showWords} onValueChange={onWords} disabled={busy} />
      </SettingsSection>
      <SettingsSection title={t('letterWidget.add')}>
        <View style={styles.bird} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SvgXml xml={letterBirdSvg({ bird: settings.letter?.from.bird ?? 0, pose: 'hello', letter: true, size: 96, idPrefix: 'lwb' })} width={96} height={96} />
        </View>
        {/* This platform's steps only: an iPhone app explaining another platform's home screen reads as made for both. */}
        {Platform.OS === 'android' ? android : iphone}
      </SettingsSection>
      {settings.widgets > 1 || othersGone ? (
        <SettingsSection title={t('letterWidget.othersTitle')}>
          {othersGone ? (
            <SettingsNote>{t('letterWidget.othersDone')}</SettingsNote>
          ) : (
            <SettingsRow
              icon="devices"
              title={t('letterWidget.others')}
              subtitle={t('letterWidget.othersHint', { count: settings.widgets })}
              opens={false}
              onPress={busy ? undefined : onTakeOffOthers}
            />
          )}
        </SettingsSection>
      ) : null}
    </>
  );
}

/** What the widget shows now, at a medium widget's shape: its picture and text, as on the home screen. */
function WidgetPreview({ settings, config, width }: { settings: WidgetSettings; config: WidgetConfig | null; width: number }): React.JSX.Element {
  const { locale } = useI18n();
  const letter = settings.letter;
  const paper = letter?.paper ?? DEFAULT_PAPER;
  const colors = paperColors(paper);
  const height = Math.round(width * MEDIUM_RATIO);
  const rtl = letter?.rtl ?? false;
  const align = { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' } as const;
  const wash = { backgroundColor: `${colors.sheet}e6` };
  const sealed = letter !== null && (!settings.showWords || letter.excerpt.trim() === '');
  const picture = useMemo(() => {
    if (!config) return null;
    const size = widgetImageSize(width, height, PixelRatio.get());
    // What it is a picture of, so a new letter never shows the last one's cached picture.
    const subject = letter ? `${letter.id}-${letter.from.bird}` : 'empty';
    return { uri: `${widgetImageUrl(config.apiBase, size, widgetSkyAt(new Date().getHours()))}&v=${subject}`, headers: { authorization: widgetAuthorization(config.token) } };
  }, [config, height, letter, width]);
  const paperXml = useMemo(() => (letter && !picture ? letterPaperSvg({ paper, width, height, idPrefix: 'lwp' }) : null), [height, letter, paper, picture, width]);

  const heading = letter ? (sealed ? widgetText(locale, 'sealed', { name: letter.from.name }) : letter.from.name) : widgetText(locale, 'empty');
  const body = letter ? (sealed ? null : letter.excerpt) : widgetText(locale, 'emptyMore');
  const date = letter ? widgetDate(letter.sentAt, locale) : null;
  const label = [heading, body, date, settings.pinned ? widgetText(locale, 'pinned') : null].filter(Boolean).join('. ');

  return (
    <View style={[styles.preview, { width, height, backgroundColor: colors.sheet }]} accessible accessibilityRole="image" accessibilityLabel={label}>
      {picture ? <Image source={picture} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
      {paperXml ? (
        <View style={StyleSheet.absoluteFill}>
          <SvgXml xml={paperXml} width={width} height={height} />
        </View>
      ) : null}
      <View style={styles.previewInside}>
        <View style={[styles.previewWords, wash, letter ? { marginEnd: rtl ? 0 : width * 0.24, marginStart: rtl ? width * 0.24 : 0 } : null]}>
          <View style={[styles.previewHeading, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <Text style={[styles.previewName, align, { color: colors.ink }]} numberOfLines={sealed ? 2 : 1}>
              {heading}
            </Text>
            {settings.pinned ? <Icon name="pin" size={14} color={colors.ink} /> : null}
          </View>
          {body ? (
            <Text style={[styles.previewBody, align, { color: letter ? colors.ink : colors.muted }]} numberOfLines={letter ? 3 : 2}>
              {body}
            </Text>
          ) : null}
        </View>
        {date ? (
          <View style={{ flexDirection: rtl ? 'row-reverse' : 'row' }}>
            <Text style={[styles.previewDate, wash, { color: colors.muted }]}>{date}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** One phone's way to add the widget, in a few numbered steps. */
function HowToAdd({ title, steps }: { title: string; steps: string[] }): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  const dir = useDirection();
  return (
    <View style={styles.how}>
      <Text style={[styles.howTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
        {title}
      </Text>
      {steps.map((step, i) => (
        <View key={step} style={[styles.step, { flexDirection: dir.row }]}>
          <View style={[styles.stepNumber, { backgroundColor: colors.controlTrack }]}>
            <Text style={[styles.stepNumberText, { color: colors.textPrimary }]}>{formatNumber(i + 1, locale)}</Text>
          </View>
          <Text style={[styles.stepText, dir.text, { color: colors.textSecondary }]}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: spacing.xl },
  previewWrap: { alignItems: 'center', paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
  preview: { borderRadius: radii.lg, overflow: 'hidden' },
  previewInside: { flex: 1, justifyContent: 'space-between', padding: 10 },
  previewWords: { borderRadius: radii.sm, padding: 6, gap: 2 },
  previewHeading: { alignItems: 'center', gap: 6 },
  previewName: { flex: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  previewBody: { fontSize: typography.sizes.text, lineHeight: 22 },
  previewDate: { fontSize: typography.sizes.text, borderRadius: radii.xs, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  problem: { fontSize: typography.sizes.text, lineHeight: 20, paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
  bird: { alignItems: 'center', paddingTop: spacing.sm },
  how: { paddingHorizontal: layout.gutter, paddingTop: spacing.md, gap: spacing.sm },
  howTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  step: { alignItems: 'flex-start', gap: spacing.sm + 4 },
  stepNumber: { width: 26, height: 26, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  stepText: { flex: 1, fontSize: typography.sizes.text, lineHeight: 21, paddingTop: 2 },
});
