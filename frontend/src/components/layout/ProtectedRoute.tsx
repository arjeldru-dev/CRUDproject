import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

/**
 * Route guard — redirects unauthenticated users to /login.
 * Wrap protected <Route> elements with this component.
 */
const ProtectedRoute: React.FC = () => {
  const { user, token } = useAuthStore();
  const isAuthenticated = token !== null && user !== null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
