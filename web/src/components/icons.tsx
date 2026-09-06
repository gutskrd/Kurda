/**
 * The app's icons, drawn from Phosphor.
 *
 * These were hand-written SVGs — fine while there were a dozen, but every new
 * screen needed another one drawn by hand, and they drifted in weight and
 * optical size as they accumulated. Phosphor is one family of ~1500 at a
 * consistent weight, so a new screen picks an icon instead of inventing one.
 *
 * This file stays as the façade rather than importing Phosphor at every call
 * site: the names here say what the icon is *for* in MyKurda, so swapping the
 * glyph behind `GameIcon` is one line here instead of a search across the app.
 *
 * Each icon is imported from its own module rather than the package barrel.
 * The barrel re-exports all ~1500, and while Rollup shakes the unused ones out
 * of a production build, dev and test serve unbundled ESM — pulling the barrel
 * in took the test suite's import phase from ~20s to over nine minutes. Deep
 * imports keep that at ~20s and change nothing about the built output.
 */
import { ArrowRight } from '@phosphor-icons/react/dist/icons/ArrowRight';
import { BookOpen } from '@phosphor-icons/react/dist/icons/BookOpen';
import { BookmarkSimple } from '@phosphor-icons/react/dist/icons/BookmarkSimple';
import { CaretRight } from '@phosphor-icons/react/dist/icons/CaretRight';
import { ChatCircle } from '@phosphor-icons/react/dist/icons/ChatCircle';
import { Coin } from '@phosphor-icons/react/dist/icons/Coin';
import { Eye } from '@phosphor-icons/react/dist/icons/Eye';
import { EyeSlash } from '@phosphor-icons/react/dist/icons/EyeSlash';
import { GameController } from '@phosphor-icons/react/dist/icons/GameController';
import { Gear } from '@phosphor-icons/react/dist/icons/Gear';
import { Gift } from '@phosphor-icons/react/dist/icons/Gift';
import { Heart } from '@phosphor-icons/react/dist/icons/Heart';
import { Image as ImageGlyph } from '@phosphor-icons/react/dist/icons/Image';
import { List } from '@phosphor-icons/react/dist/icons/List';
import { Moon } from '@phosphor-icons/react/dist/icons/Moon';
import { PenNib } from '@phosphor-icons/react/dist/icons/PenNib';
import { Sparkle } from '@phosphor-icons/react/dist/icons/Sparkle';
import { SquaresFour } from '@phosphor-icons/react/dist/icons/SquaresFour';
import { Sun } from '@phosphor-icons/react/dist/icons/Sun';
import { TextAa } from '@phosphor-icons/react/dist/icons/TextAa';
import { Trophy } from '@phosphor-icons/react/dist/icons/Trophy';
import { User } from '@phosphor-icons/react/dist/icons/User';
import { Users } from '@phosphor-icons/react/dist/icons/Users';
import { Waveform } from '@phosphor-icons/react/dist/icons/Waveform';
import { X } from '@phosphor-icons/react/dist/icons/X';
import type { Icon, IconWeight } from '@phosphor-icons/react';

/**
 * The line weight the app is drawn at.
 *
 * `regular` sits closest to the 1.7px strokes the hand-drawn set used, so
 * nothing jumps as screens convert.
 */
export const ICON_WEIGHT: IconWeight = 'regular';

interface P {
  size?: number;
  className?: string;
  weight?: IconWeight;
}

/** Name an icon for what it means here, so the glyph can change in one place. */
function named(Glyph: Icon, fallbackSize: number, defaultWeight: IconWeight = ICON_WEIGHT) {
  return function NamedIcon({ size = fallbackSize, className, weight = defaultWeight }: P): React.JSX.Element {
    return <Glyph size={size} className={className} weight={weight} aria-hidden />;
  };
}

/** A filled head-and-shoulders, for an avatar with no picture behind it. */
export const PersonGlyph = named(User, 128, 'fill');

export const BookIcon = named(BookOpen, 22);
export const FeatherIcon = named(PenNib, 22);
export const GameIcon = named(GameController, 22);
export const PhotoIcon = named(ImageGlyph, 22);
export const HeartIcon = named(Heart, 22);
export const CommentIcon = named(ChatCircle, 22);
export const TrophyIcon = named(Trophy, 22);
/** One person: a profile, an account, you. */
export const UserIcon = named(User, 22);
/** More than one person: friends, the social panel, a group. */
export const UsersIcon = named(Users, 22);
export const SparkIcon = named(Sparkle, 22);
export const CoinIcon = named(Coin, 22);
export const TilesIcon = named(SquaresFour, 22);
export const WaveformIcon = named(Waveform, 22);
export const ChevronIcon = named(CaretRight, 18);
export const GiftIcon = named(Gift, 22);
export const MenuIcon = named(List, 22);
export const CloseIcon = named(X, 22);
export const SunIcon = named(Sun, 20);
export const MoonIcon = named(Moon, 20);
export const GearIcon = named(Gear, 20);
export const ArrowIcon = named(ArrowRight, 18);
export const BookmarkIcon = named(BookmarkSimple, 22);
export const TextIcon = named(TextAa, 22);

/** Show / hide a password — one icon with two states, so it keeps its place. */
export function EyeIcon({ size = 19, off = false, className }: P & { off?: boolean }): React.JSX.Element {
  const Glyph = off ? EyeSlash : Eye;
  return <Glyph size={size} className={className} weight={ICON_WEIGHT} aria-hidden />;
}
