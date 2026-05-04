import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * Auth layout — centered glassmorphism card with gradient background.
 * Used as wrapper for Login & Register pages.
 */
const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4 relative overflow-hidden">
      {/* Ambient gradient blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-purple-600/20 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Hybrid Ledger
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Smart budgeting meets expense splitting
          </p>
        </div>

        {/* Glassmorphism Card */}
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl shadow-black/30">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
