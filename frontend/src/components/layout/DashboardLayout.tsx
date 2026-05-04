import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { LogOut, LayoutDashboard, Users, Wallet } from 'lucide-react';

/** Navigation items rendered in the top bar. */
const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/categories', label: 'Budget', icon: Wallet },
];

/**
 * Dashboard shell with a top nav bar, page links, user info, and logout.
 * Renders child routes via <Outlet />.
 */
const DashboardLayout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Top Navigation Bar */}
      <nav className="sticky top-0 z-50 bg-zinc-900/80 backdrop-blur-lg border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand + Nav Links */}
            <div className="flex items-center gap-6">
              {/* Brand */}
              <div className="flex items-center gap-3">
                <LayoutDashboard className="w-5 h-5 text-indigo-400" />
                <span className="font-semibold text-lg tracking-tight">
                  Hybrid Ledger
                </span>
              </div>

              {/* Page Navigation */}
              <div className="hidden sm:flex items-center gap-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    id={`nav-${item.label.toLowerCase()}`}
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? 'bg-white/10 text-white'
                          : 'text-zinc-400 hover:text-white hover:bg-white/5'
                      }`
                    }
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>

            {/* User Info + Logout */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-zinc-400 hidden sm:block">
                {user?.email}
              </span>
              <button
                onClick={handleLogout}
                id="logout-button"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-all duration-200 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="sm:hidden flex items-center justify-around border-t border-white/5 py-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? 'text-indigo-400'
                    : 'text-zinc-500 hover:text-white'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Page Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;

