import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthLayout from './components/layout/AuthLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import DashboardLayout from './components/layout/DashboardLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Friends from './pages/Friends';
import Categories from './pages/Categories';
import Transactions from './pages/Transactions';
import { ThemeInitializer } from './components/ThemeInitializer';

/**
 * Root application component — defines all routes.
 * Auth pages use AuthLayout; protected pages use DashboardLayout.
 */
function App() {
  return (
    <BrowserRouter>
      <ThemeInitializer />
      <Routes>
        {/* Public auth routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/transactions" element={<Transactions />} />
          </Route>
        </Route>

        {/* Catch-all: redirect to dashboard (ProtectedRoute handles auth check) */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
