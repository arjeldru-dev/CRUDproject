import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthLayout from './components/layout/AuthLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import DashboardLayout from './components/layout/DashboardLayout';
import SettingsLayout from './components/layout/SettingsLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Categories from './pages/Categories';
import Transactions from './pages/Transactions';
import ProfileSettings from './pages/ProfileSettings';
import Feed from './pages/Feed';
import Notifications from './pages/Notifications';
import NotFound from './pages/NotFound';
import { ThemeInitializer } from './components/ThemeInitializer';

// Lazy load secondary pages to enable code splitting
const Challenges = lazy(() => import('./pages/Challenges'));
const Friends = lazy(() => import('./pages/Friends'));
const PrivacySettings = lazy(() => import('./pages/PrivacySettings'));
const PublicProfile = lazy(() => import('./pages/PublicProfile'));

// Premium loading visual for lazy route transitions
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
  </div>
);

/**
 * Root application component — defines all routes.
 * Auth pages use AuthLayout; protected pages use DashboardLayout.
 */
function App() {
  return (
    <BrowserRouter>
      <ThemeInitializer />
      <Routes>
        {/* Redirect root path to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Public auth routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/feed" element={<Feed />} />
            <Route
              path="/friends"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Friends />
                </Suspense>
              }
            />
            <Route path="/categories" element={<Categories />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route
              path="/challenges"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Challenges />
                </Suspense>
              }
            />
            <Route element={<SettingsLayout />}>
              <Route path="/settings/profile" element={<ProfileSettings />} />
              <Route
                path="/settings/privacy"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <PrivacySettings />
                  </Suspense>
                }
              />
            </Route>
            <Route
              path="/profile/:username"
              element={
                <Suspense fallback={<PageLoader />}>
                  <PublicProfile />
                </Suspense>
              }
            />
            <Route path="/notifications" element={<Notifications />} />
          </Route>
        </Route>

        {/* Catch-all route for unmatched paths */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
