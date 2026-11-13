import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { arrivalHeld } from './auth/arrival';
import { MarketingLayout } from './layouts/MarketingLayout';
import { AppLayout } from './layouts/AppLayout';
import { FocusLayout } from './layouts/FocusLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppGate } from './components/AppGate';
import { RequireAccount } from './components/RequireAccount';
import { Landing } from './pages/Landing';
import { Civak } from './pages/Civak';
import { NotFound } from './pages/NotFound';

/*
 * Every other page is fetched when somebody first goes to it.
 *
 * Thirty-eight routes were imported here statically, so the first visit to
 * hevalo.app downloaded the photo editor, both multiplayer games, the shop
 * and the settings screen before it could draw the landing page. The three
 * above keep their static import because they are what somebody sees first —
 * the landing page, the wall behind /app, and the not-found page, which is
 * small and is the one route that cannot afford to go looking for a chunk.
 *
 * `then(m => ({ default: m.X }))` is the dance `lazy` requires of a module
 * that exports its component by name instead of by default. Written out
 * rather than wrapped in a helper: a helper would have to be generic over
 * the export name to stay type-safe, and the import specifier has to stay a
 * literal for the bundler to see it at all.
 */
const LibraryPostPage = lazy(() => import('./pages/LibraryPostPage').then((m) => ({ default: m.LibraryPostPage })));
const Saved = lazy(() => import('./pages/Saved').then((m) => ({ default: m.Saved })));
const DimenPost = lazy(() => import('./pages/DimenPost').then((m) => ({ default: m.DimenPost })));
const Games = lazy(() => import('./pages/Games').then((m) => ({ default: m.Games })));
const InvitePage = lazy(() => import('./play/InvitePage').then((m) => ({ default: m.InvitePage })));
const Wordle = lazy(() => import('./pages/Wordle').then((m) => ({ default: m.Wordle })));
const LastLetter = lazy(() => import('./lastletter/LastLetter').then((m) => ({ default: m.LastLetter })));
const Impostor = lazy(() => import('./impostor/Impostor').then((m) => ({ default: m.Impostor })));
const Rhyme = lazy(() => import('./pages/Rhyme').then((m) => ({ default: m.Rhyme })));
const Race = lazy(() => import('./pages/Race').then((m) => ({ default: m.Race })));
const BuildSentence = lazy(() => import('./games/BuildSentence').then((m) => ({ default: m.BuildSentence })));
const MemoryThief = lazy(() => import('./games/MemoryThief').then((m) => ({ default: m.MemoryThief })));
const HearIt = lazy(() => import('./games/HearIt').then((m) => ({ default: m.HearIt })));
const Detective = lazy(() => import('./games/Detective').then((m) => ({ default: m.Detective })));
const WhoAmI = lazy(() => import('./whoami/WhoAmI').then((m) => ({ default: m.WhoAmI })));
const StoriesLibrary = lazy(() => import('./stories/StoriesLibrary').then((m) => ({ default: m.StoriesLibrary })));
const StoryReader = lazy(() => import('./stories/StoryReader').then((m) => ({ default: m.StoryReader })));
const StoryGame = lazy(() => import('./stories/StoryGame').then((m) => ({ default: m.StoryGame })));
const WordleBattle = lazy(() => import('./pages/WordleBattle').then((m) => ({ default: m.WordleBattle })));
const RhymeMatch = lazy(() => import('./pages/RhymeMatch').then((m) => ({ default: m.RhymeMatch })));
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Register').then((m) => ({ default: m.Register })));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword })));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail').then((m) => ({ default: m.VerifyEmail })));
const ResetPassword = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })));
const Learn = lazy(() => import('./pages/Learn').then((m) => ({ default: m.Learn })));
const CourseMap = lazy(() => import('./pages/CourseMap').then((m) => ({ default: m.CourseMap })));
const Lesson = lazy(() => import('./pages/Lesson').then((m) => ({ default: m.Lesson })));
const Review = lazy(() => import('./pages/Review').then((m) => ({ default: m.Review })));
const NextLesson = lazy(() => import('./pages/NextLesson').then((m) => ({ default: m.NextLesson })));
const Dictionary = lazy(() => import('./pages/Dictionary').then((m) => ({ default: m.Dictionary })));
const Alphabet = lazy(() => import('./pages/Alphabet').then((m) => ({ default: m.Alphabet })));
const Words = lazy(() => import('./pages/Words').then((m) => ({ default: m.Words })));
const WordSet = lazy(() => import('./pages/WordSet').then((m) => ({ default: m.WordSet })));
const Rankings = lazy(() => import('./pages/Rankings').then((m) => ({ default: m.Rankings })));
// Game Ranks, leagues and badges (contract 4): the badge collection and the season
const BadgesPage = lazy(() => import('./badges/BadgesPage').then((m) => ({ default: m.BadgesPage })));
// the learner's tree: planted once, watered with what lessons earn
const TreePage = lazy(() => import('./tree/TreePage').then((m) => ({ default: m.TreePage })));
const SeasonPage = lazy(() => import('./ranks/SeasonPage').then((m) => ({ default: m.SeasonPage })));
const RanksPage = lazy(() => import('./ranks/RanksPage').then((m) => ({ default: m.RanksPage })));
const Friends = lazy(() => import('./pages/Friends').then((m) => ({ default: m.Friends })));
const Search = lazy(() => import('./pages/Search').then((m) => ({ default: m.Search })));
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })));
const ProfileEdit = lazy(() => import('./pages/ProfileEdit').then((m) => ({ default: m.ProfileEdit })));
const UserProfile = lazy(() => import('./pages/UserProfile').then((m) => ({ default: m.UserProfile })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Messages = lazy(() => import('./pages/Messages').then((m) => ({ default: m.Messages })));
const Shop = lazy(() => import('./pages/Shop').then((m) => ({ default: m.Shop })));
const About = lazy(() => import('./pages/About').then((m) => ({ default: m.About })));
const CopyrightPage = lazy(() => import('./copyright/CopyrightPage').then((m) => ({ default: m.CopyrightPage })));
const Privacy = lazy(() => import('./pages/Privacy').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('./pages/Terms').then((m) => ({ default: m.Terms })));
const Faq = lazy(() => import('./pages/Faq').then((m) => ({ default: m.Faq })));
const HowHevaloTeaches = lazy(() =>
  import('./pages/HowHevaloTeaches').then((m) => ({ default: m.HowHevaloTeaches })),
);
// reports and account standing (reports/): the two Settings pages, the
// suspension screen, and a warning shown once
const MyReports = lazy(() => import('./reports/MyReports').then((m) => ({ default: m.MyReports })));
const AccountStanding = lazy(() => import('./reports/AccountStanding').then((m) => ({ default: m.AccountStanding })));
import { SuspensionGate } from './reports/SuspensionGate';
// Hevalo taken offline for a while from the admin console: the screen in its place
import { MaintenanceGate } from './maintenance/MaintenanceGate';
import { StandingWarnings } from './reports/StandingWarnings';
import { GiftArrivals } from './gifts/GiftArrivals';
import { BadgeCelebrations } from './badges/BadgeCelebrations';
import { ProfileModalProvider } from './profile/ProfileModal';
import { RealtimeProvider } from './realtime/RealtimeProvider';
import { MessagesProvider } from './chat/MessagesProvider';
import { RailProvider } from './social/RailProvider';
import { PlayProvider } from './play/PlayProvider';
import { I18nProvider } from './i18n/I18nProvider';
import { AccountLocale } from './i18n/AccountLocale';

/** Keep signed-in users out of the sign-in / sign-up pages, except for the moment the page itself holds to see them in (auth/arrival). */
function RedirectIfAuthed({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { status } = useAuth();
  if (status === 'signedIn' && !arrivalHeld()) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

/**
 * Home is the community.
 *
 * It used to be a page of six tiles above the wall — six doors to places the
 * navigation bar directly above them already listed, and one of those doors led
 * to Civak, which was then shown underneath it anyway. A door tells you a room
 * exists; it does not tell you anything happened in it. Signed-out visitors
 * were already sent straight to the wall, so this only makes everyone's front
 * page the same page.
 */
function CivakMoved(): React.JSX.Element {
  // the old address keeps working, and keeps its filter: /app/stories and
  // /app/poems still redirect through here carrying ?section= and ?kind=
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/app', search }} replace />;
}

/**
 * The word game's old addresses, from before it was called Peyvok: a
 * bookmark, or a battle invite already sent in a chat or an email, lands on
 * the game with its `?id=` kept.
 */
function PeyvokMoved({ to }: { to: string }): React.JSX.Element {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace />;
}

/**
 * The stories' old addresses, from when they were a game: the list and a
 * story now live under Learn's Stories group. An invite link already sent
 * (`?id=`) comes along, and so does a story's slug. The game itself stays
 * where it was (`games/stories/play/:gameId`), so nothing below moves it.
 */
function StoriesMoved(): React.JSX.Element {
  const { search } = useLocation();
  const { slug } = useParams();
  return <Navigate to={{ pathname: slug ? `/app/learn/stories/${encodeURIComponent(slug)}` : '/app/learn/stories', search }} replace />;
}

/**
 * The addresses Build a Sentence and Hear It, Find It had while they
 * were games: they are exercises of the lessons' practice now, under Learn.
 * A round left open and offered again (`?…`) comes along.
 */
function ExerciseMoved({ to }: { to: string }): React.JSX.Element {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace />;
}

/**
 * Where Don't Say the Word!, Kurdish Bluff, The Village and What Would You
 * Say? were, under /app. A game's lobby was its page with an `?id=`, so the
 * page's own path is all there is to catch. The village had two addresses
 * among the games; the bare ones are caught as well, for a link written down
 * from memory.
 */
const RETIRED_GAME_PATHS = ['games/dont-say', 'games/bluff', 'games/village', 'games/kingdom', 'village', 'kingdom', 'games/what-would-you-say'] as const;

/**
 * Every address the site answers, and what is drawn at each.
 *
 * Its own component, inside whatever router is above it, so the table itself
 * can be exercised — the redirects especially, which exist so that an old
 * link or bookmark keeps landing somewhere — without a browser's address bar.
 */
export function AppRoutes(): React.JSX.Element {
  return (
    <Routes>
      {/* the landing page, the pages about Hevalo itself, and old public
          addresses that now live in the app */}
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/about" element={<About />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        {/* copyright notices from anyone, and counter-notices (contract-3 §C) */}
        <Route path="/copyright" element={<CopyrightPage />} />
        <Route path="/faq" element={<Faq />} />
        {/* what the lessons are built on, with the studies; see teaching/principles.ts */}
        <Route path="/how-hevalo-teaches" element={<HowHevaloTeaches />} />
        {/* a game's invite link from a message: what it is, and the way in (shared join-link.ts) */}
        <Route path="/join/:game/:code" element={<InvitePage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="/stories" element={<Navigate to="/app/civak?section=gotin&kind=cirok" replace />} />
      <Route path="/poems" element={<Navigate to="/app/civak?section=gotin&kind=helbest" replace />} />
      <Route path="/games" element={<Navigate to="/app/games" replace />} />

      {/* authentication */}
      <Route element={<AuthLayout />}>
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <Login />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuthed>
              <Register />
            </RedirectIfAuthed>
          }
        />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        {/* where the emailed reset link lands (token in the query) */}
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* signed in but unverified: the only page reachable until confirmed */}
        <Route
          path="/verify-email"
          element={
            <ProtectedRoute>
              <VerifyEmail />
            </ProtectedRoute>
          }
        />
      </Route>

      {/*
        * A lesson and a review, alone on the screen: no navigation, no social
        * column, no invite banner (layouts/FocusLayout.tsx). The learner
        * leaves by the lesson's own ✕, and their answers are saved. The way
        * to a new account's first lesson (pages/NextLesson.tsx) is here too:
        * all it ever shows is the lesson's frame while it finds the lesson,
        * and under the app's bar that frame would jump as the lesson opened.
        */}
      <Route
        path="/app"
        element={
          <AppGate>
            <FocusLayout />
          </AppGate>
        }
      >
        <Route path="learn/next" element={<RequireAccount what="gate.what.course"><NextLesson /></RequireAccount>} />
        <Route path="learn/lesson/:lessonId" element={<RequireAccount what="gate.what.course"><Lesson /></RequireAccount>} />
        <Route path="learn/review" element={<RequireAccount what="gate.what.course"><Review /></RequireAccount>} />
        <Route path="learn/review/:sessionId" element={<RequireAccount what="gate.what.course"><Review /></RequireAccount>} />
      </Route>

      {/*
        * The app, open to read. Anyone can browse the community, open a
        * post and play alone; the pages that are about you, or about
        * reaching other people, ask for an account themselves.
        */}
      <Route
        path="/app"
        element={
          <AppGate>
            <AppLayout />
          </AppGate>
        }
      >
        <Route index element={<Civak />} />
        {/* Learn's Lessons group. Open to read: a visitor gets the alphabet, the
            dictionary and the games, and is asked for an account where the
            courses would be (see pages/Learn.tsx) */}
        <Route path="learn" element={<Learn />} />
        {/* Learn's Stories group: the library, and a story to read under it
            (stories/StoriesLibrary.tsx, StoryReader.tsx). Open to everyone; a
            bookmark, a place kept in a story and the check after it ask for an
            account themselves */}
        <Route path="learn/stories" element={<StoriesLibrary />} />
        <Route path="learn/stories/:slug" element={<StoryReader />} />
        {/* the learning loop: a course's map; the lesson itself, a review and
            the way to a new account's first lesson are above, on a screen of
            their own */}
        <Route path="learn/course/:courseId" element={<RequireAccount what="gate.what.course"><CourseMap /></RequireAccount>} />
        <Route path="dictionary" element={<RequireAccount what="gate.what.course"><Dictionary /></RequireAccount>} />
        {/* the first thing a beginner needs, and open to everyone — see pages/Alphabet.tsx */}
        <Route path="alphabet" element={<Alphabet />} />
        {/* the words after the letters — colours, numbers, days, months — open to
            everyone too, each set on a page of its own (pages/Words.tsx, WordSet.tsx) */}
        {/* the lessons' two exercises that were games once: Build a Sentence
            and Hear It, Find It. They are rounds made and checked on the server
            against the learner, so they need an account as a lesson does; the
            addresses they had among the games lead here, a round's `?…` kept */}
        <Route path="learn/practice/build-sentence" element={<RequireAccount what="gate.what.course"><BuildSentence /></RequireAccount>} />
        <Route path="learn/practice/hear-it" element={<RequireAccount what="gate.what.course"><HearIt /></RequireAccount>} />
        <Route path="games/build-sentence" element={<ExerciseMoved to="/app/learn/practice/build-sentence" />} />
        <Route path="games/hear-it" element={<ExerciseMoved to="/app/learn/practice/hear-it" />} />
        <Route path="learn/words" element={<Words />} />
        <Route path="learn/words/:set" element={<WordSet />} />
        {/* one route for both kinds: a post knows which it is */}
        <Route path="library/:id" element={<LibraryPostPage />} />
        <Route path="civak" element={<CivakMoved />} />
        <Route path="saved" element={<RequireAccount what="gate.what.savePosts"><Saved /></RequireAccount>} />
        {/* the three old walls now point at the one that replaced them, each
            landing on its own filter so a bookmark still means something */}
        <Route path="stories" element={<Navigate to="/app/civak?section=gotin&kind=cirok" replace />} />
        <Route path="poems" element={<Navigate to="/app/civak?section=gotin&kind=helbest" replace />} />
        <Route path="dimen" element={<Navigate to="/app/civak?section=dimen" replace />} />
        <Route path="dimen/:id" element={<DimenPost />} />
        {/* Learn's Games group, at the address the games always had */}
        <Route path="games" element={<Games />} />
        {/* the phone's old names for two places, so a shared link still lands */}
        <Route path="play" element={<Navigate to="/app/games" replace />} />
        <Route path="inbox" element={<Navigate to="/app/messages" replace />} />
        {/* the games played alone need an account too: every round is
            scored on the server against the player (api/src/game), so a
            guest is asked here rather than shown a game that cannot start */}
        <Route path="games/peyvok" element={<RequireAccount what="gate.what.play"><Wordle /></RequireAccount>} />
        <Route path="games/wordle" element={<PeyvokMoved to="/app/games/peyvok" />} />
        <Route path="games/rhyme" element={<RequireAccount what="gate.what.play"><Rhyme /></RequireAccount>} />
        <Route path="games/race" element={<RequireAccount what="gate.what.play"><Race /></RequireAccount>} />
        {/* the learning games, each a round made and scored on the server like the others */}
        <Route path="games/memory-thief" element={<RequireAccount what="gate.what.play"><MemoryThief /></RequireAccount>} />
        <Route path="games/detective" element={<RequireAccount what="gate.what.play"><Detective /></RequireAccount>} />
        {/* Stories replaced the ranked quiz, then moved from the games to Learn's
            own Stories group: both old addresses lead there (an invite's `?id=`
            and a story's slug kept). A game on a story stays here: a quiz on one
            needs an account */}
        <Route path="games/quiz" element={<Navigate to="/app/learn/stories" replace />} />
        <Route path="games/stories" element={<StoriesMoved />} />
        <Route path="games/stories/:slug" element={<StoriesMoved />} />
        <Route
          path="games/stories/play/:gameId"
          element={<RequireAccount what="gate.what.play"><StoryGame /></RequireAccount>}
        />
        {/* the two games played against other people */}
        <Route
          path="games/peyvok-battle"
          element={<RequireAccount what="gate.what.playOthers"><WordleBattle /></RequireAccount>}
        />
        <Route path="games/wordle-battle" element={<PeyvokMoved to="/app/games/peyvok-battle" />} />
        <Route
          path="games/rhyme-match"
          element={<RequireAccount what="gate.what.playOthers"><RhymeMatch /></RequireAccount>}
        />
        {/* the multiplayer learning games, with friends or against Hevalo */}
        <Route
          path="games/last-letter"
          element={<RequireAccount what="gate.what.playOthers"><LastLetter /></RequireAccount>}
        />
        <Route
          path="games/impostor"
          element={<RequireAccount what="gate.what.playOthers"><Impostor /></RequireAccount>}
        />
        {/* Don't Say the Word!, Kurdish Bluff, The Village and What Would You Say?
            are no longer part of Hevalo: an old link, bookmark or invitation to
            one lands on the games that are, rather than on "page not found" */}
        {RETIRED_GAME_PATHS.map((path) => (
          <Route key={path} path={path} element={<Navigate to="/app/games" replace />} />
        ))}
        {/* Who Am I?: a round alone, or a race with friends */}
        <Route path="games/who-am-i" element={<RequireAccount what="gate.what.play"><WhoAmI /></RequireAccount>} />
        <Route path="rankings" element={<Rankings />} />
        <Route path="leagues" element={<Navigate to="/app/rankings" replace />} />
        <Route path="badges" element={<RequireAccount what="gate.what.profile"><BadgesPage /></RequireAccount>} />
        <Route path="tree" element={<RequireAccount what="gate.what.profile"><TreePage /></RequireAccount>} />
        <Route path="season" element={<RequireAccount what="gate.what.play"><SeasonPage /></RequireAccount>} />
        <Route path="ranks" element={<RequireAccount what="gate.what.play"><RanksPage /></RequireAccount>} />
        <Route path="ranks/:game" element={<RequireAccount what="gate.what.play"><RanksPage /></RequireAccount>} />
        {/* people and words, from one field; open to everyone, and a visitor
            is shown what each half needs (see pages/Search.tsx) */}
        <Route path="search" element={<Search />} />
        <Route path="friends" element={<RequireAccount what="gate.what.addFriends"><Friends /></RequireAccount>} />
        <Route path="messages" element={<RequireAccount what="gate.what.sendMessages"><Messages /></RequireAccount>} />
        <Route path="shop" element={<RequireAccount what="gate.what.buy"><Shop /></RequireAccount>} />
        <Route path="profile" element={<RequireAccount what="gate.what.profile"><Profile /></RequireAccount>} />
        <Route
          path="profile/edit"
          element={<RequireAccount what="gate.what.profile"><ProfileEdit /></RequireAccount>}
        />
        <Route path="users/:id" element={<UserProfile />} />
        <Route path="settings" element={<RequireAccount what="gate.what.settings"><Settings /></RequireAccount>} />
        {/* a settings page of its own (pages/Settings.tsx); reports and standing below are pages of their own too */}
        <Route path="settings/:page" element={<RequireAccount what="gate.what.settings"><Settings /></RequireAccount>} />
        <Route path="settings/reports" element={<RequireAccount what="gate.what.settings"><MyReports /></RequireAccount>} />
        <Route path="settings/standing" element={<RequireAccount what="gate.what.settings"><AccountStanding /></RequireAccount>} />
      </Route>
    </Routes>
  );
}

/**
 * Language is the outermost thing in the app, above auth.
 *
 * It used to sit inside `AuthProvider`, which meant the auth provider itself
 * had no translator above it — so the one message a signed-out visitor is most
 * likely to see, the reason their login was refused, was the one that could not
 * be translated. Nothing in `I18nProvider` reads the account: the choice comes
 * from this device or the browser, and `AccountLocale` layers the account's own
 * choice on top once there is an account to read.
 */
export function App(): React.JSX.Element {
  return (
    <I18nProvider>
    <AuthProvider>
      {/* inside both: it reads the signed-in account and sets the language */}
      <AccountLocale />
      <RealtimeProvider>
      <BrowserRouter>
        <ProfileModalProvider>
        {/* inside the router: it reads the URL to know which chat is open */}
        <MessagesProvider>
        <StandingWarnings />
        {/* "Rojda sent you a gift — Open", anywhere in the app */}
        <GiftArrivals />
        {/* a badge earned, celebrated wherever you are — after a game's own result */}
        <BadgeCelebrations />
        {/* outermost: while Hevalo is offline nothing below can load, a suspension's reasons included */}
        <MaintenanceGate>
        <SuspensionGate>
        {/* the social column's data and the game invites, held once for every shell below: moving between
            a lesson and the app keeps the purse, the face and the counts in the bar as they were */}
        <RailProvider>
        <PlayProvider>
        <AppRoutes />
        </PlayProvider>
        </RailProvider>
        </SuspensionGate>
        </MaintenanceGate>
        </MessagesProvider>
        </ProfileModalProvider>
      </BrowserRouter>
      </RealtimeProvider>
    </AuthProvider>
    </I18nProvider>
  );
}
