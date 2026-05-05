import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { AlertCircle } from 'lucide-react';

/**
 * Login page — authenticates against POST /api/auth/login.
 * Stores JWT via Zustand and redirects to /dashboard on success.
 */
const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Basic client-side validation
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, token } = response.data;
      login(user, token);
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

  return (
    <div className="animate-fadeInFast">
      <h2 className="text-3xl font-display font-semibold text-foreground tracking-tight mb-2">Welcome Back</h2>
      <p className="text-base text-muted mb-8">
        Sign in to your account to continue
      </p>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 p-3.5 mb-6 rounded-xl bg-error/10 border border-error/20 text-error text-sm" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        <Button
          type="submit"
          size="lg"
          isLoading={isLoading}
          disabled={isLoading}
          className="w-full mt-2"
          id="login-submit"
        >
          Sign In
        </Button>
      </form>

      <p className="text-center text-base text-muted mt-8">
        Don&apos;t have an account?{' '}
        <Link
          to="/register"
          className="text-primary hover:text-primary/80 transition-colors font-medium"
        >
          Create One
        </Link>
      </p>
    </div>
  );
};

export default Login;
