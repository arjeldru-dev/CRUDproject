import React, { useState, useEffect } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import type { Comment } from '../../store/feedStore';
import { useFeedStore } from '../../store/feedStore';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';
import Avatar from '../ui/Avatar';
import { formatDistanceToNow } from 'date-fns';

interface CommentThreadProps {
  postId: string;
  initialCount: number;
}

const CommentThread: React.FC<CommentThreadProps> = ({ postId, initialCount }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addCommentToStore = useFeedStore((state) => state.addComment);
  const deleteCommentFromStore = useFeedStore((state) => state.deleteComment);
  const user = useAuthStore((state) => state.user);

  const fetchComments = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const response = await api.get(`/feed/${postId}/comments`);
      setComments(response.data.comments);
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && comments.length === 0) {
      fetchComments();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const comment = await addCommentToStore(postId, newComment);
    if (comment) {
      setComments((prev) => [...prev, comment]);
      setNewComment('');
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (commentId: string) => {
    if (!window.confirm('Delete this comment?')) return;
    await deleteCommentFromStore(postId, commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  return (
    <div className="mt-4 border-t border-border-subtle pt-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground transition-colors cursor-pointer"
      >
        <MessageSquare className="w-4 h-4" />
        {initialCount === 0 ? 'Add a comment' : `${initialCount} comment${initialCount === 1 ? '' : 's'}`}
      </button>

      {isOpen && (
        <div className="mt-4 space-y-4 animate-fadeIn">
          {/* Comments List */}
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {isLoading ? (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : comments.length === 0 ? (
              <p className="text-sm text-muted italic py-2">No comments yet. Be the first!</p>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="flex gap-3 group">
                  <Avatar
                    src={comment.user.avatarUrl || undefined}
                    name={comment.user.displayName || comment.user.username || 'User'}
                    size="xs"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="bg-surface rounded-2xl px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-bold text-foreground">
                          {comment.user.displayName || comment.user.username}
                        </span>
                        <span className="text-[10px] text-muted">
                          {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                        {comment.text}
                      </p>
                    </div>
                    {comment.isOwn && (
                      <button
                        onClick={() => handleDelete(comment.id)}
                        className="mt-1 ml-2 text-[10px] font-medium text-error opacity-0 group-hover:opacity-100 transition-opacity hover:underline cursor-pointer"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* New Comment Input */}
          <form onSubmit={handleSubmit} className="flex items-start gap-3 pt-2">
            <Avatar 
              size="xs" 
              src={user?.avatarUrl} 
              name={user?.displayName || user?.email || 'User'} 
            />
            <div className="flex-1 relative">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment..."
                className="w-full bg-surface border border-border-subtle rounded-2xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none min-h-[40px] max-h-[120px]"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <button
                type="submit"
                disabled={!newComment.trim() || isSubmitting}
                className="absolute right-2 bottom-2 p-1.5 text-primary disabled:text-muted hover:bg-primary/10 rounded-lg transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default CommentThread;
