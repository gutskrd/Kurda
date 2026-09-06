import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
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
import { Home } from './pages/Home';
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

/** Keep signed-in users out of the sign-in / sign-up pages. */
function RedirectIfAuthed({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { status } = useAuth();
  if (status === 'signedIn') return <Navigate to="/app" replace />;
  return <>{children}</>;
}

/**
 * What /app opens to.
 *
 * Home greets you by name and offers your daily Zêr, which is nothing to a
 * signed-out reader — they get the wall instead, which is what they came for.
 */
function AppHome(): React.JSX.Element {
  const { status } = useAuth();
  if (status === 'signedOut') return <Navigate to="/app/civak" replace />;
  return <Home />;
}

export function App(): React.JSX.Element {
  return (
    <AuthProvider>
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
            <Route index element={<AppHome />} />
            <Route path="learn" element={<RequireAccount what="follow the course"><Learn /></RequireAccount>} />
            {/* one route for both kinds: a post knows which it is */}
            <Route path="library/:id" element={<LibraryPostPage />} />
            <Route path="civak" element={<Civak />} />
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
    </AuthProvider>
  );
}
