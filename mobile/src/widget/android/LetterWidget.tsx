'use no memo';
import { FlexWidget, ImageWidget, OverlapWidget, SvgWidget, TextWidget, type ColorProp, type HexColor } from 'react-native-android-widget';
import { DEFAULT_PAPER, letterBirdSvg, paperColors, type WidgetLetter } from '@kurda/shared';
import { DARK, LIGHT } from '../../theme/palette';
import { radii } from '../../theme/tokens';
import { ICON_PATHS, ICON_VIEWBOX } from '../../theme/icon-paths';
import { APP_LINK, LETTERS_LINK, letterThreadLink } from '../contract';
import { widgetDate, widgetText } from '../strings';

/**
 * The Android letter widget's drawing. Not React Native views: the widget library turns this tree into native
 * widget views rendered by the system's text engine, so Kurmancî and Soranî shape correctly. It runs in the
 * background with no app screen, so it is plain functions of what to show, with no hooks or state and nothing to
 * memoise (hence the directive above).
 *
 * load.ts decides what it shows. A letter is its own paper, drawn by the server with the writer's pigeon in the
 * lower corner away from where the writing starts. Across the top go the sender and the opening, in the writer's
 * ink on a wash of the paper so a drawing never hurts legibility; the date sits in the other lower corner. Sealed
 * (words turned off in settings) shows the paper and sender only. The three sizes match the iPhone widget's
 * small, medium and large.
 */

/** What the widget shows: worked out by load.ts, drawn here. */
export type WidgetShows =
  | { kind: 'letter'; letter: WidgetLetter; pinned: boolean; showWords: boolean; image: string | null }
  /** No pen pal has written yet: the windowsill with your own bird waiting. */
  | { kind: 'empty'; image: string | null }
  /** No token on this phone, or the server refused it. */
  | { kind: 'signedOut' }
  /** Signed in, but nothing could be fetched yet and there is nothing kept from before. */
  | { kind: 'waiting' };

export type WidgetFamily = 'small' | 'medium' | 'large';

/** The iPhone's three sizes, by the room an Android launcher gives (in dp): two cells square, four wide, four by four. */
export function familyOf(width: number, height: number): WidgetFamily {
  if (height >= 250) return 'large';
  if (width >= 250) return 'medium';
  return 'small';
}

/** How many lines of the letter each size has room for above the pigeon. */
export const EXCERPT_LINES: Record<WidgetFamily, number> = { small: 3, medium: 3, large: 7 };

/** A colour with some of the sheet showing through: the wash the words sit on. */
function washOf(hex: string): HexColor {
  return `${hex}e6` as HexColor;
}

/** The pin mark of a letter kept on the widget, in the writer's ink. */
function pinSvg(color: string): string {
  const paths = ICON_PATHS.pin.map((d) => `<path d="${d}" fill="${color}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}">${paths}</svg>`;
}

interface Props {
  shows: WidgetShows;
  width: number;
  height: number;
  locale: string;
  /** The app's language is written right to left: the widget's own words line up on the right. */
  rtlLocale: boolean;
  now?: Date;
  /** The phone is in dark mode: only the plain states follow it, a letter is its paper in both. */
  dark?: boolean;
}

export function LetterWidget({ shows, width, height, locale, rtlLocale, now = new Date(), dark = false }: Props): React.JSX.Element {
  const family = familyOf(width, height);
  switch (shows.kind) {
    case 'letter':
      return <LetterOnPaper letter={shows.letter} pinned={shows.pinned} showWords={shows.showWords} image={shows.image} width={width} height={height} family={family} locale={locale} now={now} />;
    case 'empty':
      return <EmptySill image={shows.image} width={width} height={height} family={family} locale={locale} rtl={rtlLocale} />;
    case 'signedOut':
      return <Plain text={widgetText(locale, 'signedOut')} link={APP_LINK} pose="sleep" dark={dark} family={family} />;
    case 'waiting':
      return <Plain text={widgetText(locale, 'waiting')} link={LETTERS_LINK} pose="perched" dark={dark} family={family} />;
  }
}

const fill = { width: 'match_parent', height: 'match_parent' } as const;

function LetterOnPaper({
  letter,
  pinned,
  showWords,
  image,
  width,
  height,
  family,
  locale,
  now,
}: {
  letter: WidgetLetter;
  pinned: boolean;
  showWords: boolean;
  image: string | null;
  width: number;
  height: number;
  family: WidgetFamily;
  locale: string;
  now: Date;
}): React.JSX.Element {
  const colors = paperColors(letter.paper ?? DEFAULT_PAPER);
  const ink = colors.ink as HexColor;
  const rtl = letter.rtl;
  const align = rtl ? 'right' : 'left';
  const name = letter.from.name;
  const sealed = !showWords || letter.excerpt.trim() === '';
  const date = widgetDate(letter.sentAt, locale, now);
  const heading = sealed ? widgetText(locale, 'sealed', { name }) : name;
  const label = [heading, sealed ? '' : letter.excerpt, date, pinned ? widgetText(locale, 'pinned') : ''].filter(Boolean).join('. ');
  // A wide widget's words stop short of the corner the pigeon stands in.
  const clear = family === 'medium' ? Math.round(width * 0.24) : 0;
  return (
    <OverlapWidget
      style={{ ...fill, backgroundColor: colors.sheet as HexColor, borderRadius: radii.lg, overflow: 'hidden' }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: letterThreadLink(letter.threadId) }}
      accessibilityLabel={label}
    >
      {image ? <ImageWidget image={image as `data:image${string}`} imageWidth={width} imageHeight={height} resizeMode="cover" /> : null}
      <FlexWidget style={{ ...fill, flexDirection: 'column', justifyContent: 'space-between', padding: 10 }}>
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', paddingLeft: rtl ? clear : 0, paddingRight: rtl ? 0 : clear }}>
          <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', backgroundColor: washOf(colors.sheet), borderRadius: radii.sm, padding: 6 }}>
            <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
              {rtl && pinned ? <Pin color={colors.ink} /> : null}
              <FlexWidget style={{ flex: 1, marginLeft: rtl && pinned ? 6 : 0, marginRight: !rtl && pinned ? 6 : 0 }}>
                <TextWidget
                  text={heading}
                  maxLines={sealed ? 3 : 1}
                  truncate="END"
                  style={{ width: 'match_parent', fontSize: family === 'small' ? 14 : 15, fontWeight: sealed ? '600' : 'bold', color: ink, textAlign: align }}
                />
              </FlexWidget>
              {!rtl && pinned ? <Pin color={colors.ink} /> : null}
            </FlexWidget>
            {sealed ? null : (
              <TextWidget
                text={letter.excerpt}
                maxLines={EXCERPT_LINES[family]}
                truncate="END"
                style={{ width: 'match_parent', fontSize: family === 'large' ? 15 : 13, lineHeight: family === 'large' ? 21 : 18, color: ink, textAlign: align, marginTop: 2 }}
              />
            )}
          </FlexWidget>
        </FlexWidget>
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: rtl ? 'flex-end' : 'flex-start' }}>
          <TextWidget
            text={date}
            maxLines={1}
            style={{ fontSize: typography.sizes.text, color: colors.muted as HexColor, backgroundColor: washOf(colors.sheet), borderRadius: radii.xs, paddingHorizontal: 5, paddingVertical: 1 }}
          />
        </FlexWidget>
      </FlexWidget>
    </OverlapWidget>
  );
}

function Pin({ color }: { color: string }): React.JSX.Element {
  return <SvgWidget svg={pinSvg(color)} style={{ width: 14, height: 14 }} />;
}

function EmptySill({ image, width, height, family, locale, rtl }: { image: string | null; width: number; height: number; family: WidgetFamily; locale: string; rtl: boolean }): React.JSX.Element {
  const colors = paperColors(DEFAULT_PAPER);
  const align = rtl ? 'right' : 'left';
  return (
    <OverlapWidget
      style={{ ...fill, backgroundColor: colors.sheet as HexColor, borderRadius: radii.lg, overflow: 'hidden' }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: LETTERS_LINK }}
      accessibilityLabel={[widgetText(locale, 'empty'), family === 'small' ? '' : widgetText(locale, 'emptyMore')].filter(Boolean).join('. ')}
    >
      {image ? <ImageWidget image={image as `data:image${string}`} imageWidth={width} imageHeight={height} resizeMode="cover" /> : null}
      <FlexWidget style={{ ...fill, flexDirection: 'column', justifyContent: 'flex-start', padding: 10 }}>
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', backgroundColor: washOf(colors.sheet), borderRadius: radii.sm, padding: 6 }}>
          <TextWidget text={widgetText(locale, 'empty')} maxLines={2} style={{ width: 'match_parent', fontSize: typography.sizes.text, fontWeight: '600', color: colors.ink as HexColor, textAlign: align }} />
          {family === 'small' ? null : (
            <TextWidget text={widgetText(locale, 'emptyMore')} maxLines={2} style={{ width: 'match_parent', fontSize: typography.sizes.text, color: colors.muted as HexColor, textAlign: align, marginTop: 2 }} />
          )}
        </FlexWidget>
      </FlexWidget>
    </OverlapWidget>
  );
}

function Plain({ text, link, pose, dark, family }: { text: string; link: string; pose: 'sleep' | 'perched'; dark: boolean; family: WidgetFamily }): React.JSX.Element {
  const palette = dark ? DARK : LIGHT;
  const bird = family === 'small' ? 56 : 72;
  return (
    <FlexWidget
      style={{ ...fill, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 14, backgroundColor: palette.surface as ColorProp, borderRadius: radii.lg }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: link }}
      accessibilityLabel={text}
    >
      <SvgWidget svg={letterBirdSvg({ bird: 0, pose, portrait: true, size: bird })} style={{ width: bird, height: bird }} />
      <TextWidget text={text} maxLines={3} style={{ fontSize: typography.sizes.text, fontWeight: '600', color: palette.textPrimary as ColorProp, textAlign: 'center', marginTop: 8 }} />
    </FlexWidget>
  );
}
