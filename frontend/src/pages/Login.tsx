import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { WarningCircle, EnvelopeSimple, ArrowRight } from '@phosphor-icons/react';
import PasswordField from '../components/ui/PasswordField';

/**
 * Login page — authenticates against POST /api/auth/login.
 * Stores JWT via Zustand and redirects to /dashboard on success.
 */
const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, token } = response.data;
      login(user, token);
      
      // Store remember me state in localStorage
      if (rememberMe) {
        localStorage.setItem('bb_remember_email', email);
      } else {
        localStorage.removeItem('bb_remember_email');
      }

      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setError(axiosErr.response?.data?.error || 'Login failed. Please try again.');
      } else {
        setError('Network error. Please check your connection.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Pre-fill email if remember me was used in previous sessions
  React.useEffect(() => {
    const savedEmail = localStorage.getItem('bb_remember_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  return (
    <div className="w-full flex flex-col transition-colors duration-200">
      {/* Welcome Header - Entrance Animation (Delay 0ms) */}
      <div className="mb-8 lg:mb-10 animate-slideUpIn">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2 tracking-tight">
          Welcome back
        </h2>
        <p className="text-sm text-muted font-sans">
          Sign in to your account to continue
        </p>
      </div>

      {/* Error Banner - Shakes on mount with break-words to handle long API errors */}
      {error && (
        <div 
          className="flex items-start gap-2.5 p-4 mb-6 rounded-lg bg-error/10 border border-error/20 text-error text-sm font-medium animate-shake break-words overflow-hidden" 
          role="alert"
        >
          <WarningCircle size={18} className="shrink-0 text-error mt-0.5" />
          <span className="flex-grow min-w-0">{error}</span>
        </div>
      )}

      {/* Login Form - Decompressed spacing gaps */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 lg:gap-7">
        {/* Email Field - Entrance Animation (Delay 40ms) */}
        <div 
          className="flex flex-col gap-2.5 group animate-slideUpIn" 
          style={{ animationDelay: '40ms' }}
        >
          <label 
            className="text-xs font-bold text-muted uppercase tracking-wider font-sans" 
            htmlFor="email"
          >
            Email address
          </label>
          <div className="relative w-full group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none w-5 h-5 flex items-center justify-center group-focus-within:text-primary transition-colors duration-150">
              <EnvelopeSimple size={18} />
            </div>
            <input 
              id="email" 
              type="email" 
              placeholder="name@example.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={isLoading}
              className="w-full h-14 bg-surface-hover border border-border rounded-lg pr-4 text-foreground text-sm placeholder:text-muted/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-150 font-sans disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ paddingLeft: '2.75rem' }}
            />
          </div>
        </div>

        {/* Password Field - Entrance Animation (Delay 80ms) */}
        <div 
          className="animate-slideUpIn" 
          style={{ animationDelay: '80ms' }}
        >
          <PasswordField
            id="password"
            label="Password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={isLoading}
          />
        </div>

        {/* Remember Me Checkbox - Entrance Animation (Delay 120ms) */}
        <div 
          className="flex items-center mt-2 animate-slideUpIn" 
          style={{ animationDelay: '120ms' }}
        >
          <label className="flex items-center gap-2.5 cursor-pointer group py-1 select-none active:scale-[0.98] transition-transform duration-100 ease-out">
            <input 
              type="checkbox"
              id="rememberMe"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={isLoading}
              className="sr-only peer"
            />
            <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface peer-disabled:opacity-40 peer-disabled:cursor-not-allowed ${
              rememberMe 
                ? 'bg-primary border-primary text-white' 
                : 'bg-background border-border group-hover:border-primary/50'
            }`}>
              {rememberMe && (
                <svg className="w-3.5 h-3.5 stroke-[3] stroke-white animate-scaleIn" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </div>
            <span className="text-sm text-muted font-medium group-hover:text-foreground transition-colors font-sans group-has-[:disabled]:opacity-60 group-has-[:disabled]:cursor-not-allowed">
              Remember me
            </span>
          </label>
        </div>

        {/* Sign In Button - Entrance Animation (Delay 160ms) */}
        <button 
          type="submit" 
          disabled={isLoading}
          className="w-full h-14 rounded-lg bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 mt-3 cursor-pointer btn-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface animate-slideUpIn disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ animationDelay: '160ms' }}
        >
          {isLoading ? (
            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <>
              Sign In
              <ArrowRight size={16} weight="bold" />
            </>
          )}
        </button>
      </form>

      {/* Footer Link - Entrance Animation (Delay 200ms) */}
      <p 
        className="text-center text-sm text-muted mt-8 lg:mt-10 font-sans animate-slideUpIn"
        style={{ animationDelay: '200ms' }}
      >
        Don&apos;t have an account?{' '}
        <Link
          to="/register"
          className="text-primary hover:text-primary-hover hover:underline font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded"
        >
          Create one
        </Link>
      </p>
    </div>
  );
};

export default Login;
