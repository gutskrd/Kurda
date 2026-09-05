import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { MarketingLayout } from './layouts/MarketingLayout';
import { AppLayout } from './layouts/AppLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Landing } from './pages/Landing';
import { Stories, Poems } from './pages/Library';
import { LibraryPostPage } from './pages/LibraryPostPage';
import { Games } from './pages/Games';
import { Wordle } from './pages/Wordle';
import { Rhyme } from './pages/Rhyme';
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

export function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <RealtimeProvider>
      <BrowserRouter>
        <ProfileModalProvider>
        {/* inside the router: it reads the URL to know which chat is open */}
        <MessagesProvider>
        <Routes>
          {/* public marketing site */}
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/stories" element={<Stories />} />
            <Route path="/poems" element={<Poems />} />
            <Route path="/games" element={<Games />} />
            <Route path="*" element={<NotFound />} />
          </Route>

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

          {/* signed-in app */}
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Home />} />
            <Route path="learn" element={<Learn />} />
            <Route path="stories" element={<Stories />} />
            <Route path="poems" element={<Poems />} />
            {/* one route for both kinds: a post knows which it is */}
            <Route path="library/:id" element={<LibraryPostPage />} />
            <Route path="games" element={<Games />} />
            <Route path="games/wordle" element={<Wordle />} />
            <Route path="games/rhyme" element={<Rhyme />} />
            <Route path="games/quiz" element={<Quiz />} />
            <Route path="games/wordle-battle" element={<WordleBattle />} />
            <Route path="games/rhyme-match" element={<RhymeMatch />} />
            <Route path="rankings" element={<Rankings />} />
            <Route path="friends" element={<Friends />} />
            <Route path="messages" element={<Messages />} />
            <Route path="shop" element={<Shop />} />
            <Route path="profile" element={<Profile />} />
            <Route path="profile/edit" element={<ProfileEdit />} />
            <Route path="users/:id" element={<UserProfile />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
        </MessagesProvider>
        </ProfileModalProvider>
      </BrowserRouter>
      </RealtimeProvider>
    </AuthProvider>
  );
}
