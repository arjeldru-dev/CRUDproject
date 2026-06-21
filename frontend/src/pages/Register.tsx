import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { WarningCircle, EnvelopeSimple, LockSimple, User, Eye, EyeSlash, ArrowRight } from '@phosphor-icons/react';

/**
 * Register page — creates account via POST /api/auth/register.
 * Supports Username, Email, Password, and Password Strength Verification.
 */
const Register: React.FC = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuthStore();
  const navigate = useNavigate();

  // Dynamic Password Strength calculation
  const getPasswordStrength = (pass: string): { score: number; label: string; colorClass: string } => {
    if (!pass) return { score: 0, label: '', colorClass: 'bg-border' };
    if (pass.length < 8) return { score: 1, label: 'Weak', colorClass: 'bg-error' };

    let score = 0;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score++; // Mixed case
    if (/[0-9]/.test(pass)) score++; // Numbers
    if (/[^A-Za-z0-9]/.test(pass)) score++; // Special chars

    if (score >= 2) return { score: 3, label: 'Strong', colorClass: 'bg-success' };
    if (score >= 1) return { score: 2, label: 'Fair', colorClass: 'bg-warning' };
    return { score: 1, label: 'Weak', colorClass: 'bg-error' };
  };

  const strength = getPasswordStrength(password);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (username.trim()) {
      if (username.trim().length < 3) {
        errors.username = 'Username must be at least 3 characters.';
      } else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
        errors.username = 'Only letters, numbers, and underscores are allowed.';
      }
    }
    if (!email) {
      errors.email = 'Email is required.';
    }
    if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError('');

    if (!validate()) return;

    setIsLoading(true);
    try {
      const response = await api.post('/auth/register', { 
        email, 
        password,
        username: username.trim() || undefined
      });
      const { user, token } = response.data;
      login(user, token);
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setError(axiosErr.response?.data?.error || 'Registration failed. Please try again.');
      } else {
        setError('Network error. Please check your connection.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col transition-colors duration-200">
      {/* Welcome Header - Entrance Animation (Delay 0ms) */}
      <div className="mb-8 lg:mb-10 animate-slideUpIn">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2 tracking-tight">
          Create account
        </h2>
        <p className="text-sm text-muted font-sans">
          Join BudgetBarkada and start splitting expenses.
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

      {/* Register Form - Decompressed spacing gaps */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 lg:gap-7">
        {/* Username Field - Entrance Animation (Delay 40ms) */}
        <div 
          className="flex flex-col gap-2.5 group animate-slideUpIn" 
          style={{ animationDelay: '40ms' }}
        >
          <label 
            className="text-xs font-bold text-muted uppercase tracking-wider font-sans" 
            htmlFor="username"
          >
            Username <span className="text-muted/40 font-normal normal-case">(optional)</span>
          </label>
          <div className="relative w-full group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none w-5 h-5 flex items-center justify-center group-focus-within:text-primary transition-colors duration-150">
              <User size={18} />
            </div>
            <input 
              id="username" 
              type="text" 
              placeholder="e.g. juan_delacruz" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              disabled={isLoading}
              className={`w-full h-14 bg-surface-hover border rounded-lg pr-4 text-foreground text-sm placeholder:text-muted/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-150 font-sans disabled:opacity-60 disabled:cursor-not-allowed ${
                fieldErrors.username ? 'border-error focus:border-error focus:ring-error/20' : 'border-border'
              }`}
              style={{ paddingLeft: '2.75rem' }}
            />
          </div>
          {fieldErrors.username && (
            <p className="text-xs text-error font-medium font-sans mt-0.5 break-words" role="alert">{fieldErrors.username}</p>
          )}
        </div>

        {/* Email Field - Entrance Animation (Delay 80ms) */}
        <div 
          className="flex flex-col gap-2.5 group animate-slideUpIn" 
          style={{ animationDelay: '80ms' }}
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
              className={`w-full h-14 bg-surface-hover border rounded-lg pr-4 text-foreground text-sm placeholder:text-muted/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-150 font-sans disabled:opacity-60 disabled:cursor-not-allowed ${
                fieldErrors.email ? 'border-error focus:border-error focus:ring-error/20' : 'border-border'
              }`}
              style={{ paddingLeft: '2.75rem' }}
            />
          </div>
          {fieldErrors.email && (
            <p className="text-xs text-error font-medium font-sans mt-0.5 break-words" role="alert">{fieldErrors.email}</p>
          )}
        </div>

        {/* Password Field - Entrance Animation (Delay 120ms) */}
        <div 
          className="flex flex-col gap-2.5 group animate-slideUpIn" 
          style={{ animationDelay: '120ms' }}
        >
          <label 
            className="text-xs font-bold text-muted uppercase tracking-wider font-sans" 
            htmlFor="password"
          >
            Password
          </label>
          <div className="relative w-full group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none w-5 h-5 flex items-center justify-center group-focus-within:text-primary transition-colors duration-150">
              <LockSimple size={18} />
            </div>
            <input 
              id="password" 
              type={showPassword ? "text" : "password"} 
              placeholder="Minimum 8 characters" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              disabled={isLoading}
              className={`w-full h-14 bg-surface-hover border rounded-lg pr-12 text-foreground text-sm placeholder:text-muted/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-150 font-sans disabled:opacity-60 disabled:cursor-not-allowed ${
                fieldErrors.password ? 'border-error focus:border-error focus:ring-error/20' : 'border-border'
              }`}
              style={{ paddingLeft: '2.75rem' }}
            />
            {/* Password toggle button - disabled when loading */}
            <button 
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isLoading}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-muted hover:text-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-md transition-[transform,color] duration-150 ease-out active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
          </div>
          
          {/* Password Strength Indicator */}
          {password.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex justify-between items-center text-[10px] uppercase tracking-wider font-semibold">
                <span className="text-muted">Password Strength</span>
                <span className={
                  strength.score === 1 ? 'text-error' :
                  strength.score === 2 ? 'text-warning' :
                  'text-success'
                }>{strength.label}</span>
              </div>
              <div className="flex gap-1 h-1.5 w-full">
                <div className={`flex-1 rounded-full transition-colors duration-300 ${strength.score >= 1 ? strength.colorClass : 'bg-border'}`} />
                <div className={`flex-1 rounded-full transition-colors duration-300 ${strength.score >= 2 ? strength.colorClass : 'bg-border'}`} />
                <div className={`flex-1 rounded-full transition-colors duration-300 ${strength.score >= 3 ? strength.colorClass : 'bg-border'}`} />
              </div>
            </div>
          )}
          
          {fieldErrors.password && (
            <p className="text-xs text-error font-medium font-sans mt-0.5 break-words" role="alert">{fieldErrors.password}</p>
          )}
        </div>

        {/* Confirm Password Field - Entrance Animation (Delay 160ms) */}
        <div 
          className="flex flex-col gap-2.5 group animate-slideUpIn" 
          style={{ animationDelay: '160ms' }}
        >
          <label 
            className="text-xs font-bold text-muted uppercase tracking-wider font-sans" 
            htmlFor="confirmPassword"
          >
            Confirm password
          </label>
          <div className="relative w-full group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none w-5 h-5 flex items-center justify-center group-focus-within:text-primary transition-colors duration-150">
              <LockSimple size={18} />
            </div>
            <input 
              id="confirmPassword" 
              type={showConfirmPassword ? "text" : "password"} 
              placeholder="Repeat your password" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              disabled={isLoading}
              className={`w-full h-14 bg-surface border rounded-lg pr-12 text-foreground text-sm placeholder:text-muted/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-150 font-sans disabled:opacity-60 disabled:cursor-not-allowed ${
                fieldErrors.confirmPassword ? 'border-error focus:border-error focus:ring-error/20' : 'border-border'
              }`}
              style={{ paddingLeft: '2.75rem' }}
            />
            {/* Password toggle button - disabled when loading */}
            <button 
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              disabled={isLoading}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-muted hover:text-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-md transition-[transform,color] duration-150 ease-out active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {fieldErrors.confirmPassword && (
            <p className="text-xs text-error font-medium font-sans mt-0.5 break-words" role="alert">{fieldErrors.confirmPassword}</p>
          )}
        </div>

        {/* Submit Button - Entrance Animation (Delay 200ms) */}
        <button 
          type="submit" 
          disabled={isLoading}
          className="w-full h-14 rounded-lg bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 mt-2 cursor-pointer btn-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface animate-slideUpIn disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ animationDelay: '200ms' }}
        >
          {isLoading ? (
            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <>
              Create Account
              <ArrowRight size={16} weight="bold" />
            </>
          )}
        </button>
      </form>

      {/* Footer Link - Entrance Animation (Delay 240ms) */}
      <p 
        className="text-center text-sm text-muted mt-8 lg:mt-10 font-sans animate-slideUpIn"
        style={{ animationDelay: '240ms' }}
      >
        Already have an account?{' '}
        <Link
          to="/login"
          className="text-primary hover:text-primary-hover hover:underline font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
};

export default Register;
