import { create } from 'zustand';
import api from '../lib/api';

export interface GamificationProfile {
  currentStreak: number;
  longestStreak: number;
  totalPoints: number;
  lastStreakDate: string | null;
  activeFrame: {
    id: string;
    slug: string;
    name: string;
    cssClass: string;
  } | null;
}

export interface Badge {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconUrl: string;
  rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  unlockedAt: string;
}

export interface BadgeWithStatus {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconUrl: string;
  rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  pointsAwarded: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface FrameWithStatus {
  id: string;
  slug: string;
  name: string;
  cssClass: string;
  pointsRequired: number;
  unlocked: boolean;
  isActive: boolean;
}

export interface LeaderboardEntry {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  activeFrame: { cssClass: string } | null;
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  badgeCount: number;
  isCurrentUser: boolean;
  rank: number;
}

export interface ChallengeParticipant {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  accepted: boolean;
  failedAt: string | null;
  completedAt: string | null;
}

export interface ChallengeWithDetails {
  id: string;
  type: 'NO_OVERSPEND_WEEK' | 'NO_OVERSPEND_MONTH' | 'COFFEE_FREE_WEEK' | 'TRANSPORT_SAVER' | 'CUSTOM';
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  participantCount: number;
  participants: ChallengeParticipant[];
  isCreator: boolean;
  myStatus: 'pending' | 'active' | 'failed' | 'completed';
  daysRemaining: number;
}

export interface CreateChallengeDTO {
  type: 'NO_OVERSPEND_WEEK' | 'NO_OVERSPEND_MONTH' | 'COFFEE_FREE_WEEK' | 'TRANSPORT_SAVER' | 'CUSTOM';
  name?: string;
  description?: string;
  categoryId?: string;
  startDate: string; // ISO String or date format
  endDate: string;   // ISO String or date format
  invitedUserIds: string[];
}

interface GamificationState {
  profile: GamificationProfile | null;
  badges: Badge[];
  allBadges: BadgeWithStatus[];
  availableFrames: FrameWithStatus[];
  leaderboard: LeaderboardEntry[];
  challenges: ChallengeWithDetails[];
  isLoading: boolean;
  isProfileLoading: boolean;
  isLeaderboardLoading: boolean;
  isChallengesLoading: boolean;
  error: string | null;

  fetchProfile: () => Promise<void>;
  fetchLeaderboard: () => Promise<void>;
  fetchChallenges: (status?: string) => Promise<void>;
  setActiveFrame: (frameId: string) => Promise<boolean>;
  createChallenge: (data: CreateChallengeDTO) => Promise<boolean>;
  joinChallenge: (challengeId: string) => Promise<boolean>;
  cancelChallenge: (challengeId: string) => Promise<boolean>;
}

export const useGamificationStore = create<GamificationState>((set, get) => ({
  profile: null,
  badges: [],
  allBadges: [],
  availableFrames: [],
  leaderboard: [],
  challenges: [],
  isLoading: false,
  isProfileLoading: false,
  isLeaderboardLoading: false,
  isChallengesLoading: false,
  error: null,

  fetchProfile: async () => {
    set({ isProfileLoading: true, isLoading: true, error: null });
    try {
      const response = await api.get('/gamification/profile');
      set({
        profile: response.data.profile,
        badges: response.data.badges,
        allBadges: response.data.allBadges,
        availableFrames: response.data.availableFrames,
      });
    } catch (err: any) {
      set({
        error: err.response?.data?.error || 'Failed to fetch gamification profile',
      });
    } finally {
      set((state) => ({
        isProfileLoading: false,
        isLoading: state.isLeaderboardLoading || state.isChallengesLoading,
      }));
    }
  },

  fetchLeaderboard: async () => {
    set({ isLeaderboardLoading: true, isLoading: true, error: null });
    try {
      const response = await api.get('/gamification/leaderboard');
      set({
        leaderboard: response.data.leaderboard,
      });
    } catch (err: any) {
      set({
        error: err.response?.data?.error || 'Failed to fetch leaderboard',
      });
    } finally {
      set((state) => ({
        isLeaderboardLoading: false,
        isLoading: state.isProfileLoading || state.isChallengesLoading,
      }));
    }
  },

  fetchChallenges: async (status?: string) => {
    set({ isChallengesLoading: true, isLoading: true, error: null });
    try {
      const statusParam = status ? `?status=${status}` : '';
      const response = await api.get(`/gamification/challenges${statusParam}`);
      set({
        challenges: response.data.challenges,
      });
    } catch (err: any) {
      set({
        error: err.response?.data?.error || 'Failed to fetch challenges',
      });
    } finally {
      set((state) => ({
        isChallengesLoading: false,
        isLoading: state.isProfileLoading || state.isLeaderboardLoading,
      }));
    }
  },

  setActiveFrame: async (frameId: string) => {
    set({ error: null });
    try {
      const response = await api.put('/gamification/frame', { frameId });
      const activeFrame = response.data.activeFrame;
      
      const { profile, availableFrames } = get();
      if (profile) {
        set({
          profile: {
            ...profile,
            activeFrame,
          },
          availableFrames: availableFrames.map(f => ({
            ...f,
            isActive: f.id === frameId,
          })),
        });
      }
      return true;
    } catch (err: any) {
      set({
        error: err.response?.data?.error || 'Failed to update active avatar frame',
      });
      return false;
    }
  },

  createChallenge: async (data: CreateChallengeDTO) => {
    set({ error: null });
    try {
      await api.post('/gamification/challenges', data);
      return true;
    } catch (err: any) {
      set({
        error: err.response?.data?.error || 'Failed to create challenge',
      });
      return false;
    }
  },

  joinChallenge: async (challengeId: string) => {
    set({ error: null });
    try {
      await api.post(`/gamification/challenges/${challengeId}/join`);
      return true;
    } catch (err: any) {
      set({
        error: err.response?.data?.error || 'Failed to join challenge',
      });
      return false;
    }
  },

  cancelChallenge: async (challengeId: string) => {
    set({ error: null });
    try {
      await api.delete(`/gamification/challenges/${challengeId}`);
      return true;
    } catch (err: any) {
      set({
        error: err.response?.data?.error || 'Failed to cancel challenge',
      });
      return false;
    }
  },
}));
