import React from 'react';
import { Outlet } from 'react-router-dom';
import { CheckCircle } from '@phosphor-icons/react';

/**
 * Auth layout — Clean split-screen layout for authentication pages.
 * Left: Contrasting brand panel using the secondary brand color (Desktop only).
 * Right: Main form canvas for Login/Register.
 */
const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-[100dvh] w-full flex flex-col lg:flex-row bg-background text-foreground transition-colors duration-200 font-sans">
      
      {/* ── Desktop Left Panel: Editorial Branding (Hidden on Mobile) ── */}
      {/* Uses the vibrant primary brand color (sky-cyan) with contrasting deep text and white border */}
      <section className="hidden lg:flex w-1/2 relative bg-primary border-r border-border items-center justify-center overflow-hidden">
        
        {/* Brand Content - Styled with a high-contrast deep text color for readability on the background */}
        <div className="relative z-10 flex flex-col items-start max-w-sm px-12 animate-slideUpIn text-indigo-950">
          {/* Monogram badge - white background with primary icon color for perfect emblem visibility */}
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white text-primary mb-8 border border-white/20 shadow-sm">
            <span className="font-display text-3xl font-extrabold tracking-tighter select-none">
              BB
            </span>
          </div>

          <h1 className="font-display text-4xl font-extrabold tracking-tight mb-3">
            BudgetBarkada
          </h1>
          <p className="font-sans text-base text-indigo-950/80 leading-relaxed font-medium">
            Smart budgeting with easy expense splitting. Track spending, manage budgets, and settle debts with friends.
          </p>

          {/* Feature list using Phosphor icons styled to match the dark-on-light theme */}
          <div className="mt-10 space-y-4 text-indigo-950/85 text-sm font-semibold">
            <div className="flex items-center gap-3">
              <CheckCircle size={20} className="text-indigo-950 shrink-0" weight="fill" />
              <span>Track personal & shared budgets</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle size={20} className="text-indigo-950 shrink-0" weight="fill" />
              <span>Split expenses with your barkada</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle size={20} className="text-indigo-950 shrink-0" weight="fill" />
              <span>AI-powered spending insights</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 left-12 z-10 flex gap-4 text-xs text-indigo-950/60 font-semibold">
          <a 
            href="/privacy" 
            className="hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-4 rounded"
          >
            Privacy Policy
          </a>
          <span>•</span>
          <a 
            href="/terms" 
            className="hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-4 rounded"
          >
            Terms of Service
          </a>
        </div>
      </section>

      {/* ── Form Canvas & Mobile Branding Header ── */}
      <main className="page-container lg:max-w-none lg:mx-0 lg:px-0 flex-grow flex flex-col items-center justify-center py-12 lg:py-0 bg-background relative">
        
        {/* Compact Mobile Branding (Fixed top on mobile, matches vibrant split Sky brand background of desktop) */}
        <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-primary mobile-auth-header page-container flex items-center gap-3 w-full shadow-md text-indigo-950 border-b border-white/10">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white text-primary shadow-sm border border-white/20 shrink-0">
            <span className="font-display text-base font-extrabold tracking-tighter select-none">
              BB
            </span>
          </div>
          <div className="flex flex-col items-start text-left">
            <h1 className="font-display text-base font-extrabold tracking-tight leading-none">
              BudgetBarkada
            </h1>
            <p className="font-sans text-[10px] text-indigo-950/75 font-semibold mt-1 leading-none">
              Smart budgeting. Simple splitting.
            </p>
          </div>
        </div>

        {/* Active Auth Page Content - offset by pt-24 on mobile to prevent fixed header overlap */}
        <div className="w-full max-w-[440px] lg:max-w-[500px] animate-fadeIn pt-24 pb-8 lg:pt-0 lg:pb-0">
          <Outlet />
        </div>

        {/* Compact Mobile Legal Links (Hidden on Desktop) */}
        <div className="lg:hidden flex gap-4 text-xs text-muted/50 mt-8 pb-safe">
          <a 
            href="#" 
            className="hover:text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 rounded"
          >
            Privacy Policy
          </a>
          <span>•</span>
          <a 
            href="#" 
            className="hover:text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 rounded"
          >
            Terms of Service
          </a>
        </div>
      </main>
      
    </div>
  );
};

export default AuthLayout;
