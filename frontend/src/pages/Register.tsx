import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { AlertCircle } from 'lucide-react';

/**
 * Register page — creates account via POST /api/auth/register.
 * Validates password match and minimum length client-side.
 */
const Register: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuthStore();
  const navigate = useNavigate();

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!email) {
      errors.email = 'Email is required.';
    }
    if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validate()) return;

    setIsLoading(true);
    try {
      const response = await api.post('/auth/register', { email, password });
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
    <div className="animate-fadeInFast">
      <h2 className="text-3xl font-display font-semibold text-foreground tracking-tight mb-2">Create Account</h2>
      <p className="text-base text-muted mb-8">
        Get started with your personal ledger
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
          error={fieldErrors.email}
          autoComplete="email"
          required
        />

        <Input
          label="Password"
          type="password"
          placeholder="Min. 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          autoComplete="new-password"
          required
        />

        <Input
          label="Confirm Password"
          type="password"
          placeholder="Re-enter password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={fieldErrors.confirmPassword}
          autoComplete="new-password"
          required
        />

        <Button
          type="submit"
          size="lg"
          isLoading={isLoading}
          disabled={isLoading}
          className="w-full mt-2"
          id="register-submit"
        >
          Create Account
        </Button>
      </form>

      <p className="text-center text-base text-muted mt-8">
        Already have an account?{' '}
        <Link
          to="/login"
          className="text-primary hover:text-primary/80 transition-colors font-medium"
        >
          Sign In
        </Link>
      </p>
    </div>
  );
};

export default Register;
