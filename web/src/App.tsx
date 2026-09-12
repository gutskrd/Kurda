import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { MarketingLayout } from './layouts/MarketingLayout';
import { AppLayout } from './layouts/AppLayout';
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
 * mykurda.com downloaded the photo editor, both multiplayer games, the shop
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
const Wordle = lazy(() => import('./pages/Wordle').then((m) => ({ default: m.Wordle })));
const Rhyme = lazy(() => import('./pages/Rhyme').then((m) => ({ default: m.Rhyme })));
const Race = lazy(() => import('./pages/Race').then((m) => ({ default: m.Race })));
const Quiz = lazy(() => import('./pages/Quiz').then((m) => ({ default: m.Quiz })));
const WordleBattle = lazy(() => import('./pages/WordleBattle').then((m) => ({ default: m.WordleBattle })));
const RhymeMatch = lazy(() => import('./pages/RhymeMatch').then((m) => ({ default: m.RhymeMatch })));
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Register').then((m) => ({ default: m.Register })));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword })));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail').then((m) => ({ default: m.VerifyEmail })));
const ResetPassword = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })));
const Learn = lazy(() => import('./pages/Learn').then((m) => ({ default: m.Learn })));
const Rankings = lazy(() => import('./pages/Rankings').then((m) => ({ default: m.Rankings })));
const Friends = lazy(() => import('./pages/Friends').then((m) => ({ default: m.Friends })));
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })));
const ProfileEdit = lazy(() => import('./pages/ProfileEdit').then((m) => ({ default: m.ProfileEdit })));
const UserProfile = lazy(() => import('./pages/UserProfile').then((m) => ({ default: m.UserProfile })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Messages = lazy(() => import('./pages/Messages').then((m) => ({ default: m.Messages })));
const Shop = lazy(() => import('./pages/Shop').then((m) => ({ default: m.Shop })));
import { ProfileModalProvider } from './profile/ProfileModal';
import { RealtimeProvider } from './realtime/RealtimeProvider';
import { MessagesProvider } from './chat/MessagesProvider';
import { I18nProvider } from './i18n/I18nProvider';
import { AccountLocale } from './i18n/AccountLocale';

/** Keep signed-in users out of the sign-in / sign-up pages. */
function RedirectIfAuthed({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { status } = useAuth();
  if (status === 'signedIn') return <Navigate to="/app" replace />;
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
        <Routes>
          {/* the landing page, and old public addresses that now live in the app */}
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<Landing />} />
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
            <Route path="learn" element={<RequireAccount what="gate.what.course"><Learn /></RequireAccount>} />
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
            <Route path="games" element={<Games />} />
            <Route path="games/wordle" element={<Wordle />} />
            <Route path="games/rhyme" element={<Rhyme />} />
            <Route path="games/race" element={<Race />} />
            <Route
              path="games/quiz"
              element={<RequireAccount what="gate.what.playOthers"><Quiz /></RequireAccount>}
            />
            {/* the two games played against other people */}
            <Route
              path="games/wordle-battle"
              element={<RequireAccount what="gate.what.playOthers"><WordleBattle /></RequireAccount>}
            />
            <Route
              path="games/rhyme-match"
              element={<RequireAccount what="gate.what.playOthers"><RhymeMatch /></RequireAccount>}
            />
            <Route path="rankings" element={<Rankings />} />
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
          </Route>
        </Routes>
        </MessagesProvider>
        </ProfileModalProvider>
      </BrowserRouter>
      </RealtimeProvider>
    </AuthProvider>
    </I18nProvider>
  );
}
