import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import { AlertCircle, MapPin, Calendar, Edit3, UserPlus, Clock, UserCheck, ArrowLeft } from 'lucide-react';

interface PublicProfileData {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  location: string | null;
  avatarUrl: string | null;
  createdAt: string;
  friendshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'friends' | 'self';
}

/**
 * Public Profile View — /profile/:username
 * Displays a user's public profile with context-dependent action buttons.
 */
const PublicProfile: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);

  // ── Fetch Profile ─────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    if (!username) return;
    try {
      setError('');
      const res = await api.get(`/profile/${username}`);
      setProfile(res.data.profile);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { status?: number } };
        if (axiosErr.response?.status === 404) {
          setError('Profile not found.');
        } else {
          setError('Failed to load profile.');
        }
      } else {
        setError('Network error.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [username]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // ── Fetch QR Code ─────────────────────────────────────────────────
  const handleShowQR = async () => {
    if (qrDataUrl) {
      setShowQR((v) => !v);
      return;
    }
    if (!profile) return;

    try {
      const res = await api.get(`/profile/${profile.id}/qr`);
      setQrDataUrl(res.data.qrDataUrl);
      setShowQR(true);
    } catch {
      // Silently fail — QR is non-critical
    }
  };

  // ── Action Button Logic ───────────────────────────────────────────
  const renderActionButton = () => {
    if (!profile) return null;

    switch (profile.friendshipStatus) {
      case 'self':
        return (
          <Button
            onClick={() => navigate('/settings/profile')}
            variant="outline"
            size="md"
            id="profile-edit-btn"
          >
            <Edit3 className="w-4 h-4" /> Edit Profile
          </Button>
        );
      case 'friends':
        return (
          <div className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-success/10 border border-success/20 text-success text-sm font-semibold">
            <UserCheck className="w-4 h-4" /> Friends
          </div>
        );
      case 'pending_sent':
        return (
          <Button variant="outline" size="md" disabled id="profile-pending-btn">
            <Clock className="w-4 h-4" /> Request Pending...
          </Button>
        );
      case 'pending_received':
        return (
          <Button size="md" id="profile-accept-btn">
            <UserPlus className="w-4 h-4" /> Accept Request
          </Button>
        );
      case 'none':
      default:
        return (
          <Button size="md" id="profile-add-btn">
            <UserPlus className="w-4 h-4" /> Send Friend Request
          </Button>
        );
    }
  };

  // ── Skeleton Loader ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="animate-fadeInFast max-w-2xl mx-auto">
        <div className="h-6 w-16 bg-surface rounded animate-pulse mb-6" />
        <div className="p-8 bg-surface rounded-2xl">
          <div className="flex flex-col sm:flex-row items-center gap-6 mb-8">
            <div className="w-24 h-24 bg-surface-hover rounded-xl animate-pulse" />
            <div className="flex-1 space-y-3 text-center sm:text-left">
              <div className="h-7 w-48 bg-surface-hover rounded-lg animate-pulse mx-auto sm:mx-0" />
              <div className="h-4 w-32 bg-surface-hover rounded animate-pulse mx-auto sm:mx-0" />
              <div className="h-4 w-64 bg-surface-hover rounded animate-pulse mx-auto sm:mx-0" />
            </div>
          </div>
          <div className="h-10 w-40 bg-surface-hover rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  // ── Error State ───────────────────────────────────────────────────
  if (error) {
    return (
      <div className="animate-fadeInFast max-w-2xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex flex-col items-center justify-center py-20 container-subtle rounded-2xl">
          <AlertCircle className="w-10 h-10 text-error mb-4" />
          <h3 className="text-xl font-display font-semibold text-foreground mb-2">{error}</h3>
          <p className="text-sm text-muted mb-6">
            The user you're looking for may not exist or has a private profile.
          </p>
          <Button onClick={() => navigate('/friends')} variant="outline" size="md">
            Go to Friends
          </Button>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="animate-fadeInFast max-w-2xl mx-auto">
      {/* ── Back Button ─────────────────────────────────────────────── */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors mb-6 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {/* ── Profile Card ────────────────────────────────────────────── */}
      <div className="p-6 sm:p-8 container-card rounded-2xl">
        {/* Top Section: Avatar + Info */}
        <div className="flex flex-col sm:flex-row items-center gap-6 mb-6">
          <Avatar
            src={profile.avatarUrl}
            name={profile.displayName || profile.email}
            size="xl"
          />

          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl font-display font-semibold text-foreground tracking-tight">
              {profile.displayName || profile.username || 'Unnamed User'}
            </h1>
            {profile.username && (
              <p className="text-base text-primary font-medium mt-0.5">
                @{profile.username}
              </p>
            )}
            {profile.bio && (
              <p className="text-sm text-muted mt-2 max-w-md">
                {profile.bio}
              </p>
            )}
          </div>
        </div>

        {/* Meta Info */}
        <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-muted">
          {profile.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              {profile.location}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            Joined {new Date(profile.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
            })}
          </span>
        </div>

        <div className="divider mb-6" />

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          {renderActionButton()}

          {profile.friendshipStatus === 'self' && (
            <Button
              onClick={handleShowQR}
              variant="ghost"
              size="md"
              id="profile-qr-toggle"
            >
              {showQR ? 'Hide QR Code' : 'Show QR Code'}
            </Button>
          )}
        </div>

        {/* QR Code Display */}
        {showQR && qrDataUrl && (
          <div className="mt-6 p-6 bg-background rounded-xl border border-border-subtle text-center animate-slideDownIn">
            <p className="text-sm text-muted mb-4">
              Scan to view your profile and send a friend request
            </p>
            <img
              src={qrDataUrl}
              alt="Profile QR Code"
              className="mx-auto rounded-lg"
              style={{ width: 200, height: 200 }}
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/profile/${profile.username}?action=add-friend`
                );
              }}
              className="mt-4 text-sm text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer"
            >
              Copy Profile Link
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicProfile;
