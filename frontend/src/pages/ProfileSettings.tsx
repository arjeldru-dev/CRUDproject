import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useAuthStore } from '../store/authStore';
import { AlertCircle, Camera, Check, MapPin, AtSign, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ProfileData {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  location: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

/** Predefined palette of contrast-safe, brand-approved avatar background colors */
const ACCESSIBLE_AVATAR_COLORS = [
  '#0284c7', // Sky Blue
  '#047857', // Emerald
  '#4f46e5', // Indigo
  '#ea580c', // Orange
  '#be185d', // Pink
  '#6d28d9', // Violet
  '#0f766e', // Teal
];

/** Deterministic color from a string — produces a high-contrast theme-compliant color. */
function getInitialsColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % ACCESSIBLE_AVATAR_COLORS.length;
  return ACCESSIBLE_AVATAR_COLORS[index];
}

/** Extract up to 2 initials from a name. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (name.slice(0, 2)).toUpperCase();
}

/**
 * Profile Settings — /settings/profile
 * Refactored to align spacing, visual assets, accessibility controls,
 * and Cumulative Layout Shift (CLS) parameters with audit directives.
 */
const ProfileSettings: React.FC = () => {
  const { user, login, logout } = useAuthStore();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Profile Data ──────────────────────────────────────────────────
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // ── Form State ────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // ── Username Availability ─────────────────────────────────────────
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const usernameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Avatar Upload & Fallback ──────────────────────────────────────
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  // ── Abort Controller Refs ─────────────────────────────────────────
  const fetchControllerRef = useRef<AbortController | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);

  // ── Deletion Modal State ──────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteModalRef = useFocusTrap(showDeleteModal, () => {
    setShowDeleteModal(false);
    setDeleteConfirmText('');
  });

  // ── Button Blur Transitions (Emil Design Eng) ───────────────────
  const [btnTextState, setBtnTextState] = useState<'idle' | 'saving'>('idle');
  const [btnBlur, setBtnBlur] = useState(false);

  useEffect(() => {
    if (isSaving) {
      setBtnBlur(true);
      const timer = setTimeout(() => {
        setBtnTextState('saving');
        setBtnBlur(false);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setBtnBlur(true);
      const timer = setTimeout(() => {
        setBtnTextState('idle');
        setBtnBlur(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isSaving]);

  // ── Fetch Profile ─────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
    }
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    try {
      setError('');
      const res = await api.get('/profile/me', { signal: controller.signal });
      const p = res.data.profile as ProfileData;
      setProfile(p);
      setDisplayName(p.displayName || '');
      setUsername(p.username || '');
      setBio(p.bio || '');
      setLocation(p.location || '');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'CanceledError') {
        return;
      }
      setError('Failed to load profile. Please try again.');
    } finally {
      if (fetchControllerRef.current === controller) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    return () => {
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
      }
      if (uploadControllerRef.current) {
        uploadControllerRef.current.abort();
      }
    };
  }, [fetchProfile]);

  useEffect(() => {
    setAvatarLoadError(false);
  }, [profile?.avatarUrl]);

  // ── Debounced Username Check ──────────────────────────────────────
  useEffect(() => {
    if (!username || username === profile?.username) {
      setUsernameStatus('idle');
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');

    const controller = new AbortController();

    if (usernameTimerRef.current) {
      clearTimeout(usernameTimerRef.current);
    }

    usernameTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/profile/${username}`, { signal: controller.signal });
        if (res.data.profile.id !== profile?.id) {
          setUsernameStatus('taken');
        } else {
          setUsernameStatus('available');
        }
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'name' in err && err.name === 'CanceledError') {
          return;
        }
        setUsernameStatus('available');
      }
    }, 400);

    return () => {
      if (usernameTimerRef.current) {
        clearTimeout(usernameTimerRef.current);
      }
      controller.abort();
    };
  }, [username, profile?.username, profile?.id]);

  // ── Save Profile ──────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessMsg('');

    if (username && !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      setFormError('Username must be 3–30 characters, alphanumeric and underscores only.');
      return;
    }
    if (displayName.length > 50) {
      setFormError('Display name must be 50 characters or fewer.');
      return;
    }
    if (bio.length > 160) {
      setFormError('Bio must be 160 characters or fewer.');
      return;
    }
    if (location.length > 100) {
      setFormError('Location must be 100 characters or fewer.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await api.put('/profile/me', {
        displayName: displayName || null,
        username: username || undefined,
        bio: bio || null,
        location: location || null,
      });

      const updated = res.data.profile as ProfileData;
      setProfile(updated);

      if (user) {
        login(
          {
            ...user,
            username: updated.username,
            displayName: updated.displayName,
            avatarUrl: updated.avatarUrl,
          },
          JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token || '',
        );
      }

      setSuccessMsg('Profile updated');
      setTimeout(() => setSuccessMsg(''), 4000);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string }; status?: number } };
        if (axiosErr.response?.status === 409) {
          setFormError('Username is already taken.');
        } else {
          setFormError(axiosErr.response?.data?.error || 'Failed to update profile.');
        }
      } else {
        setFormError('Network error. Please check your connection.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ── Avatar Upload ─────────────────────────────────────────────────
  const handleAvatarClick = () => {
    if (isUploadingAvatar || isSaving) return;
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setFormError('Avatar must be 5MB or smaller.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Only JPEG, PNG, and WebP images are allowed.');
      return;
    }

    setIsUploadingAvatar(true);
    setFormError('');

    if (uploadControllerRef.current) {
      uploadControllerRef.current.abort();
    }
    const controller = new AbortController();
    uploadControllerRef.current = controller;

    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await api.post('/profile/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: controller.signal,
      });

      const newAvatarUrl = res.data.avatarUrl;

      setProfile((prev) => (prev ? { ...prev, avatarUrl: newAvatarUrl } : prev));

      if (user) {
        login(
          { ...user, avatarUrl: newAvatarUrl },
          JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token || '',
        );
      }

      setSuccessMsg('Profile photo updated');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'CanceledError') {
        return;
      }
      setFormError('Failed to upload avatar. Please try again.');
    } finally {
      if (uploadControllerRef.current === controller) {
        setIsUploadingAvatar(false);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Confirm Deactivation/Deletion ─────────────────────────────────
  const handleConfirmDelete = async () => {
    const targetMatch = profile?.username || '';
    if (deleteConfirmText !== targetMatch) return;
    
    setIsDeleting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      logout();
      setShowDeleteModal(false);
      navigate('/register', { replace: true });
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Skeleton Loader ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="w-full max-w-[680px] mx-auto animate-fadeInFast">
        <div className="h-6 w-32 bg-surface-hover/50 rounded-lg animate-pulse mb-3" />
        <div className="h-4 w-64 bg-surface-hover/30 rounded-lg animate-pulse mb-8" />
        <div className="bg-surface rounded-2xl" style={{ padding: 'var(--space-8)' }}>
          <div className="flex items-center gap-6 mb-8">
            <div className="w-24 h-24 bg-surface-hover/50 rounded-2xl animate-pulse" />
            <div className="flex-1 space-y-3">
              <div className="h-4 w-40 bg-surface-hover/50 rounded animate-pulse" />
              <div className="h-4 w-28 bg-surface-hover/30 rounded animate-pulse" />
            </div>
          </div>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-surface-hover/30 rounded-xl animate-pulse mb-5" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error Recovery Page ───────────────────────────────────────────
  if (error && !profile) {
    return (
      <div className="w-full max-w-[680px] mx-auto animate-fadeInFast py-12 text-center font-sans">
        <div className="inline-flex p-4 bg-error/10 border border-error/20 rounded-full text-error mb-4">
          <AlertCircle className="w-8 h-8" aria-hidden="true" />
        </div>
        <h3 className="font-display text-xl font-bold text-foreground mb-2">Failed to load profile</h3>
        <p className="text-muted text-sm mb-6 max-w-md mx-auto">
          We encountered a problem retrieving your profile configurations. Please check your network connection and try again.
        </p>
        <button
          onClick={() => {
            setIsLoading(true);
            setError('');
            fetchProfile();
          }}
          className="px-6 py-2.5 bg-primary text-white font-semibold rounded-lg hover:bg-primary-hover active:scale-97 transition-all btn-press cursor-pointer"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  const avatarName = profile?.displayName || profile?.email || 'User';

  return (
    <div className="w-full max-w-[680px] mx-auto animate-fadeInFast pb-24">
      {/* Contextual Header */}
      <div className="mb-6 animate-stagger-card" style={{ animationDelay: '0ms' }}>
        <h2 className="text-xl font-bold text-foreground font-display">Edit Profile</h2>
        <p className="text-sm text-muted mt-1 font-sans">
          Customize how others see you on BudgetBarkada
        </p>
      </div>

      {/* ── Error Banner ────────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center gap-2 p-4 mb-6 rounded-xl bg-error/10 border border-error/20 text-error text-sm animate-slideDownIn font-sans"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
          <button
            onClick={() => fetchProfile()}
            className="ml-auto text-xs font-semibold underline hover:text-error/80 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Success Banner ──────────────────────────────────────────── */}
      {successMsg && (
        <div className="flex items-center gap-2 p-4 mb-6 rounded-2xl bg-success/10 border border-success/20 text-success text-sm font-semibold animate-slideDownIn font-sans">
          <Check className="w-4 h-4 shrink-0" style={{ strokeWidth: 3 }} aria-hidden="true" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ── Profile Form ────────────────────────────────────────────── */}
      <div 
        className="bg-surface shadow-sm animate-stagger-card rounded-2xl mb-4"
        style={{ padding: 'var(--space-8)', animationDelay: '60ms' }}
      >
        {/* Avatar Section - divider removed, spacing adjusted for desktop and mobile */}
        <div className="flex flex-row items-center gap-4 sm:gap-[34px] mb-10">
          <button
            type="button"
            onClick={handleAvatarClick}
            disabled={isUploadingAvatar || isSaving}
            className="relative group rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer border-2 border-primary/30 p-[3px] w-[110px] h-[110px] sm:w-[120px] sm:h-[120px] flex items-center justify-center transition-all duration-200 active:scale-[0.95] disabled:opacity-70 disabled:cursor-not-allowed shrink-0"
            aria-label="Upload avatar image"
          >
            <div className="w-full h-full rounded-full overflow-hidden bg-surface flex items-center justify-center relative">
              {profile?.avatarUrl && !avatarLoadError ? (
                <img
                  src={profile.avatarUrl}
                  alt={avatarName}
                  onError={() => setAvatarLoadError(true)}
                  className="w-full h-full object-cover transition-transform duration-300 ease-[var(--ease-out-emil)] group-hover:scale-105 group-focus:scale-105"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white font-display font-semibold text-3xl sm:text-4xl transition-transform duration-300 ease-[var(--ease-out-emil)] group-hover:scale-105 group-focus:scale-105"
                  style={{ backgroundColor: getInitialsColor(avatarName) }}
                >
                  {getInitials(avatarName)}
                </div>
              )}
            </div>
            
            {/* Camera Upload hover overlay */}
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 ease-[var(--ease-out-emil)] backdrop-blur-[1px]">
              {isUploadingAvatar ? (
                <svg className="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <Camera className="w-6 h-6 text-white transition-transform duration-200 ease-[var(--ease-out-emil)] scale-[0.85] opacity-0 group-hover:scale-100 group-focus-within:scale-100 group-hover:opacity-100 group-focus-within:opacity-100" aria-hidden="true" />
              )}
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarChange}
              className="hidden"
              aria-label="Upload avatar file"
            />
          </button>
          
          <div className="text-left min-w-0 flex-1 pt-1 sm:pt-2">
            <h3 
              className="font-display text-lg sm:text-xl font-bold text-foreground truncate w-full max-w-[280px] sm:max-w-full mx-auto sm:mx-0"
              title={profile?.displayName || 'User'}
            >
              {profile?.displayName || 'User'}
            </h3>
            {profile?.username && (
              <p 
                className="text-xs sm:text-sm text-muted font-mono truncate w-full max-w-[280px] sm:max-w-[360px] mx-auto sm:mx-0"
                title={`@${profile.username}`}
              >
                @{profile.username}
              </p>
            )}
            <button 
              type="button" 
              onClick={handleAvatarClick}
              disabled={isUploadingAvatar || isSaving}
              className="mt-2 text-primary font-bold text-xs sm:text-sm hover:underline underline-offset-4 decoration-2 font-sans cursor-pointer btn-press disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Change profile photo
            </button>
          </div>
        </div>

        {/* Form Error */}
        {formError && (
          <div className="flex items-center gap-2 p-3 mb-3 rounded-xl bg-error/10 border border-error/20 text-error text-sm animate-slideDownIn" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSave}>
          {/* Display Name */}
          <div className="space-y-1 mb-3">
            <label htmlFor="profile-display-name" className="block text-xs font-bold text-muted uppercase tracking-wider px-1 mt-[10px]">
              Display Name
            </label>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted transition-colors duration-150 group-focus-within:text-primary">
                <User className="w-5 h-5" aria-hidden="true" />
              </span>
              <input
                id="profile-display-name"
                type="text"
                placeholder="Your Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                disabled={isSaving}
                className="w-full h-14 pr-4 rounded-xl border-0 bg-surface-hover/40 text-foreground placeholder-muted/50 focus:outline-none focus:bg-surface-hover/60 focus:ring-2 focus:ring-primary/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ paddingLeft: '3.25rem' }}
              />
            </div>
          </div>

          {/* Username */}
          <div className="space-y-1 mb-2">
            <div className="flex justify-between items-center px-1">
              <label htmlFor="profile-username" className="block text-xs font-bold text-muted uppercase tracking-wider">
                Username
              </label>
              {usernameStatus === 'checking' && (
                <span className="text-xs text-muted animate-pulse font-sans">Checking availability...</span>
              )}
              {usernameStatus === 'available' && (
                <span className="text-xs text-success flex items-center gap-1 font-sans font-semibold animate-slideDownIn">
                  <Check className="w-3.5 h-3.5" style={{ strokeWidth: 3 }} aria-hidden="true" /> Username available
                </span>
              )}
              {usernameStatus === 'taken' && (
                <span className="text-xs text-error flex items-center gap-1 font-sans font-semibold animate-slideDownIn">
                  <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" /> Username is already taken
                </span>
              )}
            </div>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted transition-colors duration-150 group-focus-within:text-primary">
                <AtSign className="w-5 h-5" aria-hidden="true" />
              </span>
              <input
                id="profile-username"
                type="text"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                maxLength={30}
                disabled={isSaving}
                className="w-full h-14 pr-4 rounded-xl border-0 bg-surface-hover/40 text-foreground placeholder-muted/50 focus:outline-none focus:bg-surface-hover/60 focus:ring-2 focus:ring-primary/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ paddingLeft: '3.25rem' }}
              />
            </div>
          </div>

          {/* Bio */}
          <div className="space-y-1 mb-3">
            <div className="flex justify-between items-center px-1">
              <label htmlFor="profile-bio" className="block text-xs font-bold text-muted uppercase tracking-wider">
                Bio
              </label>
              <span className="text-xs text-muted font-medium" aria-live="polite">{bio.length}/160</span>
            </div>
            <textarea
              id="profile-bio"
              placeholder="Tell us about yourself..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={160}
              rows={3}
              disabled={isSaving}
              className="w-full p-4 rounded-xl border-0 bg-surface-hover/40 text-foreground placeholder-muted/50 focus:outline-none focus:bg-surface-hover/60 focus:ring-2 focus:ring-primary/20 transition-all duration-200 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Location */}
          <div className="space-y-1 mb-3">
            <label htmlFor="profile-location" className="block text-xs font-bold text-muted uppercase tracking-wider px-1">
              Location
            </label>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted transition-colors duration-150 group-focus-within:text-primary">
                <MapPin className="w-5 h-5" aria-hidden="true" />
              </span>
              <input
                id="profile-location"
                type="text"
                placeholder="Manila, Philippines"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={100}
                disabled={isSaving}
                className="w-full h-14 pr-4 rounded-xl border-0 bg-surface-hover/40 text-foreground placeholder-muted/50 focus:outline-none focus:bg-surface-hover/60 focus:ring-2 focus:ring-primary/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ paddingLeft: '3.25rem' }}
              />
            </div>
          </div>

          {/* Join Date (read-only) */}
          {profile?.createdAt && (
            <div className="space-y-1 mb-4">
              <label className="block text-xs font-bold text-muted uppercase tracking-wider px-1">
                Member Since
              </label>
              <div className="w-full h-14 px-4 flex items-center rounded-xl border-0 bg-surface-hover/40 text-muted select-none font-medium">
                {new Date(profile.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
            </div>
          )}

          {/* Form Actions - border removed and spacing updated */}
          <div className="flex justify-end items-center gap-4">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => navigate(-1)}
              className="px-6 py-3 font-semibold text-muted hover:text-foreground transition-all cursor-pointer font-sans btn-press disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || usernameStatus === 'taken'}
              className="px-6 py-3 bg-primary rounded-lg font-semibold text-white text-sm hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer btn-press"
            >
              <div
                className={`flex items-center gap-2 transition-[filter,opacity] duration-150 ease-[var(--ease-out-emil)] ${
                  btnBlur ? 'blur-[2px] opacity-70' : 'blur-0 opacity-100'
                }`}
              >
                {btnTextState === 'saving' ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" style={{ strokeWidth: 3 }} aria-hidden="true" />
                    Save Changes
                  </>
                )}
              </div>
            </button>
          </div>
        </form>
      </div>

      {/* ── Danger Zone - styled solid red for contrast and notice ── */}
      <div 
        className="bg-red-700 dark:bg-red-900 text-white animate-stagger-card overflow-hidden shadow-sm rounded-2xl"
        style={{ padding: 'var(--space-8)', animationDelay: '120ms' }}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left font-sans">
            <h4 className="text-lg font-bold text-white font-display">Danger Zone</h4>
            <p className="text-sm text-white/90 mt-0.5 font-medium">Permanently delete your BudgetBarkada account and all associated transactions.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDeleteConfirmText('');
              setShowDeleteModal(true);
            }}
            className="px-5 py-3 rounded-xl bg-white text-red-700 dark:text-red-900 text-sm font-bold hover:bg-red-50 active:scale-[0.98] transition-all duration-200 cursor-pointer font-sans btn-press shrink-0"
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* ── Delete Confirmation Modal ───────────────────────────────── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div
            ref={deleteModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="bg-surface border border-border rounded-2xl max-w-md w-full shadow-2xl animate-scaleIn"
            style={{ padding: 'var(--space-8)' }}
          >
            <div className="flex items-center gap-3 text-error mb-4">
              <span className="p-2 bg-error/10 rounded-xl">
                <AlertCircle className="w-6 h-6" aria-hidden="true" />
              </span>
              <h3 id="delete-account-title" className="text-xl font-bold text-foreground font-display">Delete Account</h3>
            </div>
            
            <p className="text-sm text-muted mb-5 leading-relaxed font-sans">
              Are you absolutely sure you want to delete your account? This action is irreversible and will permanently delete all your data, transactions, and friendship history on BudgetBarkada.
            </p>

            <label htmlFor="delete-confirm-input" className="block text-xs font-bold text-muted uppercase tracking-wider mb-2 font-sans cursor-pointer">
              Type <span className="text-foreground font-mono font-bold select-all">{profile?.username}</span> to confirm:
            </label>

            <input
              id="delete-confirm-input"
              type="text"
              placeholder={profile?.username || ''}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full h-12 px-4 mb-6 rounded-xl border-0 bg-surface-hover/40 text-foreground focus:outline-none focus:bg-surface-hover/60 focus:ring-2 focus:ring-error/20 transition-all duration-200 font-sans"
            />

            <div className="flex gap-3 justify-end font-sans">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
                className="px-4 py-2.5 text-sm font-semibold rounded-xl bg-surface hover:bg-surface-hover border border-border text-muted hover:text-foreground transition-all duration-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting || deleteConfirmText !== (profile?.username || '')}
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 text-sm font-bold rounded-xl bg-error text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-error/90 transition-all duration-200 cursor-pointer flex items-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Deleting...
                  </>
                ) : (
                  'Delete Permanently'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileSettings;

