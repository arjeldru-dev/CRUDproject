import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, LayoutDashboard, Users, Wallet, Receipt, Sun, Moon, Edit3, User, Activity, Bell, Shield, Trophy } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useUiStore } from '../../store/uiStore';
import TransactionForm from '../TransactionForm';
import Avatar from '../ui/Avatar';
import { useNotificationStore } from '../../store/notificationStore';
import NotificationPanel from '../social/NotificationPanel';
import { useGamificationStore } from '../../store/gamificationStore';

/** Navigation items rendered in the top bar. */
const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/feed', label: 'Feed', icon: Activity },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/categories', label: 'Budget', icon: Wallet },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/challenges', label: 'Challenges', icon: Trophy },
];



/**
 * Dashboard shell — Clean editorial layout with max-width container.
 */
const DashboardLayout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const { isTransactionFormOpen, closeTransactionForm, notifyTransactionComplete } = useUiStore();
  const { unreadCount, startPolling, stopPolling, subscribeToPush } = useNotificationStore();
  const { profile, fetchProfile } = useGamificationStore();
  const navigate = useNavigate();

  // Fetch gamification profile to load active avatar frame on mount
  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user, fetchProfile]);

  // ── Avatar Dropdown ─────────────────────────────────────────────
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Notification Dropdown ───────────────────────────────────────
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape key press
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDropdown(false);
        setShowNotifications(false);
      }
    };

    if (showDropdown || showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showDropdown, showNotifications]);

  // ── Notification Polling ─────────────────────────────────────────
  useEffect(() => {
    startPolling();
    // Attempt push subscription (silent if unsupported)
    subscribeToPush();
    return () => stopPolling();
  }, [startPolling, stopPolling, subscribeToPush]);

  const handleThemeToggle = () => {
    toggleTheme();
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const avatarName = user?.displayName || user?.email || 'User';

  return (
    <div className="min-h-[100dvh] bg-background text-foreground transition-colors duration-200 font-sans">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <nav className="sticky top-0 z-50 bg-nav-bg text-white dark:text-slate-900 border-b border-primary-hover/20 transition-colors duration-200">
        <div className="page-container">
          <div className="flex justify-between sm:grid items-center h-16" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
            {/* Brand (Left) */}
            <div className="flex items-center justify-start gap-2.5 h-full">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white text-primary shadow-sm border border-white/10 shrink-0">
                <span className="font-display text-lg font-extrabold tracking-tighter select-none">
                  BB
                </span>
              </div>
              <span className="font-display font-black text-sm tracking-tight text-white dark:text-slate-900">
                BudgetBarkada
              </span>
            </div>

            {/* Desktop Navigation (Center) */}
            <div className="hidden sm:flex items-center justify-center gap-1 h-full">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  id={`nav-${item.label.toLowerCase()}`}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg transition-colors duration-150 ${
                      isActive
                        ? 'bg-white/20 text-white dark:bg-slate-950/15 dark:text-slate-900 shadow-sm'
                        : 'text-white/75 hover:text-white hover:bg-white/10 dark:text-slate-900/75 dark:hover:text-slate-900 dark:hover:bg-slate-950/10'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>

            {/* Actions (Right) */}
            <div className="flex items-center justify-end gap-1.5">

              {/* Theme Toggle - Upscaled to 44px touch target */}
              <button
                onClick={handleThemeToggle}
                className="w-11 h-11 flex items-center justify-center rounded-lg text-white/75 hover:text-white hover:bg-white/10 dark:text-slate-900/75 dark:hover:text-slate-900 dark:hover:bg-slate-950/10 transition-colors duration-150 cursor-pointer"
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              >
                {theme === 'light'
                  ? <Moon key="light" className="w-4.5 h-4.5" aria-hidden="true" />
                  : <Sun  key="dark"  className="w-4.5 h-4.5" aria-hidden="true" />}
              </button>

              {/* Notification Bell - Upscaled to 44px touch target */}
              <div className="relative" ref={notificationRef}>
                <button
                  onClick={() => setShowNotifications((v) => !v)}
                  className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors duration-150 cursor-pointer relative ${
                    showNotifications
                      ? 'bg-white/20 text-white dark:bg-slate-950/15 dark:text-slate-900'
                      : 'text-white/75 hover:text-white hover:bg-white/10 dark:text-slate-900/75 dark:hover:text-slate-900 dark:hover:bg-slate-950/10'
                  }`}
                  aria-label="Notifications"
                  aria-expanded={showNotifications}
                  aria-haspopup="true"
                >
                  <Bell className="w-4.5 h-4.5" aria-hidden="true" />
                  {unreadCount > 0 && (
                    <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-error rounded-full ring-2 ring-nav-bg" />
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 z-50" role="region" aria-label="Notifications">
                    <NotificationPanel onClose={() => setShowNotifications(false)} />
                  </div>
                )}
              </div>

              {/* Avatar Dropdown - Height verified at >= 44px */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowDropdown((v) => !v)}
                  className="flex items-center gap-2 p-2 min-h-[44px] rounded-lg hover:bg-white/10 dark:hover:bg-slate-950/10 transition-colors duration-150 cursor-pointer"
                  id="avatar-dropdown-trigger"
                  aria-label="Profile menu"
                  aria-expanded={showDropdown}
                  aria-haspopup="true"
                >
                  <Avatar
                    src={user?.avatarUrl}
                    name={avatarName}
                    size="sm"
                    frameClass={profile?.activeFrame?.cssClass || undefined}
                  />
                  <span className="text-sm font-medium text-white/75 dark:text-slate-900/75 hidden lg:block pr-0.5 max-w-[120px] truncate">
                    {user?.displayName || user?.email}
                  </span>
                </button>

                {/* Dropdown Menu */}
                {showDropdown && (
                  <div role="menu" aria-label="Profile options" className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border rounded-lg shadow-lg overflow-hidden animate-scaleIn z-50">
                    {/* User Info */}
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {user?.displayName || user?.email}
                      </p>
                      {user?.username && (
                        <p className="text-xs text-muted truncate font-mono">@{user.username}</p>
                      )}
                    </div>

                    {/* Menu Items */}
                    <div className="p-1.5">
                      <button
                        role="menuitem"
                        onClick={() => {
                          setShowDropdown(false);
                          navigate('/settings/profile');
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-foreground font-medium rounded-md hover:bg-surface-hover transition-colors cursor-pointer"
                        id="dropdown-edit-profile"
                      >
                        <Edit3 className="w-4 h-4 text-muted" aria-hidden="true" />
                        Edit Profile
                      </button>

                      <button
                        role="menuitem"
                        onClick={() => {
                          setShowDropdown(false);
                          navigate('/settings/privacy');
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-foreground font-medium rounded-md hover:bg-surface-hover transition-colors cursor-pointer"
                        id="dropdown-privacy-settings"
                      >
                        <Shield className="w-4 h-4 text-muted" aria-hidden="true" />
                        Privacy Settings
                      </button>

                      {user?.username && (
                        <button
                          role="menuitem"
                          onClick={() => {
                            setShowDropdown(false);
                            navigate(`/profile/${user.username}`);
                          }}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-foreground font-medium rounded-md hover:bg-surface-hover transition-colors cursor-pointer"
                          id="dropdown-view-profile"
                        >
                          <User className="w-4 h-4 text-muted" aria-hidden="true" />
                          View Profile
                        </button>
                      )}
                    </div>

                    {/* Logout */}
                    <div className="p-1.5 border-t border-border">
                      <button
                        role="menuitem"
                        onClick={() => {
                          setShowDropdown(false);
                          handleLogout();
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-error font-medium rounded-md hover:bg-error/5 transition-colors cursor-pointer"
                        id="dropdown-logout"
                      >
                        <LogOut className="w-4 h-4" aria-hidden="true" />
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </nav>

      <div className="sm:hidden fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md z-50 flex items-center justify-around border border-primary-hover/20 bg-nav-bg rounded-2xl shadow-lg px-2 h-14">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 py-1 px-2 min-w-[44px] min-h-[44px] text-xs font-medium transition-colors duration-150 ${
                isActive
                  ? 'text-white dark:text-slate-900 bg-white/10 dark:bg-slate-950/10 rounded-xl'
                  : 'text-white/60 hover:text-white dark:text-slate-900/60 dark:hover:text-slate-900'
              }`
            }
          >
            <item.icon className="w-5 h-5" aria-hidden="true" />
            <span className="text-[10px] font-semibold hidden min-[360px]:inline">{item.label}</span>
          </NavLink>
        ))}
      </div>

      {/* Page Content */}
      <main id="main-content" className="page-container py-3 sm:py-4 sm:pb-20 flex flex-col items-center">
        <Outlet />
        {/* Mobile bottom nav spacer to prevent content overlap/clipping due to flexbox padding scroll bugs */}
        <div className="h-[calc(env(safe-area-inset-bottom)+5rem)] sm:hidden shrink-0 pointer-events-none" />
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
