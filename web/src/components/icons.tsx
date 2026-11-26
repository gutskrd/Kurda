/**
 * The app's icons, from Phosphor, named for what they mean in Hevalo so a glyph can change in one place.
 *
 * Each icon is imported from its own module, not the package barrel: dev and test serve unbundled ESM, and the barrel's
 * ~1500 re-exports took the test suite's import phase from ~20 s to over nine minutes.
 */
import { ArrowRight } from '@phosphor-icons/react/dist/icons/ArrowRight';
import { At } from '@phosphor-icons/react/dist/icons/At';
import { ArrowUUpLeft } from '@phosphor-icons/react/dist/icons/ArrowUUpLeft';
import { MagicWand } from '@phosphor-icons/react/dist/icons/MagicWand';
import { SlidersHorizontal } from '@phosphor-icons/react/dist/icons/SlidersHorizontal';
import { ArrowUUpRight } from '@phosphor-icons/react/dist/icons/ArrowUUpRight';
import { Crop } from '@phosphor-icons/react/dist/icons/Crop';
import { Pencil } from '@phosphor-icons/react/dist/icons/Pencil';
import { Palette } from '@phosphor-icons/react/dist/icons/Palette';
import { BookOpen } from '@phosphor-icons/react/dist/icons/BookOpen';
import { BookOpenText } from '@phosphor-icons/react/dist/icons/BookOpenText';
import { Bell } from '@phosphor-icons/react/dist/icons/Bell';
import { BookmarkSimple } from '@phosphor-icons/react/dist/icons/BookmarkSimple';
import { CalendarBlank } from '@phosphor-icons/react/dist/icons/CalendarBlank';
import { CaretRight } from '@phosphor-icons/react/dist/icons/CaretRight';
import { ChatCircle } from '@phosphor-icons/react/dist/icons/ChatCircle';
import { Eye } from '@phosphor-icons/react/dist/icons/Eye';
import { EyeSlash } from '@phosphor-icons/react/dist/icons/EyeSlash';
import { PuzzlePiece } from '@phosphor-icons/react/dist/icons/PuzzlePiece';
import { House } from '@phosphor-icons/react/dist/icons/House';
import { Newspaper } from '@phosphor-icons/react/dist/icons/Newspaper';
import { Storefront } from '@phosphor-icons/react/dist/icons/Storefront';
import { DotsThree } from '@phosphor-icons/react/dist/icons/DotsThree';
import { Prohibit } from '@phosphor-icons/react/dist/icons/Prohibit';
import { Detective } from '@phosphor-icons/react/dist/icons/Detective';
import { ArrowsLeftRight } from '@phosphor-icons/react/dist/icons/ArrowsLeftRight';
import { Flag } from '@phosphor-icons/react/dist/icons/Flag';
import { SignOut } from '@phosphor-icons/react/dist/icons/SignOut';
import { Gear } from '@phosphor-icons/react/dist/icons/Gear';
import { Gift } from '@phosphor-icons/react/dist/icons/Gift';
import { ShareNetwork } from '@phosphor-icons/react/dist/icons/ShareNetwork';
import { LinkSimple } from '@phosphor-icons/react/dist/icons/LinkSimple';
import { PaperPlaneTilt } from '@phosphor-icons/react/dist/icons/PaperPlaneTilt';
import { Repeat } from '@phosphor-icons/react/dist/icons/Repeat';
import { Heart } from '@phosphor-icons/react/dist/icons/Heart';
import { Image as ImageGlyph } from '@phosphor-icons/react/dist/icons/Image';
import { List } from '@phosphor-icons/react/dist/icons/List';
import { Moon } from '@phosphor-icons/react/dist/icons/Moon';
import { PenNib } from '@phosphor-icons/react/dist/icons/PenNib';
import { Plus } from '@phosphor-icons/react/dist/icons/Plus';
import { SquaresFour } from '@phosphor-icons/react/dist/icons/SquaresFour';
import { Link as LinkGlyph } from '@phosphor-icons/react/dist/icons/Link';
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
// Stories and playing with friends.
import { CaretDown } from '@phosphor-icons/react/dist/icons/CaretDown';
import { Copy } from '@phosphor-icons/react/dist/icons/Copy';
import { Crown } from '@phosphor-icons/react/dist/icons/Crown';
import { Headphones } from '@phosphor-icons/react/dist/icons/Headphones';
import { Pause } from '@phosphor-icons/react/dist/icons/Pause';
import { Stop } from '@phosphor-icons/react/dist/icons/Stop';
import { SkipBack } from '@phosphor-icons/react/dist/icons/SkipBack';
import { SkipForward } from '@phosphor-icons/react/dist/icons/SkipForward';
import { Timer } from '@phosphor-icons/react/dist/icons/Timer';
import { UserPlus } from '@phosphor-icons/react/dist/icons/UserPlus';
import { UserMinus } from '@phosphor-icons/react/dist/icons/UserMinus';
// Peyvok's delete key, the rating box's stars.
import { Backspace } from '@phosphor-icons/react/dist/icons/Backspace';
import { Star } from '@phosphor-icons/react/dist/icons/Star';
// Leagues and badges: a zone moving up or down, a safe week's shield, a badge's medal.
import { ArrowDown } from '@phosphor-icons/react/dist/icons/ArrowDown';
import { ArrowUp } from '@phosphor-icons/react/dist/icons/ArrowUp';
import { Medal } from '@phosphor-icons/react/dist/icons/Medal';
import { ShieldCheck } from '@phosphor-icons/react/dist/icons/ShieldCheck';
import { HandHeart } from '@phosphor-icons/react/dist/icons/HandHeart';
import { Checks } from '@phosphor-icons/react/dist/icons/Checks';
import { Sparkle } from '@phosphor-icons/react/dist/icons/Sparkle';
// A lesson's results: XP earned, and how many were right first time.
import { Lightning } from '@phosphor-icons/react/dist/icons/Lightning';
import { Snowflake } from '@phosphor-icons/react/dist/icons/Snowflake';
import { Target } from '@phosphor-icons/react/dist/icons/Target';
// Shop items by kind: a tag, a frame, and the search over all of them.
import { Tag } from '@phosphor-icons/react/dist/icons/Tag';
import { FrameCorners } from '@phosphor-icons/react/dist/icons/FrameCorners';
import { MagnifyingGlass } from '@phosphor-icons/react/dist/icons/MagnifyingGlass';
import { ArrowsDownUp } from '@phosphor-icons/react/dist/icons/ArrowsDownUp';
// Narrowing the wall to one kind of post.
import { Funnel } from '@phosphor-icons/react/dist/icons/Funnel';
// Starting a conversation.
import { NotePencil } from '@phosphor-icons/react/dist/icons/NotePencil';
// Detective's board
import { PushPin } from '@phosphor-icons/react/dist/icons/PushPin';
import { Notebook } from '@phosphor-icons/react/dist/icons/Notebook';
import { Ear } from '@phosphor-icons/react/dist/icons/Ear';
import { Note } from '@phosphor-icons/react/dist/icons/Note';
import { ChatText } from '@phosphor-icons/react/dist/icons/ChatText';
import { Lightbulb } from '@phosphor-icons/react/dist/icons/Lightbulb';
import { Gavel } from '@phosphor-icons/react/dist/icons/Gavel';
// Signed-in devices, by kind.
import { DeviceMobile } from '@phosphor-icons/react/dist/icons/DeviceMobile';
import { DeviceTablet } from '@phosphor-icons/react/dist/icons/DeviceTablet';
import { Laptop } from '@phosphor-icons/react/dist/icons/Laptop';
import { Devices } from '@phosphor-icons/react/dist/icons/Devices';
// Settings, one glyph per row.
import { Translate } from '@phosphor-icons/react/dist/icons/Translate';
import { CircleHalf } from '@phosphor-icons/react/dist/icons/CircleHalf';
import { Keyboard } from '@phosphor-icons/react/dist/icons/Keyboard';
import { DownloadSimple } from '@phosphor-icons/react/dist/icons/DownloadSimple';
import { EnvelopeSimple } from '@phosphor-icons/react/dist/icons/EnvelopeSimple';
import { Scales } from '@phosphor-icons/react/dist/icons/Scales';
import { Copyright } from '@phosphor-icons/react/dist/icons/Copyright';
import { Question } from '@phosphor-icons/react/dist/icons/Question';
import { Key } from '@phosphor-icons/react/dist/icons/Key';
import { Ticket } from '@phosphor-icons/react/dist/icons/Ticket';
import { UserCircle } from '@phosphor-icons/react/dist/icons/UserCircle';
import { PaintBrush } from '@phosphor-icons/react/dist/icons/PaintBrush';
import { PaintBrushBroad } from '@phosphor-icons/react/dist/icons/PaintBrushBroad';
import { Pen } from '@phosphor-icons/react/dist/icons/Pen';
import { Highlighter } from '@phosphor-icons/react/dist/icons/Highlighter';
import { Swatches } from '@phosphor-icons/react/dist/icons/Swatches';
// What a lesson on the road is: new words, a conversation, or practice.
import { ChatsCircle } from '@phosphor-icons/react/dist/icons/ChatsCircle';
import { Barbell } from '@phosphor-icons/react/dist/icons/Barbell';
import type { Icon, IconWeight } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { HEVALO_GLYPHS, coinSvg, type CurrencyOptions, type HevaloGlyph } from '@kurda/shared';

/** `regular` is closest to the 1.7px strokes of the earlier hand-drawn set. */
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

/**
 * The currency drawn in colour (shared `coinSvg`), so it looks the same on every surface and on the phone.
 * Decorative, since the amount beside it says what it is.
 */
function currency(draw: (opts: CurrencyOptions) => string, fallbackSize: number) {
  return function CurrencyIcon({ size = fallbackSize, className }: P): React.JSX.Element {
    // Drawn untitled: it stands beside its amount and is hidden from screen readers, so a title would only be stray text.
    const markup = useMemo(() => ({ __html: draw({ size, title: '' }) }), [size]);
    return (
      <span
        className={`currency-icon${className ? ` ${className}` : ''}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
        dangerouslySetInnerHTML={markup}
      />
    );
  };
}

/** One of Hevalo's own glyphs (shared `HEVALO_GLYPHS`), drawn as the family's are: in the text's colour, hidden from readers. */
function drawn(glyph: HevaloGlyph, fallbackSize: number) {
  return function DrawnIcon({ size = fallbackSize, className }: P): React.JSX.Element {
    return (
      <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" className={className} aria-hidden="true" focusable="false">
        {HEVALO_GLYPHS[glyph].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  };
}

/** A filled head-and-shoulders, for an avatar with no picture behind it. */
export const PersonGlyph = named(User, 128, 'fill');

export const BookIcon = named(BookOpen, 22);
export const FeatherIcon = named(PenNib, 22);
/* A puzzle piece rather than a gamepad: these are word games. */
export const GameIcon = named(PuzzlePiece, 22);
export const PhotoIcon = named(ImageGlyph, 22);
export const HeartIcon = named(Heart, 22);
export const CommentIcon = named(ChatCircle, 22);
export const TrophyIcon = named(Trophy, 22);
/** One person: a profile, an account, you. */
export const UserIcon = named(User, 22);
/** More than one person: friends, the social panel, a group. */
export const UsersIcon = named(Users, 22);
/** A parent with a child in front of them: parental controls. */
export const ParentalIcon = drawn('parental', 22);
/** A streak, drawn as a flame as on the phone. */
/** A streak freeze, which keeps a missed day, as on the phone. */
export const IceIcon = named(Snowflake, 22);
/** Zêr: a gold coin with Hevalo's deer carved into it. */
export const CoinIcon = currency(coinSvg, 22);
export const TilesIcon = named(SquaresFour, 22);
/** The Last Letter: a chain of words, each holding on to the one before. */
export const ChainIcon = named(LinkGlyph, 22);
/** Impostor, where one player only pretends to know the word. */
export const ImpostorIcon = named(Detective, 22);
/** A player moved to the other team. */
export const SwapIcon = named(ArrowsLeftRight, 18);
/** Choosing how something of yours looks, such as the bird that carries your letters. */
export const PaletteIcon = named(Palette, 18);
export const WaveformIcon = named(Waveform, 22);
/* The landing page's pictures of a lesson: a clip to play, a word to say. */
export const PlayIcon = named(Play, 22, 'fill');
export const MicIcon = named(Microphone, 22);
export const SpeakerIcon = named(SpeakerHigh, 22);
export const CheckIcon = named(Check, 22, 'bold');
/** Not open yet: a lesson or skill the course has not reached. */
export const LockIcon = named(Lock, 22);
export const ChevronIcon = named(CaretRight, 18);
export const GiftIcon = named(Gift, 22);
/** The network glyph rather than iOS's box-and-arrow, which means "share" on one platform only. */
export const ShareIcon = named(ShareNetwork, 22);
/** The address of a thing, for copying. */
export const LinkIcon = named(LinkSimple, 22);
/** Sending to a person. */
export const SendIcon = named(PaperPlaneTilt, 22);
/** Posting it again on your own wall. */
export const RepostIcon = named(Repeat, 22);
export const MenuIcon = named(List, 22);
export const CloseIcon = named(X, 22);
export const MoonIcon = named(Moon, 20);
export const GearIcon = named(Gear, 20);
export const ArrowIcon = named(ArrowRight, 18);
export const UndoIcon = named(ArrowUUpLeft, 18);
export const RedoIcon = named(ArrowUUpRight, 18);
export const CropIcon = named(Crop, 22);
/* A look applied to the whole picture, and the dials behind it. */
export const FilterIcon = named(MagicWand, 22);
export const SlidersIcon = named(SlidersHorizontal, 22);
export const DrawIcon = named(Pencil, 22);
/** Something written that can be corrected, such as the address a code was sent to. */
export const EditIcon = named(Pencil, 22);
export const BookmarkIcon = named(BookmarkSimple, 22);
export const BellIcon = named(Bell, 22);
/** One bubble: a conversation, whether it has two people or ten. */
export const ChatsIcon = named(ChatCircle, 22);
export const TextIcon = named(TextAa, 22);
/** The dictionary: an open book with lines of text, unlike Learn's plain `BookOpen`. */
export const DictionaryIcon = named(BookOpenText, 22);
/** The days of the week, among the words to learn. */
export const CalendarIcon = named(CalendarBlank, 22);
/** Throwing something away, always behind a confirm. */
export const TrashIcon = named(Trash, 22);
export const PlusIcon = named(Plus, 22);

/* ---- The shell: one glyph per destination ---- */
export const HomeIcon = named(House, 22);
/** The community wall: a page of what everyone wrote. */
export const WallIcon = named(Newspaper, 22);
export const ShopIcon = named(Storefront, 22);
export const SignOutIcon = named(SignOut, 22);
/* The quiet menu on somebody else's profile: block, report. */
export const MoreIcon = named(DotsThree, 22);
export const BlockIcon = named(Prohibit, 22);
export const FlagIcon = named(Flag, 22);
/* Peyvok's delete key; a star you can choose, filled once chosen. */
export const BackspaceIcon = named(Backspace, 22);
export const StarIcon = named(Star, 36);

/* Stories and playing with friends: a story read aloud, its player's keys, a question's clock, the host of a game,
   inviting a friend. */
export const HeadphonesIcon = named(Headphones, 22);
export const PauseIcon = named(Pause, 22, 'fill');
/** Stops a lesson's conversation, which then restarts from the top; not a pause. */
export const StopIcon = named(Stop, 22, 'fill');
export const PreviousIcon = named(SkipBack, 20, 'fill');
export const NextIcon = named(SkipForward, 20, 'fill');
export const TimerIcon = named(Timer, 20);
export const HostIcon = named(Crown, 16, 'fill');
/** Hevalo+, on its own button. */
export const MembersIcon = named(Crown, 22, 'fill');
export const InviteIcon = named(UserPlus, 22);
// Taking someone out of a group.
export const RemovePersonIcon = named(UserMinus, 22);
export const CopyIcon = named(Copy, 20);
/** A lobby's join code. */
export const TicketIcon = named(Ticket, 20);
export const CaretDownIcon = named(CaretDown, 16);

/* Leagues and badges: a league row moving up or down shows an arrow as well as a word, a safe week a shield. */
export const UpIcon = named(ArrowUp, 14, 'bold');
export const DownIcon = named(ArrowDown, 14, 'bold');
export const ShieldIcon = named(ShieldCheck, 14, 'fill');
export const MedalIcon = named(Medal, 22);
/* A notice about your account's safety: a report answered, a decision, an appeal. */
export const SafetyIcon = named(ShieldCheck, 22);
/* A caring message with a helpline. */
export const CareIcon = named(HandHeart, 22);
/* Marking every notification read. */
export const ReadAllIcon = named(Checks, 18);
export const SparkleIcon = named(Sparkle, 16, 'fill');
export const XpIcon = named(Lightning, 22, 'fill');
export const AccuracyIcon = named(Target, 22, 'bold');

/* Shop items by kind (shop/ItemBrowser), standing in for one without a picture, and the search glass. */
export const TagIcon = named(Tag, 22);
export const FrameIcon = named(FrameCorners, 22);
export const SearchIcon = named(MagnifyingGlass, 18);
/** The sort select's glyph in place of its word on a phone. */
export const SortIcon = named(ArrowsDownUp, 18);
/** A sort and filter panel's funnel: outlined while nothing is narrowed, filled while something is. */
export const FunnelIcon = named(Funnel, 20);
/** A new conversation, beside the list of them. */
export const NewMessageIcon = named(NotePencil, 22);

/* Detective: a pinned card, the notebook, the kinds of card (overheard, a note, a statement; a message is the envelope
   above), a bought hint, the accusation. */
export const PinIcon = named(PushPin, 20, 'fill');
export const NotebookIcon = named(Notebook, 22);
export const OverheardIcon = named(Ear, 18);
export const NoteIcon = named(Note, 18);
export const StatementIcon = named(ChatText, 18);
export const HintIcon = named(Lightbulb, 20);
export const AccuseIcon = named(Gavel, 22);

/* A signed-in device in Settings, by what its name says it is; two screens for one that says nothing. */
export const PhoneIcon = named(DeviceMobile, 22);
export const TabletIcon = named(DeviceTablet, 22);
export const ComputerIcon = named(Laptop, 22);
export const DeviceIcon = named(Devices, 22);

/* Settings rows: language, appearance, keyboard, your data, the rules, contact. */
export const LanguageIcon = named(Translate, 22);
export const ThemeIcon = named(CircleHalf, 22);
export const KeyboardIcon = named(Keyboard, 22);
export const DownloadIcon = named(DownloadSimple, 22);
export const MailIcon = named(EnvelopeSimple, 22);
export const RulesIcon = named(Scales, 22);
export const CopyrightIcon = named(Copyright, 22);
export const HelpIcon = named(Question, 22);
export const KeyIcon = named(Key, 22);
export const ProfileIcon = named(UserCircle, 22);
/** A username, written after this sign. */
export const AtIcon = named(At, 22);
/** The account's standing: a tier's shield in outline at a row's size. */
export const StandingIcon = named(ShieldCheck, 22);

/* A letter's paper (letters/LetterComposer): drawing on it with a fine pen, a broad brush or a see-through marker, and
   choosing its lines, colour and ink. */
export const PaintIcon = named(PaintBrush, 18);
export const PenIcon = named(Pen, 18);
export const BrushIcon = named(PaintBrushBroad, 18);
export const MarkerIcon = named(Highlighter, 18);
export const PaperIcon = named(Swatches, 18);

/* What the lesson the road's stop to do now opens is, on its face: letters for new words, a conversation, a workout. */
export const WordsIcon = named(TextAa, 34, 'fill');
export const TalkIcon = named(ChatsCircle, 34, 'fill');
export const PracticeIcon = named(Barbell, 34, 'fill');

/** Show or hide a password: one icon with two states, so it keeps its place. */
export function EyeIcon({ size = 19, off = false, className }: P & { off?: boolean }): React.JSX.Element {
  const Glyph = off ? EyeSlash : Eye;
  return <Glyph size={size} className={className} weight={ICON_WEIGHT} aria-hidden />;
}
