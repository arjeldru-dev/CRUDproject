import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Textarea from '../components/ui/Textarea';
import Avatar from '../components/ui/Avatar';
import { AlertCircle, Camera, Check, MapPin, AtSign, User, ArrowLeft } from 'lucide-react';
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

/**
 * Profile Settings — /settings/profile
 * Allows the user to edit their public profile: avatar, display name,
 * username, bio, and location.
 */
const ProfileSettings: React.FC = () => {
  const { user, login } = useAuthStore();
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

  // ── Avatar Upload ─────────────────────────────────────────────────
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // ── Fetch Profile ─────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    try {
      setError('');
      const res = await api.get('/profile/me');
      const p = res.data.profile as ProfileData;
      setProfile(p);
      setDisplayName(p.displayName || '');
      setUsername(p.username || '');
      setBio(p.bio || '');
      setLocation(p.location || '');
    } catch {
      setError('Failed to load profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // ── Debounced Username Check ──────────────────────────────────────
  useEffect(() => {
    if (!username || username === profile?.username) {
      setUsernameStatus('idle');
      return;
    }

    // Basic client-side validation
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');

    if (usernameTimerRef.current) {
      clearTimeout(usernameTimerRef.current);
    }

    usernameTimerRef.current = setTimeout(async () => {
      try {
        // Try to fetch the profile with this username
        const res = await api.get(`/profile/${username}`);
        // If it returns and it's not our own profile, it's taken
        if (res.data.profile.id !== profile?.id) {
          setUsernameStatus('taken');
        } else {
          setUsernameStatus('available');
        }
      } catch {
        // 404 means username is available
        setUsernameStatus('available');
      }
    }, 400);

    return () => {
      if (usernameTimerRef.current) {
        clearTimeout(usernameTimerRef.current);
      }
    };
  }, [username, profile?.username, profile?.id]);

  // ── Save Profile ──────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessMsg('');

    // Client-side validation
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

      // Update auth store so navbar reflects changes immediately
      if (user) {
        login(
          {
            ...user,
            username: updated.username,
            displayName: updated.displayName,
            avatarUrl: updated.avatarUrl,
          },
          // Keep existing token
          JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token || '',
        );
      }

      setSuccessMsg('Profile updated successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
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
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
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

    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await api.post('/profile/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newAvatarUrl = res.data.avatarUrl;

      // Update local state
      setProfile((prev) => (prev ? { ...prev, avatarUrl: newAvatarUrl } : prev));

      // Update auth store
      if (user) {
        login(
          { ...user, avatarUrl: newAvatarUrl },
          JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token || '',
        );
      }

      setSuccessMsg('Avatar updated!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setFormError('Failed to upload avatar. Please try again.');
    } finally {
      setIsUploadingAvatar(false);
      // Reset file input so re-uploading the same file triggers onChange
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Skeleton Loader ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="animate-fadeInFast max-w-2xl mx-auto">
        <div className="h-8 w-48 bg-surface-hover rounded-lg animate-pulse mb-2" />
        <div className="h-4 w-72 bg-surface rounded-lg animate-pulse mb-8" />
        <div className="p-8 bg-surface rounded-2xl">
          <div className="flex items-center gap-6 mb-8">
            <div className="w-24 h-24 bg-surface-hover rounded-xl animate-pulse" />
            <div className="flex-1 space-y-3">
              <div className="h-4 w-40 bg-surface-hover rounded animate-pulse" />
              <div className="h-4 w-56 bg-surface-hover rounded animate-pulse" />
            </div>
          </div>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-surface-hover rounded-xl animate-pulse mb-5" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeInFast max-w-2xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="mb-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors mb-4 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <h1 className="text-fluid-h1 font-display font-semibold text-foreground tracking-tight">
          Edit Profile
        </h1>
        <p className="text-muted text-base font-medium mt-1">
          Customize how others see you on Hybrid Ledger
        </p>
      </div>

      <div className="divider mb-8" />

      {/* ── Error Banner ────────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center gap-2 p-4 mb-6 rounded-xl bg-error/10 border border-error/20 text-error text-sm"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
          <button
            onClick={fetchProfile}
            className="ml-auto text-xs font-medium underline hover:text-error/80 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Success Banner ──────────────────────────────────────────── */}
      {successMsg && (
        <div className="flex items-center gap-2 p-4 mb-6 rounded-xl bg-success/10 border border-success/20 text-success text-sm animate-slideDownIn">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ── Profile Form ────────────────────────────────────────────── */}
      <div className="p-6 sm:p-8 container-card rounded-2xl">
        {/* Avatar Section */}
        <div className="flex items-center gap-6 mb-8">
          <div className="relative group">
            <Avatar
              src={profile?.avatarUrl}
              name={profile?.displayName || profile?.email || 'U'}
              size="xl"
              onClick={handleAvatarClick}
            />
            <div
              className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              onClick={handleAvatarClick}
            >
              {isUploadingAvatar ? (
                <svg className="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <Camera className="w-6 h-6 text-white" />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarChange}
              className="hidden"
              aria-label="Upload avatar"
            />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">
              {profile?.displayName || profile?.email}
            </p>
            {profile?.username && (
              <p className="text-sm text-muted">@{profile.username}</p>
            )}
            <p className="text-xs text-muted mt-1">
              Click avatar to change · Max 5MB
            </p>
          </div>
        </div>

        <div className="divider mb-6" />

        {/* Form Error */}
        {formError && (
          <div className="flex items-center gap-2 p-3 mb-5 rounded-xl bg-error/10 border border-error/20 text-error text-sm" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="flex flex-col gap-6">
          {/* Display Name */}
          <Input
            label="Display Name"
            type="text"
            placeholder="How you'd like to be called"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            id="profile-display-name"
            maxLength={50}
            leftIcon={<User className="w-5 h-5 text-muted" />}
          />

          {/* Username */}
          <div>
            <Input
              label="Username"
              type="text"
              placeholder="your_unique_handle"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              id="profile-username"
              maxLength={30}
              leftIcon={<AtSign className="w-5 h-5 text-muted" />}
            />
            {/* Username availability indicator */}
            {usernameStatus === 'checking' && (
              <p className="text-xs text-muted mt-1.5 ml-1">Checking availability...</p>
            )}
            {usernameStatus === 'available' && (
              <p className="text-xs text-success mt-1.5 ml-1 flex items-center gap-1">
                <Check className="w-3 h-3" /> Username available
              </p>
            )}
            {usernameStatus === 'taken' && (
              <p className="text-xs text-error mt-1.5 ml-1">Username is already taken</p>
            )}
          </div>

          {/* Bio */}
          <Textarea
            label="Bio"
            placeholder="Tell people a bit about yourself..."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            id="profile-bio"
            maxChars={160}
            rows={3}
          />

          {/* Location */}
          <Input
            label="Location"
            type="text"
            placeholder="e.g. Manila, Philippines"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            id="profile-location"
            maxLength={100}
            leftIcon={<MapPin className="w-5 h-5 text-muted" />}
          />

          {/* Join Date (read-only) */}
          {profile?.createdAt && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted tracking-wide">
                Member Since
              </label>
              <p className="text-sm text-foreground font-medium py-3.5 px-5 bg-surface rounded-xl border border-border-subtle">
                {new Date(profile.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          )}

          <div className="divider" />

          {/* Submit */}
          <div className="flex justify-end">
            <Button
              type="submit"
              isLoading={isSaving}
              disabled={isSaving || usernameStatus === 'taken'}
              size="lg"
              id="profile-save"
            >
              <Check className="w-4 h-4" /> Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileSettings;
