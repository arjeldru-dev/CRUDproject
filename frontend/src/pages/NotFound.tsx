import React from 'react';
import { useNavigate } from 'react-router-dom';
import { WarningCircle, ArrowLeft, House } from '@phosphor-icons/react';
import { useAuthStore } from '../store/authStore';

/**
 * NotFound Page — Branded 404 screen.
 * Follows premium dark-mode aesthetic with balanced typography.
 */
const NotFound: React.FC = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.token !== null);

  const handleGoBack = () => {
    try {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate(isAuthenticated ? '/dashboard' : '/login');
      }
    } catch (error) {
      // Fallback for environment/iframe security constraint failures
      console.error('Navigation error:', error);
      navigate('/');
    }
  };

  return (
    <main 
      className="min-h-[100dvh] w-full flex flex-col justify-center items-center px-6 bg-background text-foreground font-sans relative overflow-hidden"
      role="main"
    >
      {/* Ambient background glows for visual depth (Breathe & Drift animations, with hardware acceleration and positioning safety) */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[600px] h-[300px] sm:h-[600px] bg-primary/5 dark:bg-primary/10 blur-[80px] sm:blur-[160px] rounded-full -z-10 pointer-events-none animate-breathe will-change-transform"
        aria-hidden="true" 
      />
      <div 
        className="absolute bottom-[-10%] left-[-10%] w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] bg-secondary/5 dark:bg-secondary/5 blur-[60px] sm:blur-[100px] rounded-full -z-10 pointer-events-none animate-drift will-change-transform"
        aria-hidden="true" 
      />

      <div className="max-w-md w-full relative z-10 text-center flex flex-col items-center px-4">
        {/* Warning icon with spring entry and gentle floating animation loop */}
        <div className="animate-scaleIn">
          <WarningCircle 
            size={48} 
            weight="bold" 
            className="text-primary mb-6 animate-float will-change-transform" 
            aria-hidden="true"
          />
        </div>

        {/* 404 Title - Stagger Entry 40ms with fluid scaling */}
        <h1 
          className="font-display font-extrabold text-[clamp(4.5rem,15vw,6.5rem)] leading-none tracking-tighter text-foreground mb-4 select-none animate-slideUpIn break-words w-full"
          style={{ animationDelay: '40ms', animationFillMode: 'both' }}
        >
          404
        </h1>
        
        {/* Page Not Found Subtitle - Stagger Entry 80ms with fluid scaling */}
        <h2 
          className="font-display text-[clamp(1.5rem,5vw,2rem)] font-bold text-foreground tracking-tight mb-3 animate-slideUpIn break-words w-full"
          style={{ animationDelay: '80ms', animationFillMode: 'both' }}
        >
          Page Not Found
        </h2>
        
        {/* Description - Stagger Entry 120ms with safe wrap */}
        <p 
          className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed font-sans mb-8 max-w-[35ch] animate-slideUpIn break-words w-full"
          style={{ animationDelay: '120ms', animationFillMode: 'both' }}
        >
          We couldn&apos;t find the page you were looking for. Let&apos;s get you back on track.
        </p>

        {/* Action Buttons - Stagger Entry 160ms */}
        <div 
          className="flex flex-col sm:flex-row gap-4 w-full justify-center animate-slideUpIn"
          style={{ animationDelay: '160ms', animationFillMode: 'both' }}
        >
          <button
            onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login')}
            className="min-h-12 py-3 px-6 w-full sm:w-48 bg-primary hover:bg-primary-hover text-zinc-950 font-semibold text-sm rounded-lg flex items-center justify-center gap-2 cursor-pointer shadow-sm btn-press hover:scale-[1.02] active:scale-[0.97] transition-transform duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background break-words"
          >
            <House size={18} weight="bold" aria-hidden="true" />
            <span className="truncate">Go to Overview</span>
          </button>
          
          <button
            onClick={handleGoBack}
            className="min-h-12 py-3 px-6 w-full sm:w-48 bg-surface hover:bg-surface-hover border border-border text-foreground text-sm font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer btn-press hover:scale-[1.02] active:scale-[0.97] transition-transform duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background break-words"
          >
            <ArrowLeft size={18} weight="bold" aria-hidden="true" />
            <span className="truncate">Go back</span>
          </button>
        </div>
      </div>
    </main>
  );
};

export default NotFound;
