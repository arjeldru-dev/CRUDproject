import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * Auth layout — Soft geometry centered layout.
 * Used as wrapper for Login & Register pages.
 */
const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative transition-colors duration-300 selection:bg-primary selection:text-white font-sans">
      <div className="w-full max-w-lg relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-10 animate-slideDownIn">
          <h1 className="text-fluid-h2 font-display font-semibold text-foreground tracking-tight mb-3">
            Hybrid Ledger
          </h1>
          <p className="text-muted text-base font-medium">
            Smart budgeting. Seamless splitting.
          </p>
        </div>

        {/* Form Container */}
        <div className="bg-surface border border-border-subtle rounded-2xl p-10 shadow-sm animate-scaleIn">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
