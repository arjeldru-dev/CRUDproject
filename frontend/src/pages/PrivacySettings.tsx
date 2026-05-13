import React, { useState, useEffect } from 'react';
import { Shield, Eye, Lock, Globe, Users, Trash2, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

interface PrivacySettingsData {
  profileVisibility: 'PUBLIC' | 'FRIENDS_ONLY' | 'PRIVATE';
  debtVisibility: 'FRIENDS_ONLY' | 'PRIVATE';
  budgetVisibility: 'FRIENDS_ONLY' | 'PRIVATE';
}

interface BlockedUser {
  id: string;
  blockedUserId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  blockedAt: string;
}

const PrivacySettings: React.FC = () => {
  const { user } = useAuthStore();
  const [settings, setSettings] = useState<PrivacySettingsData>({
    profileVisibility: 'PUBLIC',
    debtVisibility: 'FRIENDS_ONLY',
    budgetVisibility: 'PRIVATE',
  });
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [settingsRes, blockedRes] = await Promise.all([
          api.get('/settings/privacy'),
          api.get('/settings/blocked'),
        ]);
        setSettings(settingsRes.data.settings);
        setBlockedUsers(blockedRes.data.blocked);
      } catch (err: any) {
        setError(err.response?.data?.error?.message || 'Failed to load privacy settings');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleToggle = async (key: keyof PrivacySettingsData, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value as any }));
    setIsSaving(true);
    try {
      await api.put('/settings/privacy', { [key]: value });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to update setting');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnblock = async (blockedUserId: string) => {
    try {
      await api.delete(`/settings/blocked/${blockedUserId}`);
      setBlockedUsers((prev) => prev.filter((b) => b.blockedUserId !== blockedUserId));
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to unblock user');
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="h-8 bg-surface rounded w-1/4 animate-pulse"></div>
        <div className="h-32 bg-surface rounded animate-pulse"></div>
        <div className="h-32 bg-surface rounded animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fadeInFast">
      <div>
        <h1 className="text-2xl font-display font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          Privacy Settings
        </h1>
        <p className="text-muted mt-1">Control who can see your profile and financial activity.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-error/10 text-error rounded-xl">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Visibility Settings */}
      <div className="container-card">
        <h2 className="text-lg font-semibold text-foreground mb-4">Visibility</h2>
        <div className="space-y-6">
          {/* Profile Visibility */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
            <div>
              <p className="font-medium text-foreground">Profile Visibility</p>
              <p className="text-sm text-muted">Who can find you in search and view your profile.</p>
            </div>
            <select
              className="bg-surface border border-border-subtle rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
              value={settings.profileVisibility}
              onChange={(e) => handleToggle('profileVisibility', e.target.value)}
              disabled={isSaving}
            >
              <option value="PUBLIC">Public</option>
              <option value="FRIENDS_ONLY">Friends Only</option>
              <option value="PRIVATE">Hidden</option>
            </select>
          </div>

          {/* Debt Visibility */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
            <div>
              <p className="font-medium text-foreground">Debt &amp; Balance Visibility</p>
              <p className="text-sm text-muted">Show transaction amounts in friends' feeds.</p>
            </div>
            <select
              className="bg-surface border border-border-subtle rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
              value={settings.debtVisibility}
              onChange={(e) => handleToggle('debtVisibility', e.target.value)}
              disabled={isSaving}
            >
              <option value="FRIENDS_ONLY">Visible to Friends</option>
              <option value="PRIVATE">Hidden</option>
            </select>
          </div>

          {/* Budget Visibility */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">Budget Milestones</p>
              <p className="text-sm text-muted">Share budget milestone posts in the social feed.</p>
            </div>
            <select
              className="bg-surface border border-border-subtle rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
              value={settings.budgetVisibility}
              onChange={(e) => handleToggle('budgetVisibility', e.target.value)}
              disabled={isSaving}
            >
              <option value="FRIENDS_ONLY">Show in Feed</option>
              <option value="PRIVATE">Keep Private</option>
            </select>
          </div>
        </div>
      </div>

      {/* Blocked Users */}
      <div className="container-card">
        <h2 className="text-lg font-semibold text-foreground mb-4">Blocked Users</h2>
        {blockedUsers.length === 0 ? (
          <p className="text-sm text-muted">You haven't blocked anyone.</p>
        ) : (
          <div className="space-y-3">
            {blockedUsers.map((blockedUser) => (
              <div key={blockedUser.id} className="flex items-center justify-between p-3 bg-surface rounded-lg border border-border-subtle">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                    {blockedUser.avatarUrl ? (
                      <img src={blockedUser.avatarUrl} alt={blockedUser.username} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-primary font-medium text-sm">
                        {blockedUser.displayName?.charAt(0) || blockedUser.username?.charAt(0) || '?'}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{blockedUser.displayName || blockedUser.username}</p>
                    <p className="text-xs text-muted">@{blockedUser.username}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleUnblock(blockedUser.blockedUserId)}
                  className="px-3 py-1.5 text-sm font-medium text-foreground bg-background border border-border-subtle rounded-lg hover:bg-surface-hover transition-colors cursor-pointer"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PrivacySettings;
