import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, LayoutDashboard, Users, Wallet, Receipt, Sun, Moon, Edit3, User } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useUiStore } from '../../store/uiStore';
import TransactionForm from '../TransactionForm';
import Avatar from '../ui/Avatar';

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
  const { isTransactionFormOpen, closeTransactionForm, notifyTransactionComplete } = useUiStore();
  const navigate = useNavigate();

  // ── Avatar Dropdown ─────────────────────────────────────────────
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const handleThemeToggle = () => {
    toggleTheme();
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const avatarName = user?.displayName || user?.email || 'User';

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

              <button
                onClick={handleThemeToggle}
                className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface transition-all duration-200 cursor-pointer"
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              >
                {theme === 'light'
                  ? <Moon key="light" className="w-5 h-5 animate-fadeInFast" />
                  : <Sun  key="dark"  className="w-5 h-5 animate-fadeInFast" />}
              </button>

              {/* Avatar Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowDropdown((v) => !v)}
                  className="flex items-center gap-2 p-1 rounded-xl hover:bg-surface transition-all duration-200 cursor-pointer"
                  id="avatar-dropdown-trigger"
                  aria-label="Profile menu"
                >
                  <Avatar
                    src={user?.avatarUrl}
                    name={avatarName}
                    size="sm"
                  />
                  <span className="text-sm font-medium text-muted hidden lg:block pr-1 max-w-[140px] truncate">
                    {user?.displayName || user?.email}
                  </span>
                </button>

                {/* Dropdown Menu */}
                {showDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border-subtle rounded-xl shadow-lg overflow-hidden animate-scaleIn z-50">
                    {/* User Info */}
                    <div className="px-4 py-3 border-b border-border-subtle">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {user?.displayName || user?.email}
                      </p>
                      {user?.username && (
                        <p className="text-xs text-muted truncate">@{user.username}</p>
                      )}
                    </div>

                    {/* Menu Items */}
                    <div className="p-1.5">
                      <button
                        onClick={() => {
                          setShowDropdown(false);
                          navigate('/settings/profile');
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-foreground font-medium rounded-lg hover:bg-surface-hover transition-colors cursor-pointer"
                        id="dropdown-edit-profile"
                      >
                        <Edit3 className="w-4 h-4 text-muted" />
                        Edit Profile
                      </button>

                      {user?.username && (
                        <button
                          onClick={() => {
                            setShowDropdown(false);
                            navigate(`/profile/${user.username}`);
                          }}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-foreground font-medium rounded-lg hover:bg-surface-hover transition-colors cursor-pointer"
                          id="dropdown-view-profile"
                        >
                          <User className="w-4 h-4 text-muted" />
                          View Profile
                        </button>
                      )}
                    </div>

                    {/* Logout */}
                    <div className="p-1.5 border-t border-border-subtle">
                      <button
                        onClick={() => {
                          setShowDropdown(false);
                          handleLogout();
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-error font-medium rounded-lg hover:bg-error/5 transition-colors cursor-pointer"
                        id="dropdown-logout"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
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
