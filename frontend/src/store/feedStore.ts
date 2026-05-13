import { create } from 'zustand';
import api from '../lib/api';

export interface FeedPost {
  id: string;
  userId: string;
  user: {
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  type: 'EXPENSE_ADDED' | 'SETTLEMENT_COMPLETED' | 'GROUP_SPLIT_CREATED' | 'BUDGET_MILESTONE';
  content: {
    description: string;
    amount?: number;
    categoryName?: string;
    friendName?: string;
    transactionId?: string;
    percentage?: number;
    message?: string;
    isPrivate?: boolean;
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

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  text: string;
  createdAt: string;
  isOwn: boolean;
  user: {
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
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
  addComment: (postId: string, text: string) => Promise<Comment | null>;
  deleteComment: (postId: string, commentId: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  updatePostMessage: (postId: string, message: string) => Promise<void>;
  togglePostPrivacy: (postId: string) => Promise<void>;
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
      set({ isLoading: true, error: null });
    } else {
      set({ isFetchingNextPage: true, error: null });
    }

    try {
      const cursorParam = reset ? '' : nextCursor ? `?cursor=${nextCursor}` : '';
      const response = await api.get(`/feed${cursorParam}`);
      
      const newPosts = response.data.posts;
      const newNextCursor = response.data.nextCursor;

      set({
        posts: reset ? newPosts : [...posts, ...newPosts],
        nextCursor: newNextCursor,
        isLoading: false,
        isFetchingNextPage: false,
      });
    } catch (err: any) {
      set({
        error: err.response?.data?.error || 'Failed to fetch feed',
        isLoading: false,
        isFetchingNextPage: false,
      });
    }
  },

  reactToPost: async (postId: string, emoji: string) => {
    // Optimistic update
    const { posts } = get();
    const originalPosts = [...posts];

    const updatedPosts = posts.map(post => {
      if (post.id === postId) {
        const reactions = [...post.reactions];
        const reactionIndex = reactions.findIndex(r => r.emoji === emoji);

        if (reactionIndex > -1) {
          const reaction = reactions[reactionIndex];
          if (reaction.userReacted) {
            // Remove
            reaction.count--;
            reaction.userReacted = false;
            if (reaction.count === 0) {
              reactions.splice(reactionIndex, 1);
            }
          } else {
            // Add to existing emoji count
            reaction.count++;
            reaction.userReacted = true;
          }
        } else {
          // New emoji reaction
          reactions.push({ emoji, count: 1, userReacted: true });
        }
        return { ...post, reactions };
      }
      return post;
    });

    set({ posts: updatedPosts });

    try {
      await api.post(`/feed/${postId}/react`, { emoji });
    } catch (err) {
      // Rollback on error
      set({ posts: originalPosts });
      console.error('Failed to react to post:', err);
    }
  },

  addComment: async (postId: string, text: string) => {
    try {
      const response = await api.post(`/feed/${postId}/comment`, { text });
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
    } catch (err) {
      console.error('Failed to add comment:', err);
      return null;
    }
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
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  },

  deletePost: async (postId: string) => {
    try {
      await api.delete(`/feed/${postId}`);
      const { posts } = get();
      set({ posts: posts.filter(p => p.id !== postId) });
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
      console.error('Failed to toggle post privacy:', err);
      throw err;
    }
  },
}));
