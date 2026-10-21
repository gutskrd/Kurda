/**
 * The app's icons, drawn from Phosphor.
 *
 * These were hand-written SVGs — fine while there were a dozen, but every new
 * screen needed another one drawn by hand, and they drifted in weight and
 * optical size as they accumulated. Phosphor is one family of ~1500 at a
 * consistent weight, so a new screen picks an icon instead of inventing one.
 *
 * This file stays as the façade rather than importing Phosphor at every call
 * site: the names here say what the icon is *for* in Hevalo, so swapping the
 * glyph behind `GameIcon` is one line here instead of a search across the app.
 *
 * Each icon is imported from its own module rather than the package barrel.
 * The barrel re-exports all ~1500, and while Rollup shakes the unused ones out
 * of a production build, dev and test serve unbundled ESM — pulling the barrel
 * in took the test suite's import phase from ~20s to over nine minutes. Deep
 * imports keep that at ~20s and change nothing about the built output.
 */
import { ArrowRight } from '@phosphor-icons/react/dist/icons/ArrowRight';
import { ArrowUUpLeft } from '@phosphor-icons/react/dist/icons/ArrowUUpLeft';
import { MagicWand } from '@phosphor-icons/react/dist/icons/MagicWand';
import { SlidersHorizontal } from '@phosphor-icons/react/dist/icons/SlidersHorizontal';
import { ArrowUUpRight } from '@phosphor-icons/react/dist/icons/ArrowUUpRight';
import { Crop } from '@phosphor-icons/react/dist/icons/Crop';
import { Pencil } from '@phosphor-icons/react/dist/icons/Pencil';
import { BookOpen } from '@phosphor-icons/react/dist/icons/BookOpen';
import { BookOpenText } from '@phosphor-icons/react/dist/icons/BookOpenText';
import { Bell } from '@phosphor-icons/react/dist/icons/Bell';
import { BookmarkSimple } from '@phosphor-icons/react/dist/icons/BookmarkSimple';
import { CaretRight } from '@phosphor-icons/react/dist/icons/CaretRight';
import { ChatCircle } from '@phosphor-icons/react/dist/icons/ChatCircle';
import { Coin } from '@phosphor-icons/react/dist/icons/Coin';
import { Eye } from '@phosphor-icons/react/dist/icons/Eye';
import { EyeSlash } from '@phosphor-icons/react/dist/icons/EyeSlash';
import { PuzzlePiece } from '@phosphor-icons/react/dist/icons/PuzzlePiece';
import { House } from '@phosphor-icons/react/dist/icons/House';
import { Newspaper } from '@phosphor-icons/react/dist/icons/Newspaper';
import { Storefront } from '@phosphor-icons/react/dist/icons/Storefront';
import { DiamondsFour } from '@phosphor-icons/react/dist/icons/DiamondsFour';
import { DotsThree } from '@phosphor-icons/react/dist/icons/DotsThree';
import { Prohibit } from '@phosphor-icons/react/dist/icons/Prohibit';
import { Flag } from '@phosphor-icons/react/dist/icons/Flag';
import { SignOut } from '@phosphor-icons/react/dist/icons/SignOut';
import { Gear } from '@phosphor-icons/react/dist/icons/Gear';
import { Gift } from '@phosphor-icons/react/dist/icons/Gift';
import { ShareNetwork } from '@phosphor-icons/react/dist/icons/ShareNetwork';
import { LinkSimple } from '@phosphor-icons/react/dist/icons/LinkSimple';
import { PaperPlaneTilt } from '@phosphor-icons/react/dist/icons/PaperPlaneTilt';
import { Repeat } from '@phosphor-icons/react/dist/icons/Repeat';
import { Flame } from '@phosphor-icons/react/dist/icons/Flame';
import { Heart } from '@phosphor-icons/react/dist/icons/Heart';
import { Image as ImageGlyph } from '@phosphor-icons/react/dist/icons/Image';
import { List } from '@phosphor-icons/react/dist/icons/List';
import { Moon } from '@phosphor-icons/react/dist/icons/Moon';
import { PenNib } from '@phosphor-icons/react/dist/icons/PenNib';
import { Plus } from '@phosphor-icons/react/dist/icons/Plus';
import { SquaresFour } from '@phosphor-icons/react/dist/icons/SquaresFour';
import { Sun } from '@phosphor-icons/react/dist/icons/Sun';
import { TextAa } from '@phosphor-icons/react/dist/icons/TextAa';
import { Trash } from '@phosphor-icons/react/dist/icons/Trash';
import { Trophy } from '@phosphor-icons/react/dist/icons/Trophy';
import { User } from '@phosphor-icons/react/dist/icons/User';
import { Users } from '@phosphor-icons/react/dist/icons/Users';
import { Waveform } from '@phosphor-icons/react/dist/icons/Waveform';
import { X } from '@phosphor-icons/react/dist/icons/X';
import { Play } from '@phosphor-icons/react/dist/icons/Play';
import { Microphone } from '@phosphor-icons/react/dist/icons/Microphone';
import { SpeakerHigh } from '@phosphor-icons/react/dist/icons/SpeakerHigh';
import { Check } from '@phosphor-icons/react/dist/icons/Check';
import { Lock } from '@phosphor-icons/react/dist/icons/Lock';
// Stories and playing with friends
import { CaretDown } from '@phosphor-icons/react/dist/icons/CaretDown';
import { Copy } from '@phosphor-icons/react/dist/icons/Copy';
import { Crown } from '@phosphor-icons/react/dist/icons/Crown';
import { Headphones } from '@phosphor-icons/react/dist/icons/Headphones';
import { Pause } from '@phosphor-icons/react/dist/icons/Pause';
import { SkipBack } from '@phosphor-icons/react/dist/icons/SkipBack';
import { SkipForward } from '@phosphor-icons/react/dist/icons/SkipForward';
import { Timer } from '@phosphor-icons/react/dist/icons/Timer';
import { UserPlus } from '@phosphor-icons/react/dist/icons/UserPlus';
// web-race-rating: Peyvok's delete key, the rating box's stars
import { Backspace } from '@phosphor-icons/react/dist/icons/Backspace';
import { Star } from '@phosphor-icons/react/dist/icons/Star';
// Game Ranks, leagues and badges: rated and friendly games, a zone moving up
// or down, a tier's shield, a badge's medal
import { ArrowDown } from '@phosphor-icons/react/dist/icons/ArrowDown';
import { ArrowUp } from '@phosphor-icons/react/dist/icons/ArrowUp';
import { Handshake } from '@phosphor-icons/react/dist/icons/Handshake';
import { Medal } from '@phosphor-icons/react/dist/icons/Medal';
import { Mountains } from '@phosphor-icons/react/dist/icons/Mountains';
import { ShieldCheck } from '@phosphor-icons/react/dist/icons/ShieldCheck';
import { HandHeart } from '@phosphor-icons/react/dist/icons/HandHeart';
import { Checks } from '@phosphor-icons/react/dist/icons/Checks';
import { Sparkle } from '@phosphor-icons/react/dist/icons/Sparkle';
// shop items by kind: a tag, a frame, and the search over all of them
import { Tag } from '@phosphor-icons/react/dist/icons/Tag';
import { FrameCorners } from '@phosphor-icons/react/dist/icons/FrameCorners';
import { MagnifyingGlass } from '@phosphor-icons/react/dist/icons/MagnifyingGlass';
import { ArrowsDownUp } from '@phosphor-icons/react/dist/icons/ArrowsDownUp';
// starting a conversation
import { NotePencil } from '@phosphor-icons/react/dist/icons/NotePencil';
// signed-in devices, by kind
import { DeviceMobile } from '@phosphor-icons/react/dist/icons/DeviceMobile';
import { DeviceTablet } from '@phosphor-icons/react/dist/icons/DeviceTablet';
import { Laptop } from '@phosphor-icons/react/dist/icons/Laptop';
import { Devices } from '@phosphor-icons/react/dist/icons/Devices';
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
/* A puzzle piece, not a console controller: these are word games — Peyvok,
   rhyming, a race to answer — and a gamepad promised the wrong thing. */
export const GameIcon = named(PuzzlePiece, 22);
/** Typing, specifically — the race is about keys, not about writing. */
export const PhotoIcon = named(ImageGlyph, 22);
export const HeartIcon = named(Heart, 22);
export const CommentIcon = named(ChatCircle, 22);
export const TrophyIcon = named(Trophy, 22);
/** One person: a profile, an account, you. */
export const UserIcon = named(User, 22);
/** More than one person: friends, the social panel, a group. */
export const UsersIcon = named(Users, 22);
/** A streak, which the phone has drawn as a flame since it had streaks. */
export const FlameIcon = named(Flame, 22);
export const CoinIcon = named(Coin, 22);
export const TilesIcon = named(SquaresFour, 22);
export const WaveformIcon = named(Waveform, 22);
/* the landing page's pictures of a lesson: a clip to play, a word to say */
export const PlayIcon = named(Play, 22, 'fill');
export const MicIcon = named(Microphone, 22);
export const SpeakerIcon = named(SpeakerHigh, 22);
export const CheckIcon = named(Check, 22, 'bold');
/** Not open yet: a lesson or a skill the course has not reached. */
export const LockIcon = named(Lock, 22);
export const ChevronIcon = named(CaretRight, 18);
export const GiftIcon = named(Gift, 22);
/** Passing a post on — the network glyph, not the iOS box-and-arrow, which
 *  means "share" on one platform and nothing on the others. */
export const ShareIcon = named(ShareNetwork, 22);
/** The address of a thing, for copying. */
export const LinkIcon = named(LinkSimple, 22);
/** Sending, to a person. */
export const SendIcon = named(PaperPlaneTilt, 22);
/** Posting it again, onto your own wall. */
export const RepostIcon = named(Repeat, 22);
export const MenuIcon = named(List, 22);
export const CloseIcon = named(X, 22);
export const SunIcon = named(Sun, 20);
export const MoonIcon = named(Moon, 20);
export const GearIcon = named(Gear, 20);
export const ArrowIcon = named(ArrowRight, 18);
/* taking a step back, and putting it back again */
export const UndoIcon = named(ArrowUUpLeft, 18);
export const RedoIcon = named(ArrowUUpRight, 18);
/* deciding what part of a picture is the picture */
export const CropIcon = named(Crop, 22);
/* a look applied to the whole picture, and the dials behind it */
export const FilterIcon = named(MagicWand, 22);
export const SlidersIcon = named(SlidersHorizontal, 22);
export const DrawIcon = named(Pencil, 22);
export const BookmarkIcon = named(BookmarkSimple, 22);
/** Something is waiting for you to look at it. */
export const BellIcon = named(Bell, 22);
/** More than one conversation: a group. */
/** One bubble, not two: a conversation, whether it has two people in it or ten. */
export const ChatsIcon = named(ChatCircle, 22);
export const TextIcon = named(TextAa, 22);
/**
 * The dictionary: an open book with lines of text in it.
 *
 * `TextAa` was here, which is the glyph an editor uses for font size — it reads
 * as a formatting control, not as a book of words. An open book is what every
 * dictionary has on its cover; the lines are what distinguish it from
 * `BookOpen`, which Learn already uses for lessons.
 */
export const DictionaryIcon = named(BookOpenText, 22);
/** Throw something away — always behind a confirm. */
export const TrashIcon = named(Trash, 22);
/** Add something — it makes no claim about what. */
export const PlusIcon = named(Plus, 22);

/* ---- the shell: one glyph per destination, so the nav reads at a glance ---- */
export const HomeIcon = named(House, 22);
/** The community wall — a page of what everyone wrote, not a group of people. */
export const WallIcon = named(Newspaper, 22);
export const ShopIcon = named(Storefront, 22);
/** Gems, the harder currency; Zêr is the CoinIcon above. */
export const GemIcon = named(DiamondsFour, 22);
export const SignOutIcon = named(SignOut, 22);
/* the quiet menu on somebody else's profile: block, report */
export const MoreIcon = named(DotsThree, 22);
export const BlockIcon = named(Prohibit, 22);
export const FlagIcon = named(Flag, 22);
/* web-race-rating: Peyvok's delete key; a star you can choose, filled once it is */
export const BackspaceIcon = named(Backspace, 22);
export const StarIcon = named(Star, 36);

/* Stories and playing with friends: a story read aloud, its player's keys,
   a question's clock, the host of a game, asking a friend in */
export const HeadphonesIcon = named(Headphones, 22);
export const PauseIcon = named(Pause, 22, 'fill');
export const PreviousIcon = named(SkipBack, 20, 'fill');
export const NextIcon = named(SkipForward, 20, 'fill');
export const TimerIcon = named(Timer, 20);
export const HostIcon = named(Crown, 16, 'fill');
export const InviteIcon = named(UserPlus, 22);
export const CopyIcon = named(Copy, 20);
export const CaretDownIcon = named(CaretDown, 16);

/* Game Ranks, leagues and badges (contract 4): a rated game climbs, a friendly
   one is a handshake; a league row moving up or down says so with an arrow as
   well as a word; a tier's shield; a badge */
export const RatedIcon = named(Mountains, 16, 'fill');
export const FriendlyIcon = named(Handshake, 16, 'fill');
export const UpIcon = named(ArrowUp, 14, 'bold');
export const DownIcon = named(ArrowDown, 14, 'bold');
export const ShieldIcon = named(ShieldCheck, 14, 'fill');
export const MedalIcon = named(Medal, 22);
/* a notice about your account's safety: a report answered, a decision, an appeal */
export const SafetyIcon = named(ShieldCheck, 22);
/* a caring message, with a helpline */
export const CareIcon = named(HandHeart, 22);
/* every notification read at once */
export const ReadAllIcon = named(Checks, 18);
export const SparkleIcon = named(Sparkle, 16, 'fill');

/* Shop items by kind (shop/ItemBrowser): what stands in for an item that has
   no picture of its own — a tag is a tag, a frame is a frame — and the glass
   in front of the search over all of them */
export const TagIcon = named(Tag, 22);
export const FrameIcon = named(FrameCorners, 22);
export const SearchIcon = named(MagnifyingGlass, 18);
/** The order a list is in: what the sort select carries in place of its word on a phone. */
export const SortIcon = named(ArrowsDownUp, 18);
/** a new conversation: a note being written, beside the list of them */
export const NewMessageIcon = named(NotePencil, 22);

/* A signed-in device in Settings, by what its name says it is; the pair of
   screens for one that says nothing */
export const PhoneIcon = named(DeviceMobile, 22);
export const TabletIcon = named(DeviceTablet, 22);
export const ComputerIcon = named(Laptop, 22);
export const DeviceIcon = named(Devices, 22);

/** Show / hide a password — one icon with two states, so it keeps its place. */
export function EyeIcon({ size = 19, off = false, className }: P & { off?: boolean }): React.JSX.Element {
  const Glyph = off ? EyeSlash : Eye;
  return <Glyph size={size} className={className} weight={ICON_WEIGHT} aria-hidden />;
}
