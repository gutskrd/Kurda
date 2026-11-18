import { lazy } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
// The browser's router, with each change of page carried as a view transition.
import { CarriedRouter } from './lib/viewTransition';
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
 * Every other page loads when first visited; the three above are static because they are seen first (the landing page,
 * the wall behind /app, and the small not-found page, which must not wait for a chunk). The `then(m => ({ default:
 * m.X }))` is what `lazy` needs for named exports, written out because the import specifier must stay a literal for the
 * bundler.
 */
const LibraryPostPage = lazy(() => import('./pages/LibraryPostPage').then((m) => ({ default: m.LibraryPostPage })));
const Saved = lazy(() => import('./pages/Saved').then((m) => ({ default: m.Saved })));
const DimenPost = lazy(() => import('./pages/DimenPost').then((m) => ({ default: m.DimenPost })));
const Games = lazy(() => import('./pages/Games').then((m) => ({ default: m.Games })));
const InvitePage = lazy(() => import('./play/InvitePage').then((m) => ({ default: m.InvitePage })));
const WinPage = lazy(() => import('./share/WinPage').then((m) => ({ default: m.WinPage })));
const Wordle = lazy(() => import('./pages/Wordle').then((m) => ({ default: m.Wordle })));
const LastLetter = lazy(() => import('./lastletter/LastLetter').then((m) => ({ default: m.LastLetter })));
const Impostor = lazy(() => import('./impostor/Impostor').then((m) => ({ default: m.Impostor })));
const Rhyme = lazy(() => import('./pages/Rhyme').then((m) => ({ default: m.Rhyme })));
const Race = lazy(() => import('./pages/Race').then((m) => ({ default: m.Race })));
const BuildSentence = lazy(() => import('./games/BuildSentence').then((m) => ({ default: m.BuildSentence })));
const MemoryThief = lazy(() => import('./games/MemoryThief').then((m) => ({ default: m.MemoryThief })));
const HearIt = lazy(() => import('./games/HearIt').then((m) => ({ default: m.HearIt })));
const PracticeHub = lazy(() => import('./practice/PracticeHub').then((m) => ({ default: m.PracticeHub })));
const Detective = lazy(() => import('./games/Detective').then((m) => ({ default: m.Detective })));
const WhoAmI = lazy(() => import('./whoami/WhoAmI').then((m) => ({ default: m.WhoAmI })));
const StoriesLibrary = lazy(() => import('./stories/StoriesLibrary').then((m) => ({ default: m.StoriesLibrary })));
const StoryReader = lazy(() => import('./stories/StoryReader').then((m) => ({ default: m.StoryReader })));
const StoryGame = lazy(() => import('./stories/StoryGame').then((m) => ({ default: m.StoryGame })));
// The Stories section's two other shelves: riddles and proverbs (lore/).
const RiddlesList = lazy(() => import('./lore/RiddlesList').then((m) => ({ default: m.RiddlesList })));
const RiddlePage = lazy(() => import('./lore/RiddlePage').then((m) => ({ default: m.RiddlePage })));
const RiddleAnswerPage = lazy(() => import('./lore/RiddleAnswer').then((m) => ({ default: m.RiddleAnswerPage })));
const ProverbsList = lazy(() => import('./lore/ProverbsList').then((m) => ({ default: m.ProverbsList })));
const ProverbPage = lazy(() => import('./lore/ProverbPage').then((m) => ({ default: m.ProverbPage })));
const ProverbRound = lazy(() => import('./lore/ProverbRound').then((m) => ({ default: m.ProverbRound })));
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
const JumpTest = lazy(() => import('./learn/JumpTest').then((m) => ({ default: m.JumpTest })));
const NextLesson = lazy(() => import('./pages/NextLesson').then((m) => ({ default: m.NextLesson })));
const Dictionary = lazy(() => import('./pages/Dictionary').then((m) => ({ default: m.Dictionary })));
const Alphabet = lazy(() => import('./pages/Alphabet').then((m) => ({ default: m.Alphabet })));
const Words = lazy(() => import('./pages/Words').then((m) => ({ default: m.Words })));
const WordSet = lazy(() => import('./pages/WordSet').then((m) => ({ default: m.WordSet })));
const Rankings = lazy(() => import('./pages/Rankings').then((m) => ({ default: m.Rankings })));
// Game ranks, leagues and badges: the badge collection and the season.
const BadgesPage = lazy(() => import('./badges/BadgesPage').then((m) => ({ default: m.BadgesPage })));
// The learner's tree: planted once, watered with what lessons earn.
const TreePage = lazy(() => import('./tree/TreePage').then((m) => ({ default: m.TreePage })));
const SeasonPage = lazy(() => import('./ranks/SeasonPage').then((m) => ({ default: m.SeasonPage })));
const RanksPage = lazy(() => import('./ranks/RanksPage').then((m) => ({ default: m.RanksPage })));
// The events running now, with their quests and rewards.
const EventsPage = lazy(() => import('./events/EventsPage').then((m) => ({ default: m.EventsPage })));
const Friends = lazy(() => import('./pages/Friends').then((m) => ({ default: m.Friends })));
const Search = lazy(() => import('./pages/Search').then((m) => ({ default: m.Search })));
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })));
const ProfileEdit = lazy(() => import('./pages/ProfileEdit').then((m) => ({ default: m.ProfileEdit })));
const UserProfile = lazy(() => import('./pages/UserProfile').then((m) => ({ default: m.UserProfile })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Messages = lazy(() => import('./pages/Messages').then((m) => ({ default: m.Messages })));
const LettersPage = lazy(() => import('./letters/LettersPage').then((m) => ({ default: m.LettersPage })));
const LetterThreadPage = lazy(() => import('./letters/LetterThreadPage').then((m) => ({ default: m.LetterThreadPage })));
const Shop = lazy(() => import('./pages/Shop').then((m) => ({ default: m.Shop })));
const About = lazy(() => import('./pages/About').then((m) => ({ default: m.About })));
const CopyrightPage = lazy(() => import('./copyright/CopyrightPage').then((m) => ({ default: m.CopyrightPage })));
const Privacy = lazy(() => import('./pages/Privacy').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('./pages/Terms').then((m) => ({ default: m.Terms })));
const Faq = lazy(() => import('./pages/Faq').then((m) => ({ default: m.Faq })));
const HowHevaloTeaches = lazy(() =>
  import('./pages/HowHevaloTeaches').then((m) => ({ default: m.HowHevaloTeaches })),
);
// Reports and account standing (reports/): the two Settings pages, the suspension screen, and a one-time warning.
const MyReports = lazy(() => import('./reports/MyReports').then((m) => ({ default: m.MyReports })));
const AccountStanding = lazy(() => import('./reports/AccountStanding').then((m) => ({ default: m.AccountStanding })));
import { SuspensionGate } from './reports/SuspensionGate';
// The screen shown in place of the app while Hevalo is taken offline from the admin console.
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

/** Keeps signed-in users out of the sign-in and sign-up pages, except for the moment the page holds to see them in (auth/arrival). */
function RedirectIfAuthed({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { status } = useAuth();
  if (status === 'signedIn' && !arrivalHeld()) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

/** Home is the community wall, for everyone. */
function CivakMoved(): React.JSX.Element {
  // The old address keeps working with its filter: /app/stories and /app/poems redirect through here with ?section= and ?kind=.
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/app', search }} replace />;
}

/** The word game's addresses from before it was called Peyvok, keeping a battle invite's `?id=`. */
function PeyvokMoved({ to }: { to: string }): React.JSX.Element {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace />;
}

/**
 * The stories' old addresses from when they were a game; the list and stories now live under Learn's Stories group, with
 * an invite's `?id=` and a story's slug kept. Story games stay at `games/stories/play/:gameId`.
 */
function StoriesMoved(): React.JSX.Element {
  const { search } = useLocation();
  const { slug } = useParams();
  return <Navigate to={{ pathname: slug ? `/app/learn/stories/${encodeURIComponent(slug)}` : '/app/learn/stories', search }} replace />;
}

/** The old game addresses of Build a Sentence and Hear It, Find It, now lesson practice under Learn; a round's `?…` is kept. */
function ExerciseMoved({ to }: { to: string }): React.JSX.Element {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace />;
}

/** Paths of retired games under /app (lobbies were the page plus `?id=`), including the bare addresses some had. */
const RETIRED_GAME_PATHS = ['games/dont-say', 'games/bluff', 'games/village', 'games/kingdom', 'village', 'kingdom', 'games/what-would-you-say'] as const;

/** Every address the site answers and what it draws, as its own component so the table (redirects especially) can be tested. */
export function AppRoutes(): React.JSX.Element {
  return (
    <Routes>
      {/* The landing page, pages about Hevalo, and old public addresses that now live in the app. */}
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/about" element={<About />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        {/* Copyright notices from anyone, and counter-notices. */}
        <Route path="/copyright" element={<CopyrightPage />} />
        <Route path="/faq" element={<Faq />} />
        {/* What the lessons are built on, with the studies; see teaching/principles.ts. */}
        <Route path="/how-hevalo-teaches" element={<HowHevaloTeaches />} />
        {/* A game's invite link: what it is and the way in (shared join-link.ts). */}
        <Route path="/join/:game/:code" element={<InvitePage />} />
        {/* A shared win: the postcard its link was drawn with, and the way in (shared win-link.ts). */}
        <Route path="/win/:kind" element={<WinPage />} />
        <Route path="/win/:kind/:detail" element={<WinPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="/stories" element={<Navigate to="/app/civak?section=gotin&kind=cirok" replace />} />
      <Route path="/poems" element={<Navigate to="/app/civak?section=gotin&kind=helbest" replace />} />
      <Route path="/games" element={<Navigate to="/app/games" replace />} />

      {/* Authentication. */}
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
        {/* Where the emailed reset link lands (token in the query). */}
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* Signed in but unverified: the only page reachable until confirmed. */}
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
        * A lesson and a review alone on the screen, without navigation, social column or invite banner
        * (layouts/FocusLayout.tsx); the learner leaves by the lesson's ✕. A new account's first lesson
        * (pages/NextLesson.tsx) is here too, so its frame does not jump as the lesson opens.
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
        {/* A test that jumps ahead to a later chapter, from the offer on the path (learn/JumpTest.tsx). */}
        <Route path="learn/jump/:courseId/:unitId" element={<RequireAccount what="gate.what.course"><JumpTest /></RequireAccount>} />
      </Route>

      {/* The app, open to read; pages about you or reaching others ask for an account themselves. */}
      <Route
        path="/app"
        element={
          <AppGate>
            <AppLayout />
          </AppGate>
        }
      >
        <Route index element={<Civak />} />
        {/* Learn's Lessons group; a visitor gets the alphabet, dictionary and games and is asked for an account where courses would be (pages/Learn.tsx). */}
        <Route path="learn" element={<Learn />} />
        {/* Learn's Stories group, open to everyone; bookmarks, a kept place and the check ask for an account themselves. */}
        <Route path="learn/stories" element={<StoriesLibrary />} />
        <Route path="learn/stories/:slug" element={<StoryReader />} />
        {/* Riddles and proverbs, open to everyone; the proverbs round is a solo game, so it needs an account. */}
        <Route path="learn/riddles" element={<RiddlesList />} />
        <Route path="learn/riddles/:slug" element={<RiddlePage />} />
        <Route path="learn/riddles/:slug/answer" element={<RiddleAnswerPage />} />
        <Route path="learn/proverbs" element={<ProverbsList />} />
        <Route path="learn/proverbs/play" element={<RequireAccount what="gate.what.play"><ProverbRound /></RequireAccount>} />
        <Route path="learn/proverbs/:slug" element={<ProverbPage />} />
        {/* A course's map; the lesson, review and first lesson are above, on a screen of their own. */}
        <Route path="learn/course/:courseId" element={<RequireAccount what="gate.what.course"><CourseMap /></RequireAccount>} />
        <Route path="dictionary" element={<RequireAccount what="gate.what.course"><Dictionary /></RequireAccount>} />
        {/* The first thing a beginner needs, open to everyone; see pages/Alphabet.tsx. */}
        <Route path="alphabet" element={<Alphabet />} />
        {/* The words after the letters (colours, numbers, days, months), open to everyone (pages/Words.tsx, WordSet.tsx). */}
        {/* Every kind of practice, each a session of the review player (practice/PracticeHub.tsx). */}
        <Route path="learn/practice" element={<RequireAccount what="gate.what.course"><PracticeHub /></RequireAccount>} />
        {/* The two lesson exercises that were games: rounds checked against the learner, so they need an account; their old addresses lead here. */}
        <Route path="learn/practice/build-sentence" element={<RequireAccount what="gate.what.course"><BuildSentence /></RequireAccount>} />
        <Route path="learn/practice/hear-it" element={<RequireAccount what="gate.what.course"><HearIt /></RequireAccount>} />
        <Route path="games/build-sentence" element={<ExerciseMoved to="/app/learn/practice/build-sentence" />} />
        <Route path="games/hear-it" element={<ExerciseMoved to="/app/learn/practice/hear-it" />} />
        <Route path="learn/words" element={<Words />} />
        <Route path="learn/words/:set" element={<WordSet />} />
        {/* One route for both kinds; a post knows which it is. */}
        <Route path="library/:id" element={<LibraryPostPage />} />
        <Route path="civak" element={<CivakMoved />} />
        <Route path="saved" element={<RequireAccount what="gate.what.savePosts"><Saved /></RequireAccount>} />
        {/* The three old walls point at the one that replaced them, each on its own filter. */}
        <Route path="stories" element={<Navigate to="/app/civak?section=gotin&kind=cirok" replace />} />
        <Route path="poems" element={<Navigate to="/app/civak?section=gotin&kind=helbest" replace />} />
        <Route path="dimen" element={<Navigate to="/app/civak?section=dimen" replace />} />
        <Route path="dimen/:id" element={<DimenPost />} />
        {/* Learn's Games group, at the games' usual address. */}
        <Route path="games" element={<Games />} />
        {/* The phone's old names for two places, so shared links still land. */}
        <Route path="play" element={<Navigate to="/app/games" replace />} />
        <Route path="inbox" element={<Navigate to="/app/messages" replace />} />
        {/* Solo games need an account too, since the server scores every round against the player (api/src/game). */}
        <Route path="games/peyvok" element={<RequireAccount what="gate.what.play"><Wordle /></RequireAccount>} />
        <Route path="games/wordle" element={<PeyvokMoved to="/app/games/peyvok" />} />
        <Route path="games/rhyme" element={<RequireAccount what="gate.what.play"><Rhyme /></RequireAccount>} />
        <Route path="games/race" element={<RequireAccount what="gate.what.play"><Race /></RequireAccount>} />
        {/* The learning games, each a round made and scored by the server. */}
        <Route path="games/memory-thief" element={<RequireAccount what="gate.what.play"><MemoryThief /></RequireAccount>} />
        <Route path="games/detective" element={<RequireAccount what="gate.what.play"><Detective /></RequireAccount>} />
        {/* Both old story addresses lead to Learn's Stories group (an invite's `?id=` and a slug kept); story games stay here and need an account. */}
        <Route path="games/quiz" element={<Navigate to="/app/learn/stories" replace />} />
        <Route path="games/stories" element={<StoriesMoved />} />
        <Route path="games/stories/:slug" element={<StoriesMoved />} />
        <Route
          path="games/stories/play/:gameId"
          element={<RequireAccount what="gate.what.play"><StoryGame /></RequireAccount>}
        />
        {/* The two games played against other people. */}
        <Route
          path="games/peyvok-battle"
          element={<RequireAccount what="gate.what.playOthers"><WordleBattle /></RequireAccount>}
        />
        <Route path="games/wordle-battle" element={<PeyvokMoved to="/app/games/peyvok-battle" />} />
        <Route
          path="games/rhyme-match"
          element={<RequireAccount what="gate.what.playOthers"><RhymeMatch /></RequireAccount>}
        />
        {/* The multiplayer learning games, with friends or against Hevalo. */}
        <Route
          path="games/last-letter"
          element={<RequireAccount what="gate.what.playOthers"><LastLetter /></RequireAccount>}
        />
        <Route
          path="games/impostor"
          element={<RequireAccount what="gate.what.playOthers"><Impostor /></RequireAccount>}
        />
        {/* Links, bookmarks and invitations to retired games land on the games page rather than "page not found". */}
        {RETIRED_GAME_PATHS.map((path) => (
          <Route key={path} path={path} element={<Navigate to="/app/games" replace />} />
        ))}
        {/* Who Am I?: a solo round, or a race with friends. */}
        <Route path="games/who-am-i" element={<RequireAccount what="gate.what.play"><WhoAmI /></RequireAccount>} />
        <Route path="rankings" element={<Rankings />} />
        <Route path="leagues" element={<Navigate to="/app/rankings" replace />} />
        <Route path="badges" element={<RequireAccount what="gate.what.profile"><BadgesPage /></RequireAccount>} />
        <Route path="tree" element={<RequireAccount what="gate.what.profile"><TreePage /></RequireAccount>} />
        {/* The events running now and their quests, reached from Learn while one runs (events/EventsPage.tsx). */}
        <Route path="events" element={<RequireAccount what="gate.what.play"><EventsPage /></RequireAccount>} />
        <Route path="season" element={<RequireAccount what="gate.what.play"><SeasonPage /></RequireAccount>} />
        <Route path="ranks" element={<RequireAccount what="gate.what.play"><RanksPage /></RequireAccount>} />
        <Route path="ranks/:game" element={<RequireAccount what="gate.what.play"><RanksPage /></RequireAccount>} />
        {/* People and words from one field, open to everyone; a visitor sees what each half needs (pages/Search.tsx). */}
        <Route path="search" element={<Search />} />
        <Route path="friends" element={<RequireAccount what="gate.what.addFriends"><Friends /></RequireAccount>} />
        <Route path="messages" element={<RequireAccount what="gate.what.sendMessages"><Messages /></RequireAccount>} />
        {/* Letters by bird: pen pals met by sending a bird out (letters/LettersPage.tsx). */}
        <Route path="letters" element={<RequireAccount what="gate.what.sendMessages"><LettersPage /></RequireAccount>} />
        <Route path="letters/:threadId" element={<RequireAccount what="gate.what.sendMessages"><LetterThreadPage /></RequireAccount>} />
        <Route path="shop" element={<RequireAccount what="gate.what.buy"><Shop /></RequireAccount>} />
        <Route path="profile" element={<RequireAccount what="gate.what.profile"><Profile /></RequireAccount>} />
        <Route
          path="profile/edit"
          element={<RequireAccount what="gate.what.profile"><ProfileEdit /></RequireAccount>}
        />
        <Route path="users/:id" element={<UserProfile />} />
        <Route path="settings" element={<RequireAccount what="gate.what.settings"><Settings /></RequireAccount>} />
        {/* A settings page of its own (pages/Settings.tsx); reports and standing below are separate pages too. */}
        <Route path="settings/:page" element={<RequireAccount what="gate.what.settings"><Settings /></RequireAccount>} />
        <Route path="settings/reports" element={<RequireAccount what="gate.what.settings"><MyReports /></RequireAccount>} />
        <Route path="settings/standing" element={<RequireAccount what="gate.what.settings"><AccountStanding /></RequireAccount>} />
      </Route>
    </Routes>
  );
}

/**
 * Language is outermost, above auth, so even auth's own messages (a refused login) can be translated. I18nProvider reads
 * only the device and browser; `AccountLocale` applies the account's choice once there is one.
 */
export function App(): React.JSX.Element {
  return (
    <I18nProvider>
    <AuthProvider>
      {/* Inside both: it reads the signed-in account and sets the language. */}
      <AccountLocale />
      <RealtimeProvider>
      <CarriedRouter>
        <ProfileModalProvider>
        {/* Inside the router: it reads the URL to know which chat is open. */}
        <MessagesProvider>
        <StandingWarnings />
        {/* "Rojda sent you a gift — Open", anywhere in the app. */}
        <GiftArrivals />
        {/* A badge earned, celebrated wherever you are, after a game's own result. */}
        <BadgeCelebrations />
        {/* Outermost: while Hevalo is offline nothing below can load, a suspension's reasons included. */}
        <MaintenanceGate>
        <SuspensionGate>
        {/* The social column's data and game invites, held once for every shell, so moving between a lesson and the app keeps the bar's counts. */}
        <RailProvider>
        <PlayProvider>
        <AppRoutes />
        </PlayProvider>
        </RailProvider>
        </SuspensionGate>
        </MaintenanceGate>
        </MessagesProvider>
        </ProfileModalProvider>
      </CarriedRouter>
      </RealtimeProvider>
    </AuthProvider>
    </I18nProvider>
  );
}
