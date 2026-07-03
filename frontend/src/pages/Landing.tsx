import { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { 
  Handshake, 
  Trophy, 
  Sparkles,
  ArrowRight,
  Zap,
  Users,
  CheckCircle2,
  ChevronRight,
  Info
} from 'lucide-react';

// Lazy-load the heavy AppSimulator demo widget to optimize initial bundle size & LCP
const AppSimulator = lazy(() => import('../components/AppSimulator'));

export default function Landing() {
  const { user, token } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const isAuthenticated = token !== null && user !== null;

  // Mobile navigation drawer toggle
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // State for active FAQ section
  const [activeFAQ, setActiveFAQ] = useState<number | null>(null);

  // Smooth scroll helper
  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // FAQs List
  const faqList = [
    {
      q: 'Do my friends need to create an account to split?',
      a: 'For legal ledgers and audit records, yes. However, you can add mock/custom friend profiles (Friend Profiles) to track offline balances until they scan your QR code and accept your friend request.'
    },
    {
      q: 'How does the Hybrid Ledger keep balances accurate?',
      a: 'BudgetBarkada uses dual-entry bookkeeping rules on a transactional PostgreSQL DB. Every split expense logged generates balancing receivable/payable ledger lines that lock in debt states. No double-counting, no rounding discrepancies.'
    },
    {
      q: 'Can I set my shared expenses as private?',
      a: 'Absolutely. Every transaction has a Privacy Toggle. You can set it to PUBLIC (visible to friends on the feed), FRIENDS_ONLY (details restricted), or PRIVATE (hidden entirely on the feed, only visible in your ledger).'
    },
    {
      q: 'What are Avatar Frames and streaks?',
      a: 'It is a gamification layer! You earn XP by checking in daily (Streaks) and completing budget challenges (Duels). You can spend points to unlock collectible CSS frames to border your profile avatar.'
    }
  ];

  return (
    <div className="w-full bg-background text-foreground transition-colors duration-200 antialiased font-sans select-none overflow-x-hidden">
      
      {/* ─── PREMIUM GLASSMORPHIC HEADER ─── */}
      <header className="sticky top-0 z-[60] w-full border-b border-border-subtle bg-background/80 backdrop-blur-md">
        <div className="page-container h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-white shadow-sm font-display font-extrabold text-base tracking-tighter">
              BB
            </div>
            <span className="font-display font-black text-sm tracking-tight hidden sm:inline-block">
              BudgetBarkada
            </span>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-muted">
            <button onClick={() => scrollToId('why-section')} className="hover:text-foreground transition-colors cursor-pointer transition-[color] duration-200 ease-out">Why Barkada?</button>
            <button onClick={() => scrollToId('features-section')} className="hover:text-foreground transition-colors cursor-pointer transition-[color] duration-200 ease-out">Features</button>
            <button onClick={() => scrollToId('demo-section')} className="hover:text-foreground transition-colors cursor-pointer flex items-center gap-1 transition-[color] duration-200 ease-out">
              Live Demo <span className="px-1.5 py-0.5 text-[10px] bg-primary/10 text-primary rounded-full font-bold">Interactive</span>
            </button>
            <button onClick={() => scrollToId('pricing-section')} className="hover:text-foreground transition-colors cursor-pointer transition-[color] duration-200 ease-out">Pricing</button>
          </nav>

          {/* Right Action buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleTheme}
              className="w-10 h-10 flex items-center justify-center rounded-lg text-muted hover:bg-surface-hover transition-colors cursor-pointer btn-press"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              aria-label="Toggle Theme"
            >
              {theme === 'light' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m2.828 0l-.707-.707m12.728-12.728l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
              )}
            </button>

            {isAuthenticated ? (
              <button
                onClick={() => navigate('/dashboard')}
                className="hidden sm:flex items-center gap-1.5 px-4 h-10 text-sm font-bold bg-primary hover:bg-primary-hover text-white rounded-lg transition-all shadow-sm shadow-primary/10 btn-press"
              >
                Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="hidden sm:inline-block px-3.5 h-10 text-sm font-semibold text-foreground hover:bg-surface-hover rounded-lg transition-all duration-200 active:scale-95 cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  onClick={() => navigate('/register')}
                  className="hidden sm:inline-block px-4.5 h-10 text-sm font-bold bg-foreground hover:bg-foreground/90 text-background rounded-lg transition-all shadow-sm btn-press"
                >
                  Register
                </button>
              </>
            )}

            {/* Mobile hamburger menu toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg text-muted hover:bg-surface-hover transition-colors cursor-pointer btn-press"
              aria-label="Toggle Navigation Menu"
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-16 left-0 right-0 bg-surface/95 backdrop-blur-md border-b border-border p-5 flex flex-col gap-4 animate-slideDownIn z-50 shadow-lg">
            <button 
              onClick={() => { scrollToId('why-section'); setIsMobileMenuOpen(false); }} 
              className="text-left font-bold text-sm text-foreground py-2.5 border-b border-border-subtle active:bg-surface-hover transition-all duration-150 rounded-lg px-2"
            >
              Why Barkada?
            </button>
            <button 
              onClick={() => { scrollToId('features-section'); setIsMobileMenuOpen(false); }} 
              className="text-left font-bold text-sm text-foreground py-2.5 border-b border-border-subtle active:bg-surface-hover transition-all duration-150 rounded-lg px-2"
            >
              Features
            </button>
            <button 
              onClick={() => { scrollToId('demo-section'); setIsMobileMenuOpen(false); }} 
              className="text-left font-bold text-sm text-foreground py-2.5 border-b border-border-subtle flex items-center justify-between active:bg-surface-hover transition-all duration-150 rounded-lg px-2"
            >
              <span>Live Demo</span>
              <span className="px-1.5 py-0.5 text-[9px] bg-primary/10 text-primary rounded-full font-bold">Interactive</span>
            </button>
            <button 
              onClick={() => { scrollToId('pricing-section'); setIsMobileMenuOpen(false); }} 
              className="text-left font-bold text-sm text-foreground py-2.5 active:bg-surface-hover transition-all duration-150 rounded-lg px-2"
            >
              Pricing
            </button>
            <div className="divider" />
            {isAuthenticated ? (
              <button
                onClick={() => { navigate('/dashboard'); setIsMobileMenuOpen(false); }}
                className="w-full flex items-center justify-center gap-1.5 px-4 h-11 text-sm font-bold bg-primary hover:bg-primary-hover text-white rounded-xl transition-all shadow-sm btn-press"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { navigate('/login'); setIsMobileMenuOpen(false); }}
                  className="w-full h-11 text-sm font-semibold text-foreground hover:bg-surface-hover rounded-xl active:scale-98 transition-all duration-150 cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  onClick={() => { navigate('/register'); setIsMobileMenuOpen(false); }}
                  className="w-full h-11 text-sm font-bold bg-foreground hover:bg-foreground/90 text-background rounded-xl transition-all shadow-sm btn-press"
                >
                  Register
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* ─── BOLD ASYMMETRIC HERO SECTION (Simulator Integrated Above Fold) ─── */}
      <section id="demo-section" className="relative min-h-[100dvh] flex flex-col justify-center overflow-hidden py-16 lg:py-24">
        {/* Ambient background decoration */}
        <div className="absolute inset-0 z-0 pointer-events-none select-none overflow-hidden">
          <div className="absolute -top-[10%] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/10 dark:bg-primary/5 blur-[120px] rounded-full" />
          <div className="absolute -bottom-[20%] left-1/3 w-[400px] h-[200px] bg-secondary/10 dark:bg-secondary/5 blur-[90px] rounded-full" />
        </div>

        <div className="page-container relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column: Headline and CTAs */}
          <div className="lg:col-span-7 text-left space-y-8 animate-fadeInUp">
            {/* Eyebrow badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/8 text-primary border border-primary/12 text-xs font-bold tracking-wide uppercase font-mono">
              <Sparkles className="w-3.5 h-3.5" />
              Dual-Entry Ledger Engine
            </div>

            <h1 className="font-display text-5xl sm:text-7xl font-black tracking-tighter text-foreground leading-[0.95] text-wrap">
              Smart budgeting<br />
              meets <span className="text-primary">group splits</span>
            </h1>

            <p className="text-muted text-base sm:text-lg font-medium max-w-xl leading-relaxed">
              Keep track of personal monthly categories while splitting dinner bills, rent, and utilities directly with your barkada. Settle debts without awkward friction.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto px-4 sm:px-0">
              <button
                onClick={() => navigate('/register')}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 h-12 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl transition-all shadow-md shadow-primary/15 btn-press cursor-pointer"
              >
                Get Started for Free
                <ArrowRight className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          {/* Right Column: Simulator device block floating above fold */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end animate-scaleIn">
            <div className="relative group">
              {/* Micro Sandbox Tip */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-surface/95 backdrop-blur border border-border px-3.5 py-2 rounded-xl text-[11px] text-muted animate-slideDownIn shadow-sm whitespace-nowrap">
                <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>Demo sandbox is live! Tap inside the device frame.</span>
              </div>
              
              <Suspense fallback={
                <div className="w-[340px] sm:w-[370px] h-[640px] bg-surface border-[10px] border-border rounded-[48px] flex flex-col items-center justify-center text-muted text-sm font-semibold animate-pulse shadow-2xl flex-shrink-0">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <Zap className="w-5 h-5 animate-bounce" />
                    </div>
                    <span className="font-display">Loading Interactive Demo...</span>
                  </div>
                </div>
              }>
                <AppSimulator />
              </Suspense>
            </div>
          </div>

        </div>
      </section>

      {/* ─── BRAND LOGO WALL (Under Hero) ─── */}
      <section className="border-y border-border-subtle bg-surface-hover/20 py-8 relative z-10 overflow-hidden">
        <div className="page-container flex flex-col items-center justify-center">
          <p className="text-xs text-muted/60 font-bold uppercase tracking-widest mb-6 text-center">
            Perfect for tracking splits settled via your favorite channels
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4.5 select-none">
            {/* GCASH */}
            <div className="group px-4.5 py-2 rounded-xl bg-surface border border-border-subtle shadow-sm transition-all duration-200 cursor-default select-none hover:shadow hover:border-border flex items-center justify-center">
              <span className="font-display font-black text-xs sm:text-sm tracking-tight text-muted/60 group-hover:text-[#0057FF] transition-colors duration-200">
                GCASH
              </span>
            </div>

            {/* MAYA */}
            <div className="group px-4.5 py-2 rounded-xl bg-surface border border-border-subtle shadow-sm transition-all duration-200 cursor-default select-none hover:shadow hover:border-border flex items-center justify-center">
              <span className="font-display font-black text-xs sm:text-sm tracking-tight text-muted/60 group-hover:text-[#1EBF76] transition-colors duration-200">
                MAYA
              </span>
            </div>

            {/* BPI */}
            <div className="group px-4.5 py-2 rounded-xl bg-surface border border-border-subtle shadow-sm transition-all duration-200 cursor-default select-none hover:shadow hover:border-border flex items-center justify-center">
              <span className="font-display font-black text-xs sm:text-sm tracking-tight text-muted/60 group-hover:text-[#B11116] transition-colors duration-200">
                BPI
              </span>
            </div>

            {/* BDO */}
            <div className="group px-4.5 py-2 rounded-xl bg-surface border border-border-subtle shadow-sm transition-all duration-200 cursor-default select-none hover:shadow hover:border-border flex items-center justify-center">
              <span className="font-display font-black text-xs sm:text-sm tracking-tight text-muted/60 group-hover:text-[#FFB20C] transition-colors duration-200">
                BDO
              </span>
            </div>

            {/* UNIONBANK */}
            <div className="group px-4.5 py-2 rounded-xl bg-surface border border-border-subtle shadow-sm transition-all duration-200 cursor-default select-none hover:shadow hover:border-border flex items-center justify-center">
              <span className="font-display font-black text-xs sm:text-sm tracking-tight text-muted/60 group-hover:text-[#F47A20] transition-colors duration-200">
                UNIONBANK
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── WHY BUDGETBARKADA? (Asymmetric Value Prop) ─── */}
      <section id="why-section" className="py-24 relative bg-background border-b border-border-subtle">
        <div className="page-container max-w-5xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            
            {/* Left Column: Headline and Editorial Quote */}
            <div 
              className="lg:col-span-5 space-y-6 text-left animate-fadeInUp relative overflow-visible"
              style={{ animationDelay: '50ms' }}
            >
              {/* Giant background decorative peso sign */}
              <span className="text-[240px] font-black text-primary/5 select-none absolute -top-24 -left-12 pointer-events-none font-display leading-none">
                ₱
              </span>

              <span className="relative z-10 text-xs text-primary font-bold uppercase tracking-wider font-mono">The Problem & Solution</span>
              <h2 className="relative z-10 font-display text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight mt-1 leading-[1.15]">
                Why use BudgetBarkada?
              </h2>
              <p className="relative z-10 text-muted text-sm sm:text-base leading-relaxed">
                Traditional finance apps are lonely spreadsheets. Chat logs are messy tallies. BudgetBarkada combines both to make personal and shared budgeting seamless.
              </p>
              
              {/* Testimonial Quote */}
              <div className="relative z-10 p-6 bg-surface-hover/30 border border-border-subtle rounded-2xl hover:scale-[1.01] transition-transform duration-200 ease-out-emil">
                <p className="text-sm font-medium italic text-muted leading-relaxed">
                  "Our barkada went from awkward payment reminders and spreadsheet formulas to a single-click settlement after our weekend trip. It completely resolved the friction."
                </p>
                <p className="text-xs text-foreground font-bold mt-3 font-display">BudgetBarkada founders</p>
              </div>
            </div>

            {/* Right Column: Stacked Asymmetric Feature Blocks */}
            <div className="lg:col-span-7 space-y-5 text-left">
              <div 
                className="bg-surface border border-border-subtle p-7 rounded-3xl flex gap-5 shadow-sm animate-fadeInUp hover:scale-[1.015] hover:shadow-md transition-all duration-200 ease-out-emil"
                style={{ animationDelay: '100ms' }}
              >
                <div className="w-12 h-12 rounded-2xl bg-streak-muted text-streak flex items-center justify-center shrink-0">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-display text-foreground mb-1.5">
                    Traditional is Lonely
                  </h3>
                  <p className="text-muted text-sm leading-relaxed">
                    Most budgeting tools force you into siloed tracking. BudgetBarkada embraces reality: you share dinners, rent, and trips. We make tracking shared finances natural.
                  </p>
                </div>
              </div>

              <div 
                className="bg-surface border border-border-subtle p-7 rounded-3xl flex gap-5 shadow-sm animate-fadeInUp hover:scale-[1.015] hover:shadow-md transition-all duration-200 ease-out-emil"
                style={{ animationDelay: '200ms' }}
              >
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Handshake className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-display text-foreground mb-1.5">
                    Splits are Messy
                  </h3>
                  <p className="text-muted text-sm leading-relaxed">
                    No more "who owes who" calculations in paper notes or group chats. Our Hybrid Ledger settles complex debts dynamically into single balances with one click.
                  </p>
                </div>
              </div>

              <div 
                className="bg-surface border border-border-subtle p-7 rounded-3xl flex gap-5 shadow-sm animate-fadeInUp hover:scale-[1.015] hover:shadow-md transition-all duration-200 ease-out-emil"
                style={{ animationDelay: '300ms' }}
              >
                <div className="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                  <Trophy className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-display text-foreground mb-1.5">
                    Finances are Boring
                  </h3>
                  <p className="text-muted text-sm leading-relaxed">
                    Maintain budget category targets together. Team up or duel in savings challenges, keep daily streaks, earn badges, and unlock avatar frame custom borders.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ─── BENTO FEATURE GRID ─── */}
      <section id="features-section" className="py-24 border-b border-border-subtle bg-surface-hover/10">
        <div className="page-container max-w-5xl">
          <div className="text-center max-w-xl mx-auto mb-16">
            <span className="text-xs text-primary font-bold uppercase tracking-wider font-mono font-bold">Features Overview</span>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight mt-3">
              Powering financial harmony
            </h2>
            <p className="text-muted text-sm sm:text-base mt-4 leading-relaxed">
              Every detail is designed to remove the friction of money calculations and gamify collective saving.
            </p>
          </div>

          {/* Bento layout: 2 columns top, 1 column bottom */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 text-left">
            {/* Cell 1: Ledger (Column span 7) */}
            <div className="bg-surface border border-border-subtle rounded-3xl p-8 md:col-span-7 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:scale-[1.01] hover:shadow-md transition-all duration-200 ease-out-emil">
              <div className="max-w-md">
                <span className="text-xs font-bold text-primary font-mono uppercase tracking-wider">Accounting Engine</span>
                <h3 className="text-xl font-bold font-display text-foreground mt-2 mb-3.5">
                  Dual-Entry Hybrid Ledger
                </h3>
                <p className="text-muted text-sm leading-relaxed">
                  Engineered with transactional integrity. Every expense, settlement, or split creates balancing records, preventing audit discrepancies and rounding errors. Settle bills easily.
                </p>
              </div>
              <div className="mt-8 pt-6 border-t border-border-subtle flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-xs text-muted font-mono">
                  <span>Atomic transaction lock</span>
                  <span className="text-success font-bold">ACTIVE</span>
                </div>
                <div className="w-full bg-surface-hover rounded-full h-2 overflow-hidden border border-border/10">
                  <div className="bg-success w-[88%] h-full rounded-full transition-all duration-500 ease-out" />
                </div>
              </div>
            </div>

            {/* Cell 2: Gamification (Column span 5) */}
            <div className="bg-surface border border-border-subtle rounded-3xl p-8 md:col-span-5 flex flex-col justify-between shadow-sm group hover:scale-[1.01] hover:shadow-md transition-all duration-200 ease-out-emil">
              <div>
                <span className="text-xs font-bold text-streak font-mono uppercase tracking-wider">Discipline Loops</span>
                <h3 className="text-xl font-bold font-display text-foreground mt-2 mb-3.5">
                  Barkada Challenges
                </h3>
                <p className="text-muted text-sm leading-relaxed">
                  Start coffee-free duels or transport-saving group runs. Maintain active streaks to gain XP, unlock badges, and equip CSS border frames to stand out.
                </p>
              </div>
              <div className="mt-8 flex items-center justify-between bg-streak-muted border border-streak/15 p-4 rounded-2xl transition-all duration-200 group-hover:scale-[1.02]">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🔥</span>
                  <div>
                    <p className="text-xs font-bold text-foreground font-display">5-Day Save Streak</p>
                    <p className="text-[10px] text-muted">Keep it up! Category is intact.</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-streak font-mono animate-pulse">+120 XP</span>
              </div>
            </div>

            {/* Cell 3: Social & Comments (Column span 12 - Full Width) */}
            <div className="bg-surface border border-border-subtle rounded-3xl p-8 md:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-8 items-center shadow-sm relative overflow-hidden hover:shadow-md transition-all duration-300 ease-out-emil">
              <div className="max-w-md">
                <span className="text-xs font-bold text-secondary font-mono uppercase tracking-wider">Social Feed</span>
                <h3 className="text-2xl font-bold font-display text-foreground mt-2 mb-3.5">
                  Socializing Budgets
                </h3>
                <p className="text-muted text-sm leading-relaxed mb-6">
                  Budgeting is a team effort. The Activity Feed updates the group when splits occur or streaks hit milestones. React with custom emojis, comment in threaded drawers, and respect privacy filters.
                </p>
                <div className="flex flex-wrap gap-2 text-xs font-semibold text-muted">
                  <span className="px-2.5 py-1 bg-surface-hover rounded-lg border border-border-subtle transition-colors duration-200 hover:bg-surface">👍 Likes & Comments</span>
                  <span className="px-2.5 py-1 bg-surface-hover rounded-lg border border-border-subtle transition-colors duration-200 hover:bg-surface">🔒 Strict Privacy Levels</span>
                  <span className="px-2.5 py-1 bg-surface-hover rounded-lg border border-border-subtle transition-colors duration-200 hover:bg-surface">👥 Activity Feed Updates</span>
                </div>
              </div>

              {/* High-fidelity responsive micro mock component */}
              <div className="border border-border/80 rounded-2xl bg-surface-hover/30 p-5 flex flex-col gap-4 shadow-inner hover:scale-[1.01] transition-transform duration-300">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center text-xs font-bold text-primary font-display">
                    K
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-foreground font-display">Kevin <span className="font-normal text-muted font-sans">split an expense</span></p>
                    <p className="text-[10px] text-muted font-mono">₱1,200.00 • Samgyupsal Dinner</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface border border-border text-[11px] font-semibold text-foreground hover:bg-surface-hover transition-colors btn-press">
                    <span>🔥</span> <span className="font-mono">4</span>
                  </button>
                  <button className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface border border-border text-[11px] font-semibold text-foreground hover:bg-surface-hover transition-colors btn-press">
                    <span>👍</span> <span className="font-mono">2</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── PRICING SECTION ─── */}
      <section id="pricing-section" className="py-24 border-y border-border-subtle bg-surface-hover/10">
        <div className="page-container max-w-4xl">
          <div className="text-center max-w-xl mx-auto mb-16">
            <span className="text-xs text-primary font-bold uppercase tracking-wider font-mono font-bold">Simple Billing</span>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight mt-3">
              One simple level. Always free.
            </h2>
            <p className="text-muted text-sm sm:text-base mt-4 leading-relaxed">
              BudgetBarkada is built for community and financial discipline. No credit cards, no premium locks.
            </p>
          </div>

          <div className="max-w-md mx-auto bg-surface border border-border-subtle rounded-3xl p-8 shadow-sm flex flex-col justify-between text-left hover:shadow-md transition-all duration-300 ease-out-emil">
            <div>
              <div className="flex justify-between items-baseline mb-6">
                <span className="text-base font-bold text-foreground font-display">Barkada Tier</span>
                <div className="text-right">
                  <span className="text-4xl font-display font-black text-foreground font-mono">₱0</span>
                  <span className="text-xs text-muted font-medium"> / forever</span>
                </div>
              </div>
              
              <p className="text-muted text-sm leading-relaxed mb-6">
                Perfect for active friend circles looking to log local splits, keep categories clean, and build streak points together.
              </p>

              <div className="space-y-3.5 mb-8">
                <div className="flex items-center gap-2.5 text-xs text-muted font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  <span>Unlimited monthly transaction ledger logs</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-muted font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  <span>Full category budget forecast insights</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-muted font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  <span>Active streaks & gamified duels challenges</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-muted font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  <span>Interactive social comments & reactions feed</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate('/register')}
              className="w-full flex items-center justify-center gap-2.5 px-6 h-12 bg-foreground hover:bg-foreground/90 text-background font-bold rounded-xl transition-all shadow-sm btn-press cursor-pointer"
            >
              Sign Up Free
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ─── FAQs SECTION ─── */}
      <section className="py-24 bg-background">
        <div className="page-container max-w-3xl text-left">
          <h2 className="font-display text-3xl font-extrabold text-foreground tracking-tight text-center mb-16">
            Frequently Asked Questions
          </h2>

          <div className="space-y-4">
            {faqList.map((faq, i) => (
              <div key={i} className="bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-sm hover:scale-[1.005] transition-all duration-200">
                <button
                  onClick={() => setActiveFAQ(activeFAQ === i ? null : i)}
                  className="w-full flex justify-between items-center p-5 text-sm sm:text-base font-bold text-foreground hover:bg-surface-hover/40 transition-colors select-none text-left cursor-pointer transition-[background-color] duration-200 ease-out"
                  aria-expanded={activeFAQ === i}
                  aria-controls={`faq-answer-${i}`}
                >
                  <span>{faq.q}</span>
                  <ChevronRight className={`w-4 h-4 text-muted transition-transform duration-200 ${activeFAQ === i ? 'rotate-90 text-primary' : ''}`} />
                </button>
                {activeFAQ === i && (
                  <div 
                    id={`faq-answer-${i}`}
                    role="region"
                    className="px-5 pb-5 pt-1 text-sm text-muted leading-relaxed border-t border-border-subtle/50 animate-fadeInFast"
                  >
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-border-subtle bg-surface-hover/20 py-12 text-left text-xs text-muted">
        <div className="page-container max-w-5xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-white shadow-sm font-display font-extrabold text-xs tracking-tighter animate-float">
              BB
            </div>
            <span className="font-semibold text-foreground">BudgetBarkada</span>
            <span className="text-[10px] text-muted">© 2026. All rights reserved.</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 font-semibold">
            <a href="#" className="hover:text-primary transition-colors duration-200">Privacy Policy</a>
            <span>•</span>
            <a href="#" className="hover:text-primary transition-colors duration-200">Terms of Service</a>
            <span>•</span>
            <a href="https://github.com/arjeldru-dev/CRUDproject" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors duration-200">GitHub</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
