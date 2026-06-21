import React, { useState, useEffect } from 'react';
import { Shield, AlertCircle, Check, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import api from '../lib/api';

interface PrivacySettingsData {
  profileVisibility: 'PUBLIC' | 'FRIENDS_ONLY' | 'PRIVATE';
  debtVisibility: 'PUBLIC' | 'FRIENDS_ONLY' | 'PRIVATE';
  budgetVisibility: 'PUBLIC' | 'FRIENDS_ONLY' | 'PRIVATE';
}

interface BlockedUser {
  id: string;
  blockedUserId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  blockedAt: string;
}

interface SearchUserResult {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  relationshipStatus: string;
}

/** Extract initials for avatars without images */
const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

interface SegmentedControlProps {
  label: string;
  value: 'PUBLIC' | 'FRIENDS_ONLY' | 'PRIVATE';
  onChange: (val: 'PUBLIC' | 'FRIENDS_ONLY' | 'PRIVATE') => void;
  options: { value: 'PUBLIC' | 'FRIENDS_ONLY' | 'PRIVATE'; label: string }[];
  disabled?: boolean;
}

const SegmentedControl: React.FC<SegmentedControlProps> = ({
  label,
  value,
  onChange,
  options,
  disabled,
}) => {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex bg-surface-hover p-1 rounded-xl w-full md:w-auto transition-opacity duration-200 ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
    >
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`flex-1 md:flex-initial px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg cursor-pointer btn-press transition-[background-color,color,border-color,box-shadow] duration-150 ease-[var(--ease-out-expo)] ${
              isSelected
                ? 'bg-surface dark:bg-zinc-800 text-primary shadow-sm border border-border/50'
                : 'text-muted hover:text-foreground border border-transparent'
            } ${disabled ? 'cursor-not-allowed' : ''}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

const PrivacySettings: React.FC = () => {
  const navigate = useNavigate();

  // ── States ──────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<PrivacySettingsData>({
    profileVisibility: 'PUBLIC',
    debtVisibility: 'FRIENDS_ONLY',
    budgetVisibility: 'PRIVATE',
  });
  const [originalSettings, setOriginalSettings] = useState<PrivacySettingsData>({
    profileVisibility: 'PUBLIC',
    debtVisibility: 'FRIENDS_ONLY',
    budgetVisibility: 'PRIVATE',
  });
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Block Search States ─────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // ── Save Button Blur-Transition States ──────────────────────────────
  const [isBlurring, setIsBlurring] = useState(false);
  const [displayState, setDisplayState] = useState<'idle' | 'saving'>('idle');

  // ── Fetch Data ─────────────────────────────────────────────────────
  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      setLoadFailed(false);
      setError(null);
      const [settingsRes, blockedRes] = await Promise.all([
        api.get('/settings/privacy'),
        api.get('/settings/blocked'),
      ]);
      const fetchedSettings = settingsRes.data.settings;
      setSettings(fetchedSettings);
      setOriginalSettings(fetchedSettings);
      setBlockedUsers(blockedRes.data.blocked);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr.response?.data?.error?.message || 'Failed to load privacy settings');
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // ── Debounced User Search to Block ──────────────────────────────────
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.get(`/friends/search?q=${encodeURIComponent(searchQuery)}`, {
          signal: controller.signal,
        });
        setSearchResults(res.data.results || []);
      } catch (err) {
        if (axios.isCancel(err)) {
          return;
        }
        console.error('Search user block error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  // ── Save Button Blur-Transition Logic ───────────────────────────────
  useEffect(() => {
    if (isSaving) {
      setIsBlurring(true);
      const timer = setTimeout(() => {
        setDisplayState('saving');
        setIsBlurring(false);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setIsBlurring(true);
      const timer = setTimeout(() => {
        setDisplayState('idle');
        setIsBlurring(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isSaving]);

  // ── Handle Toggles locally ──────────────────────────────────────────
  const handleSettingChange = (key: keyof PrivacySettingsData, value: 'PUBLIC' | 'FRIENDS_ONLY' | 'PRIVATE') => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  // ── Save Settings ──────────────────────────────────────────────────
  const handleSaveChanges = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api.put('/settings/privacy', settings);
      const updated = res.data.settings;
      setSettings(updated);
      setOriginalSettings(updated);
      setSuccessMsg('Privacy settings updated');
      setTimeout(() => setSuccessMsg(null), 4000);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr.response?.data?.error?.message || 'Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Cancel/Revert Changes ──────────────────────────────────────────
  const handleCancel = () => {
    setSettings(originalSettings);
    navigate(-1);
  };

  // ── Block / Unblock Actions ────────────────────────────────────────
  const handleUnblock = async (blockedUserId: string) => {
    try {
      setError(null);
      await api.delete(`/settings/blocked/${blockedUserId}`);
      setBlockedUsers((prev) => prev.filter((b) => b.blockedUserId !== blockedUserId));
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr.response?.data?.error?.message || 'Failed to unblock user');
    }
  };

  const handleBlockUser = async (userId: string) => {
    try {
      setError(null);
      await api.post(`/friends/block/${userId}`);
      setSearchQuery('');
      setSearchResults([]);
      // Refresh blocked list
      const blockedRes = await api.get('/settings/blocked');
      setBlockedUsers(blockedRes.data.blocked);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr.response?.data?.error?.message || 'Failed to block user');
    }
  };

  const hasChanges =
    settings.profileVisibility !== originalSettings.profileVisibility ||
    settings.debtVisibility !== originalSettings.debtVisibility ||
    settings.budgetVisibility !== originalSettings.budgetVisibility;

  const sharedOptions: { value: 'PUBLIC' | 'FRIENDS_ONLY' | 'PRIVATE'; label: string }[] = [
    { value: 'PUBLIC', label: 'Public' },
    { value: 'FRIENDS_ONLY', label: 'Friends Only' },
    { value: 'PRIVATE', label: 'Private' },
  ];

  // ── Skeleton Loader ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="w-full max-w-[680px] mx-auto px-4 sm:px-0 animate-fadeInFast">
        <div className="h-8 w-48 bg-surface-hover/50 rounded-lg animate-pulse mb-3" />
        <div className="h-4 w-72 bg-surface-hover/30 rounded-lg animate-pulse mb-8" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-surface shadow-sm" style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--space-8)' }}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-40 bg-surface-hover/50 rounded animate-pulse" />
                  <div className="h-3 w-60 bg-surface-hover/30 rounded animate-pulse" />
                </div>
                <div className="h-10 w-36 bg-surface-hover/50 rounded-xl animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error Recovery View ───────────────────────────────────────────
  if (loadFailed) {
    return (
      <div className="w-full max-w-[680px] mx-auto px-4 sm:px-0 animate-fadeInFast py-12 text-center">
        <div className="inline-flex p-4 bg-error/10 border border-error/20 rounded-full text-error mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="font-display text-xl font-bold text-foreground mb-2">Failed to load privacy settings</h2>
        <p className="text-muted text-sm font-sans mb-6 max-w-md mx-auto">
          We encountered a problem retrieving your privacy configurations. Please check your network connection and try again.
        </p>
        <button
          onClick={fetchSettings}
          className="px-6 py-2.5 bg-primary text-white font-semibold rounded-lg hover:bg-primary-hover active:scale-97 transition-all btn-press cursor-pointer"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[680px] mx-auto animate-fadeInFast">
      {/* Contextual Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground font-display">Privacy Settings</h2>
        <p className="text-sm text-muted mt-1 font-sans">
          Control who can see your profile and financial activity.
        </p>
      </div>

      {/* ── Error Banner ────────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center justify-between gap-2 p-4 mb-6 rounded-xl bg-error/10 border border-error/20 text-error text-sm animate-slideDownIn font-sans"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            aria-label="Dismiss error banner"
            className="text-error hover:opacity-80 p-1 rounded transition-opacity btn-press cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Success Banner ──────────────────────────────────────────── */}
      {successMsg && (
        <div className="flex items-center justify-between gap-2 p-4 mb-6 rounded-2xl bg-success/10 border border-success/20 text-success text-sm font-semibold animate-slideDownIn font-sans">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" style={{ strokeWidth: 3 }} />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            aria-label="Dismiss success banner"
            className="text-success hover:opacity-80 p-1 rounded transition-opacity btn-press cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Profile Visibility Card */}
      <section 
        className="bg-surface shadow-sm animate-stagger-card"
        style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--space-8)', marginBottom: 'var(--space-4)', animationDelay: '80ms' }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col font-sans max-w-[360px]">
            <span className="font-bold text-foreground text-base">Profile Visibility</span>
            <span className="mt-0.5 text-sm text-muted">Who can find you in search and view your profile.</span>
          </div>
          <SegmentedControl
            label="Profile Visibility"
            value={settings.profileVisibility}
            disabled={isSaving}
            onChange={(val) => handleSettingChange('profileVisibility', val)}
            options={sharedOptions}
          />
        </div>
      </section>

      {/* Debt & Balance Visibility Card */}
      <section 
        className="bg-surface shadow-sm animate-stagger-card"
        style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--space-8)', marginBottom: 'var(--space-4)', animationDelay: '100ms' }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col font-sans max-w-[360px]">
            <span className="font-bold text-foreground text-base">Debt &amp; Balance Visibility</span>
            <span className="mt-0.5 text-sm text-muted">Show transaction amounts in friends' feeds.</span>
          </div>
          <SegmentedControl
            label="Debt & Balance Visibility"
            value={settings.debtVisibility}
            disabled={isSaving}
            onChange={(val) => handleSettingChange('debtVisibility', val)}
            options={sharedOptions}
          />
        </div>
      </section>

      {/* Budget Milestones Card */}
      <section 
        className="bg-surface shadow-sm animate-stagger-card"
        style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--space-8)', marginBottom: 'var(--space-4)', animationDelay: '120ms' }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col font-sans max-w-[360px]">
            <span className="font-bold text-foreground text-base">Budget Milestones</span>
            <span className="mt-0.5 text-sm text-muted">Share budget milestone posts in the social feed.</span>
          </div>
          <SegmentedControl
            label="Budget Milestones"
            value={settings.budgetVisibility}
            disabled={isSaving}
            onChange={(val) => handleSettingChange('budgetVisibility', val)}
            options={sharedOptions}
          />
        </div>
      </section>

      {/* ── Blocked Users Card (Stagger Delay: 160ms) ────────────────── */}
      <section 
        className="bg-surface shadow-sm animate-stagger-card"
        style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--space-8)', marginBottom: 'var(--space-4)', animationDelay: '140ms' }}
      >
        <h2 className="font-display text-xl font-bold text-foreground mb-4">Blocked Users</h2>

        {blockedUsers.length === 0 ? (
          <div 
            className="flex flex-col items-center justify-center bg-surface-hover/20 border border-dashed text-center"
            style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', borderColor: 'var(--color-border)' }}
          >
            <Shield className="w-8 h-8 text-muted/40 mb-2 animate-float" />
            <p className="text-sm text-muted font-medium font-sans">You haven't blocked any users yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {blockedUsers.map((blockedUser) => (
              <div
                key={blockedUser.id}
                className="bg-surface-hover/30 rounded-2xl p-4 flex items-center justify-between hover:bg-surface-hover/50 transition-[background-color] duration-150 ease-[var(--ease-out-expo)] gap-4 animate-stagger-card"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {blockedUser.avatarUrl ? (
                    <img
                      src={blockedUser.avatarUrl}
                      alt={blockedUser.username}
                      className="w-11 h-11 rounded-full object-cover border border-border shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                      {getInitials(blockedUser.displayName || blockedUser.username)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-foreground text-sm sm:text-base leading-snug font-sans truncate">
                      {blockedUser.displayName || blockedUser.username}
                    </p>
                    <p className="text-xs text-muted font-mono truncate">@{blockedUser.username}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleUnblock(blockedUser.blockedUserId)}
                  disabled={isSaving}
                  aria-label={`Unblock ${blockedUser.displayName || blockedUser.username}`}
                  className="px-4 py-2.5 bg-surface rounded-xl text-foreground font-semibold text-xs sm:text-sm hover:border-error hover:text-error hover:bg-error/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer font-sans btn-press shrink-0"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add Block Search Input */}
        <div className="mt-8 pt-6">
          <label
            htmlFor="block-user-search"
            className="block text-xs font-bold text-muted uppercase tracking-wider mb-2 px-1 font-sans"
          >
            Block a User
          </label>
          <div className="relative">
            <input
              id="block-user-search"
              type="text"
              placeholder="Search username, name, or email to block..."
              value={searchQuery}
              disabled={isSaving}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-14 bg-surface-hover/40 text-foreground font-medium placeholder:text-muted/50 focus:bg-surface-hover/60 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all font-sans"
              style={{ borderRadius: 'var(--radius-lg)', paddingLeft: 'var(--space-12)', paddingRight: 'var(--space-6)' }}
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted pointer-events-none" />

            {isSearching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <svg className="animate-spin h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
          </div>

          {/* Search Results List */}
          {searchResults.length > 0 && (
            <div 
              className="mt-3 bg-surface overflow-hidden shadow-md animate-scaleIn divide-y divide-border-subtle/50"
              style={{ borderRadius: 'var(--radius-lg)' }}
            >
              {searchResults.map((u) => (
                <div key={u.id} className="p-4 flex items-center justify-between hover:bg-surface-hover/30 transition-[background-color] duration-150 ease-[var(--ease-out-expo)] gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt={u.username} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                        {getInitials(u.displayName || u.username)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground text-sm font-sans truncate">{u.displayName || u.username}</p>
                      <p className="text-xs text-muted font-mono truncate">@{u.username}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleBlockUser(u.id)}
                    disabled={isSaving}
                    aria-label={`Block ${u.displayName || u.username}`}
                    className="px-4 py-2.5 text-xs font-bold rounded-xl border border-error text-error hover:bg-error/10 transition-all cursor-pointer font-sans btn-press shrink-0"
                  >
                    Block
                  </button>
                </div>
              ))}
            </div>
          )}

          {searchQuery.trim().length >= 2 && searchResults.length === 0 && !isSearching && (
            <div 
              className="mt-3 bg-surface-hover/20 border border-dashed text-center"
              style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', borderColor: 'var(--color-border)' }}
            >
              <p className="text-xs text-muted font-sans">No users found matching "{searchQuery}"</p>
            </div>
          )}

          <p className="mt-4 text-xs text-muted leading-relaxed font-sans">
            Blocked users cannot view your profile, invite you to shared ledgers, or see your activity on the social feed.
          </p>
        </div>
      </section>

      {/* ── Footer Controls (Stagger Delay: 180ms) ──────────────────── */}
      <div 
        className="flex justify-end gap-4 mt-3 pt-1 animate-stagger-card"
        style={{ animationDelay: '180ms' }}
      >
        <button
          onClick={handleCancel}
          disabled={isSaving}
          className="px-6 py-3 font-semibold text-muted hover:text-foreground transition-all cursor-pointer font-sans btn-press disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveChanges}
          disabled={isSaving || !hasChanges}
          className="px-6 py-3 bg-primary rounded-lg font-semibold text-white text-sm hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer btn-press"
        >
          <div
            className={`flex items-center gap-2 transition-[filter,opacity] duration-100 ease-out ${
              isBlurring ? 'blur-[1px] opacity-70' : 'blur-0 opacity-100'
            }`}
          >
            {displayState === 'saving' ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Save Changes
              </>
            )}
          </div>
        </button>
      </div>
    </div>
  );
};

export default PrivacySettings;
