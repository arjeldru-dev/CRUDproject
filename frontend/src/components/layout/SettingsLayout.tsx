import React from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { User, Shield, ArrowLeft } from 'lucide-react';

const SettingsLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { to: '/settings/profile', label: 'Edit Profile', icon: User },
    { to: '/settings/privacy', label: 'Privacy Settings', icon: Shield },
  ];

  return (
    <div className="w-full max-w-[980px] mx-auto animate-fadeInFast">
      {/* Back Button */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors group cursor-pointer p-2 -ml-2 rounded-lg hover:bg-surface-hover btn-press"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" aria-hidden="true" />
          <span className="font-sans font-semibold">Back</span>
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar / Sub-nav Navigation */}
        <aside className="w-full md:w-64 shrink-0">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-foreground tracking-tight mb-6 hidden md:block">
            Settings
          </h1>
          
          {/* Desktop Navigation List */}
          <nav className="hidden md:flex flex-col gap-1" aria-label="Settings navigation">
            {menuItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-150 btn-press ${
                    isActive
                      ? 'bg-surface text-primary shadow-sm border border-border/50'
                      : 'text-muted hover:text-foreground hover:bg-surface-hover/50 border border-transparent'
                  }`
                }
              >
                <item.icon className="w-4.5 h-4.5" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Mobile Tab Navigation */}
          <nav className="md:hidden flex bg-surface-hover/40 p-1 rounded-xl w-full border border-border-subtle/50" aria-label="Settings navigation mobile">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-2 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 btn-press min-w-0 ${
                    isActive
                      ? 'bg-surface text-primary shadow-sm border border-border/50'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default SettingsLayout;
