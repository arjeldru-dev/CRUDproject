import { create } from 'zustand';
import api from '../lib/api';

export interface FeedPost {
  id: string;
  userId: string;
  user: {
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    activeFrame?: { cssClass: string } | null;
  };
  type: 'EXPENSE_ADDED' | 'SETTLEMENT_COMPLETED' | 'GROUP_SPLIT_CREATED' | 'BUDGET_MILESTONE' | 'CHALLENGE_COMPLETED' | 'BADGE_EARNED' | 'STREAK_MILESTONE';
  content: {
    description: string;
    amount?: number;
    categoryName?: string;
    friendName?: string;
    transactionId?: string;
    percentage?: number;
    message?: string;
    isPrivate?: boolean;
    friendUserId?: string | null;
    allowFriendToPrivate?: boolean;
    badgeSlug?: string;
    badgeName?: string;
    challengeId?: string;
    challengeName?: string;
    streakDays?: number;
    involvedFriendUserIds?: string[];
  };
  isPublic: boolean;
  createdAt: string;
  reactions: Array<{
    emoji: string;
    count: number;
    userReacted: boolean;
  }>;
  commentCount: number;
}

export interface ReactionCount {
  emoji: string;
  count: number;
}

export interface Reactor {
  emoji: string;
  user: {
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    activeFrame?: { cssClass: string } | null;
  };
}

export interface CommentReactionResult {
  userReaction: string | null;
  reactions: ReactionCount[];
  reactionCount: number;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  parentId?: string | null;
  text: string;
  createdAt: string;
  isOwn: boolean;
  reactions: ReactionCount[];
  userReaction: string | null;
  reactionCount: number;
  user: {
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    activeFrame?: { cssClass: string } | null;
  };
}

interface FeedState {
  posts: FeedPost[];
  nextCursor: string | null;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  error: string | null;

  fetchFeed: (reset?: boolean) => Promise<void>;
  reactToPost: (postId: string, emoji: string) => Promise<void>;
  addComment: (postId: string, text: string, parentId?: string | null) => Promise<Comment | null>;
  reactToComment: (commentId: string, emoji: string) => Promise<CommentReactionResult | null>;
  fetchPostReactors: (postId: string) => Promise<Reactor[]>;
  fetchCommentReactors: (commentId: string) => Promise<Reactor[]>;
  deleteComment: (postId: string, commentId: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  updatePostMessage: (postId: string, message: string) => Promise<void>;
  togglePostPrivacy: (postId: string) => Promise<void>;
}

let fetchAbortController: AbortController | null = null;

/**
 * Apply a single-reaction-per-user change to a post's reaction list:
 * tapping your current emoji removes it; tapping another switches to it.
 */
function applySingleReaction(
  reactions: FeedPost['reactions'],
  emoji: string
): FeedPost['reactions'] {
  const list = reactions.map((r) => ({ ...r }));
  const current = list.find((r) => r.userReacted);

  if (current && current.emoji === emoji) {
    current.count -= 1;
    current.userReacted = false;
    return list.filter((r) => r.count > 0);
  }
  if (current) {
    current.count -= 1;
    current.userReacted = false;
  }
  const target = list.find((r) => r.emoji === emoji);
  if (target) {
    target.count += 1;
    target.userReacted = true;
  } else {
    list.push({ emoji, count: 1, userReacted: true });
  }
  return list.filter((r) => r.count > 0);
}

export const useFeedStore = create<FeedState>((set, get) => ({
  posts: [],
  nextCursor: null,
  isLoading: false,
  isFetchingNextPage: false,
  error: null,

  fetchFeed: async (reset = false) => {
    const { nextCursor, posts, isLoading, isFetchingNextPage } = get();
    
    if (isLoading || (isFetchingNextPage && !reset)) return;

    if (reset) {
      if (fetchAbortController) {
        fetchAbortController.abort();
      }
      set({ isLoading: true, error: null });
    } else {
      set({ isFetchingNextPage: true, error: null });
    }

    const controller = new AbortController();
    fetchAbortController = controller;

    try {
      const cursorParam = reset ? '' : nextCursor ? `?cursor=${nextCursor}` : '';
      const response = await api.get(`/feed${cursorParam}`, {
        signal: controller.signal,
      });
      
      if (fetchAbortController === controller) {
        const newPosts = response.data.posts;
        const newNextCursor = response.data.nextCursor;

        set({
          posts: reset ? newPosts : [...posts, ...newPosts],
          nextCursor: newNextCursor,
          isLoading: false,
          isFetchingNextPage: false,
        });
      }
    } catch (err: unknown) {
      const error = err as { name?: string; code?: string; response?: { data?: { error?: string } } };
      if (error.name === 'CanceledError' || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        return;
      }
      if (fetchAbortController === controller) {
        set({
          error: error.response?.data?.error || 'Failed to fetch feed',
          isLoading: false,
          isFetchingNextPage: false,
        });
      }
    } finally {
      if (fetchAbortController === controller) {
        fetchAbortController = null;
      }
    }
  },

  reactToPost: async (postId: string, emoji: string) => {
    // Optimistic update
    const { posts } = get();
    const originalPosts = [...posts];

    const updatedPosts = posts.map(post =>
      post.id === postId ? { ...post, reactions: applySingleReaction(post.reactions, emoji) } : post
    );

    set({ posts: updatedPosts });

    try {
      await api.post(`/feed/${postId}/react`, { emoji });
    } catch (err: unknown) {
      // Rollback on error
      set({ posts: originalPosts });
      console.error('Failed to react to post:', err);
    }
  },

  addComment: async (postId: string, text: string, parentId?: string | null) => {
    try {
      const response = await api.post(`/feed/${postId}/comment`, { text, parentId });
      const newComment = response.data.comment;

      // Update comment count in posts list
      const { posts } = get();
      const updatedPosts = posts.map(post => {
        if (post.id === postId) {
          return { ...post, commentCount: post.commentCount + 1 };
        }
        return post;
      });

      set({ posts: updatedPosts });
      return newComment;
    } catch (err: unknown) {
      console.error('Failed to add comment:', err);
      return null;
    }
  },

  reactToComment: async (commentId: string, emoji: string) => {
    try {
      const response = await api.post(`/feed/comment/${commentId}/react`, { emoji });
      return response.data as CommentReactionResult;
    } catch (err: unknown) {
      console.error('Failed to react to comment:', err);
      return null;
    }
  },

  fetchPostReactors: async (postId: string) => {
    const response = await api.get(`/feed/${postId}/reactions`);
    return (response.data.reactors || []) as Reactor[];
  },

  fetchCommentReactors: async (commentId: string) => {
    const response = await api.get(`/feed/comment/${commentId}/reactions`);
    return (response.data.reactors || []) as Reactor[];
  },

  deleteComment: async (postId: string, commentId: string) => {
    try {
      await api.delete(`/feed/comment/${commentId}`);

      // Update comment count in posts list
      const { posts } = get();
      const updatedPosts = posts.map(post => {
        if (post.id === postId) {
          return { ...post, commentCount: Math.max(0, post.commentCount - 1) };
        }
        return post;
      });

      set({ posts: updatedPosts });
    } catch (err: unknown) {
      console.error('Failed to delete comment:', err);
    }
  },

  deletePost: async (postId: string) => {
    try {
      await api.delete(`/feed/${postId}`);
      const { posts } = get();
      set({ posts: posts.filter(p => p.id !== postId) });
    } catch (err: unknown) {
      console.error('Failed to delete post:', err);
      throw err;
    }
  },

  updatePostMessage: async (postId: string, message: string) => {
    try {
      const response = await api.patch(`/feed/${postId}`, { message });
      const newMessage = response.data.message;
      const { posts } = get();
      set({
        posts: posts.map(p => {
          if (p.id === postId) {
            return {
              ...p,
              content: { ...p.content, message: newMessage }
            };
          }
          return p;
        })
      });
    } catch (err: unknown) {
      console.error('Failed to update post message:', err);
      throw err;
    }
  },

  togglePostPrivacy: async (postId: string) => {
    try {
      const response = await api.patch(`/feed/${postId}/privacy`);
      const isPrivate = response.data.isPrivate;
      const { posts } = get();
      set({
        posts: posts.map(p => {
          if (p.id === postId) {
            return {
              ...p,
              content: { ...p.content, isPrivate }
            };
          }
          return p;
        })
      });
    } catch (err: unknown) {
      console.error('Failed to toggle post privacy:', err);
      throw err;
    }
  },
}));
