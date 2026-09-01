import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { MarketingLayout } from './layouts/MarketingLayout';
import { AppLayout } from './layouts/AppLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Landing } from './pages/Landing';
import { Stories, Poems } from './pages/Library';
import { Games } from './pages/Games';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPassword } from './pages/ForgotPassword';
import { Home } from './pages/Home';
import { Learn } from './pages/Learn';
import { Rankings } from './pages/Rankings';
import { Friends } from './pages/Friends';
import { Profile } from './pages/Profile';
import { ProfileEdit } from './pages/ProfileEdit';
import { Settings } from './pages/Settings';
import { Messages } from './pages/Messages';
import { Shop } from './pages/Shop';
import { NotFound } from './pages/NotFound';
import { ProfileModalProvider } from './profile/ProfileModal';

/** Keep signed-in users out of the sign-in / sign-up pages. */
function RedirectIfAuthed({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { status } = useAuth();
  if (status === 'signedIn') return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ProfileModalProvider>
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
            <Route path="rankings" element={<Rankings />} />
            <Route path="friends" element={<Friends />} />
            <Route path="messages" element={<Messages />} />
            <Route path="shop" element={<Shop />} />
            <Route path="profile" element={<Profile />} />
            <Route path="profile/edit" element={<ProfileEdit />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
        </ProfileModalProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
