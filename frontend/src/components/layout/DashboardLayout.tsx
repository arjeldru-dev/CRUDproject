import React, { useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, LayoutDashboard, Users, Wallet, Receipt, Sun, Moon, Plus } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useUiStore } from '../../store/uiStore';
import TransactionForm from '../TransactionForm';

/** Navigation items rendered in the top bar. */
const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/categories', label: 'Budget', icon: Wallet },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
];

/**
 * Dashboard shell — Soft Geometry navigation with floating bar.
 */
const DashboardLayout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const { isTransactionFormOpen, openTransactionForm, closeTransactionForm, notifyTransactionComplete } = useUiStore();
  const navigate = useNavigate();
  const iconKeyRef = useRef(0);

  const handleThemeToggle = () => {
    iconKeyRef.current += 1;
    toggleTheme();
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 font-sans">
      {/* Top Navigation Bar — floating with backdrop blur */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border-subtle transition-colors duration-300">
        <div className="w-full px-6 sm:px-10 lg:px-16 xl:px-20">
          <div className="flex items-center justify-between h-[72px]">
            {/* Brand + Nav Links */}
            <div className="flex items-center gap-6 h-full">
              {/* Brand */}
              <span className="font-display font-semibold text-xl tracking-tight text-foreground">
                Hybrid Ledger
              </span>

              {/* Page Navigation */}
              <div className="hidden sm:flex items-center gap-1 h-full">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    id={`nav-${item.label.toLowerCase()}`}
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-4 py-2.5 text-[0.9rem] font-medium rounded-lg transition-all duration-200 ${
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted hover:text-foreground hover:bg-surface'
                      }`
                    }
                  >
                    <item.icon className="w-[18px] h-[18px]" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>

            {/* User Info + Actions */}
            <div className="flex items-center gap-3">
              {/* Desktop Quick Action */}
              <button
                onClick={openTransactionForm}
                className="hidden sm:flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-white font-semibold rounded-xl text-[0.9rem] hover:bg-primary/90 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New</span>
              </button>

              <button
                onClick={handleThemeToggle}
                className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface transition-all duration-200 cursor-pointer"
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              >
                {theme === 'light'
                  ? <Moon key={iconKeyRef.current} className="w-5 h-5 animate-fadeInFast" />
                  : <Sun  key={iconKeyRef.current} className="w-5 h-5 animate-fadeInFast" />}
              </button>

              <span className="text-sm font-medium text-muted hidden lg:block px-2">
                {user?.email}
              </span>

              <button
                onClick={handleLogout}
                id="logout-button"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted hover:text-error hover:bg-error/5 transition-all duration-200 cursor-pointer"
              >
                <LogOut className="w-[18px] h-[18px]" />
                <span className="hidden sm:inline text-[0.9rem] font-medium">Logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="sm:hidden flex items-center justify-between border-t border-border-subtle bg-background/90 backdrop-blur-xl">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? 'text-primary'
                    : 'text-muted hover:text-foreground'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              <span className="text-[10px]">{item.label}</span>
            </NavLink>
          ))}
          <button
            onClick={openTransactionForm}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-3 text-primary text-xs font-semibold cursor-pointer"
            aria-label="New Transaction"
          >
            <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center shadow-sm">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-[10px]">New</span>
          </button>
        </div>
      </nav>

      {/* Page Content */}
      <main className="w-full px-6 sm:px-10 lg:px-16 xl:px-20 py-8 sm:py-12 pb-28">
        <Outlet />
      </main>

      {/* Global Transaction Form */}
      <TransactionForm
        isOpen={isTransactionFormOpen}
        onClose={closeTransactionForm}
        onSuccess={notifyTransactionComplete}
      />
    </div>
  );
};

export default DashboardLayout;
