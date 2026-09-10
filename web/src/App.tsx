import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { MarketingLayout } from './layouts/MarketingLayout';
import { AppLayout } from './layouts/AppLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppGate } from './components/AppGate';
import { RequireAccount } from './components/RequireAccount';
import { Landing } from './pages/Landing';
import { LibraryPostPage } from './pages/LibraryPostPage';
import { Civak } from './pages/Civak';
import { Saved } from './pages/Saved';
import { DimenPost } from './pages/DimenPost';
import { Games } from './pages/Games';
import { Wordle } from './pages/Wordle';
import { Rhyme } from './pages/Rhyme';
import { Race } from './pages/Race';
import { Quiz } from './pages/Quiz';
import { WordleBattle } from './pages/WordleBattle';
import { RhymeMatch } from './pages/RhymeMatch';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPassword } from './pages/ForgotPassword';
import { VerifyEmail } from './pages/VerifyEmail';
import { ResetPassword } from './pages/ResetPassword';
import { Learn } from './pages/Learn';
import { Rankings } from './pages/Rankings';
import { Friends } from './pages/Friends';
import { Profile } from './pages/Profile';
import { ProfileEdit } from './pages/ProfileEdit';
import { UserProfile } from './pages/UserProfile';
import { Settings } from './pages/Settings';
import { Messages } from './pages/Messages';
import { Shop } from './pages/Shop';
import { NotFound } from './pages/NotFound';
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

export function App(): React.JSX.Element {
  return (
    <AuthProvider>
      {/* outside the router and above everything: what language the buttons are
          in is not a property of which page you are on */}
      <I18nProvider>
      {/* inside the auth provider, because it reads the signed-in account */}
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
            <Route path="learn" element={<RequireAccount what="follow the course"><Learn /></RequireAccount>} />
            {/* one route for both kinds: a post knows which it is */}
            <Route path="library/:id" element={<LibraryPostPage />} />
            <Route path="civak" element={<CivakMoved />} />
            <Route path="saved" element={<RequireAccount what="keep posts"><Saved /></RequireAccount>} />
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
              element={<RequireAccount what="play against other people"><Quiz /></RequireAccount>}
            />
            {/* the two games played against other people */}
            <Route
              path="games/wordle-battle"
              element={<RequireAccount what="play against other people"><WordleBattle /></RequireAccount>}
            />
            <Route
              path="games/rhyme-match"
              element={<RequireAccount what="play against other people"><RhymeMatch /></RequireAccount>}
            />
            <Route path="rankings" element={<Rankings />} />
            <Route path="friends" element={<RequireAccount what="add friends"><Friends /></RequireAccount>} />
            <Route path="messages" element={<RequireAccount what="send messages"><Messages /></RequireAccount>} />
            <Route path="shop" element={<RequireAccount what="buy anything"><Shop /></RequireAccount>} />
            <Route path="profile" element={<RequireAccount what="have a profile"><Profile /></RequireAccount>} />
            <Route
              path="profile/edit"
              element={<RequireAccount what="have a profile"><ProfileEdit /></RequireAccount>}
            />
            <Route path="users/:id" element={<UserProfile />} />
            <Route path="settings" element={<RequireAccount what="change your settings"><Settings /></RequireAccount>} />
          </Route>
        </Routes>
        </MessagesProvider>
        </ProfileModalProvider>
      </BrowserRouter>
      </RealtimeProvider>
      </I18nProvider>
    </AuthProvider>
  );
}
