import React, { useState, useEffect, useCallback } from 'react';
import { Send } from 'lucide-react';
import axios from 'axios';
import type { Comment } from '../../store/feedStore';
import { useFeedStore } from '../../store/feedStore';
import { useAuthStore } from '../../store/authStore';
import { useGamificationStore } from '../../store/gamificationStore';
import api from '../../lib/api';
import Avatar from '../ui/Avatar';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { formatDistanceToNow } from 'date-fns';
import ReactionPicker from './ReactionPicker';
import { ReactionGlyph } from './ReactionGlyph';
import { REACTION_LABELS } from './reactionMeta';
import ReactorsModal from './ReactorsModal';

interface CommentThreadProps {
  postId: string;
  /** The post card element; used to scope the reactors-modal blur to this post. */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

/** Optimistic single-reaction transform for a comment. */
function applyCommentReaction(c: Comment, emoji: string): Comment {
  const reactions = c.reactions.map((r) => ({ ...r }));
  const dec = (e: string) => {
    const t = reactions.find((r) => r.emoji === e);
    if (t) t.count -= 1;
  };
  const inc = (e: string) => {
    const t = reactions.find((r) => r.emoji === e);
    if (t) t.count += 1;
    else reactions.push({ emoji: e, count: 1 });
  };

  let userReaction: string | null = c.userReaction;
  let reactionCount = c.reactionCount;

  if (c.userReaction === emoji) {
    dec(emoji);
    userReaction = null;
    reactionCount -= 1;
  } else {
    if (c.userReaction) {
      dec(c.userReaction);
      reactionCount -= 1;
    }
    inc(emoji);
    userReaction = emoji;
    reactionCount += 1;
  }

  return { ...c, reactions: reactions.filter((r) => r.count > 0), userReaction, reactionCount };
}

/** Reaction trigger (picker) + summary shown under a comment or reply. */
const CommentReactionControls: React.FC<{
  comment: Comment;
  onReact: (commentId: string, emoji: string) => void;
  onOpenReactors: (commentId: string) => void;
}> = ({ comment, onReact, onOpenReactors }) => {
  const userReaction = comment.userReaction;
  const topEmojis = [...comment.reactions].sort((a, b) => b.count - a.count).slice(0, 3).map((r) => r.emoji);

  return (
    <div className="flex items-center gap-2">
      <ReactionPicker
        onReact={(emoji) => onReact(comment.id, emoji)}
        quickEmoji={userReaction ?? '👍'}
        triggerAriaLabel={userReaction ? `Your reaction: ${REACTION_LABELS[userReaction]}` : 'React'}
        triggerClassName={`text-[11px] font-bold transition-all duration-100 ease-out active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 rounded px-1 select-none flex items-center gap-1 ${
          userReaction ? 'text-primary' : 'text-muted hover:text-primary'
        }`}
      >
        {userReaction ? (
          <>
            <ReactionGlyph emoji={userReaction} className="w-3.5 h-3.5" />
            {REACTION_LABELS[userReaction]}
          </>
        ) : (
          'Like'
        )}
      </ReactionPicker>

      {comment.reactionCount > 0 && (
        <button
          type="button"
          onClick={() => onOpenReactors(comment.id)}
          className="flex items-center gap-0.5 text-[10px] font-medium text-muted hover:text-primary transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 rounded px-0.5"
          aria-label={`See who reacted (${comment.reactionCount})`}
        >
          <span className="flex items-center">
            {topEmojis.map((emoji, i) => (
              <span
                key={emoji}
                className="w-4 h-4 rounded-full bg-background flex items-center justify-center text-primary"
                style={{ marginLeft: i === 0 ? 0 : -4, zIndex: topEmojis.length - i }}
              >
                <ReactionGlyph emoji={emoji} className="w-2.5 h-2.5" />
              </span>
            ))}
          </span>
          <span className="font-mono">{comment.reactionCount}</span>
        </button>
      )}
    </div>
  );
};

const CommentThread: React.FC<CommentThreadProps> = ({ postId, anchorRef }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [reactorsCommentId, setReactorsCommentId] = useState<string | null>(null);
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'danger';
    type?: 'alert' | 'confirm' | 'prompt';
    onConfirm: (val?: string) => void;
  } | null>(null);

  const addCommentToStore = useFeedStore((state) => state.addComment);
  const deleteCommentFromStore = useFeedStore((state) => state.deleteComment);
  const reactToCommentStore = useFeedStore((state) => state.reactToComment);
  const fetchCommentReactors = useFeedStore((state) => state.fetchCommentReactors);
  const user = useAuthStore((state) => state.user);
  const profile = useGamificationStore((state) => state.profile);

  const fetchComments = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const response = await api.get(`/feed/${postId}/comments`, { signal });
      setComments(response.data.comments);
    } catch (error: unknown) {
      if (axios.isCancel(error)) return;
      console.error('Failed to fetch comments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchComments(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const parentId = replyingTo?.id || null;
    const comment = await addCommentToStore(postId, newComment, parentId);
    if (comment) {
      setComments((prev) => [...prev, comment]);
      setNewComment('');
      setReplyingTo(null);
    }
    setIsSubmitting(false);
  };

  const handleReact = async (commentId: string, emoji: string) => {
    const rollback = comments;
    setComments((prev) => prev.map((c) => (c.id === commentId ? applyCommentReaction(c, emoji) : c)));

    const res = await reactToCommentStore(commentId, emoji);
    if (!res) {
      setComments(rollback);
      return;
    }
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, reactions: res.reactions, userReaction: res.userReaction, reactionCount: res.reactionCount }
          : c
      )
    );
  };

  const handleReplyClick = (comment: Comment) => {
    // If the comment already has a parentId, reply to the parent instead of nesting deeper
    const targetComment = comment.parentId ? comments.find((c) => c.id === comment.parentId) || comment : comment;
    setReplyingTo(targetComment);

    const input = document.getElementById(`comment-input-${postId}`) as HTMLInputElement;
    if (input) {
      input.focus();
    }
  };

  const handleDelete = async (commentId: string) => {
    setDialogConfig({
      isOpen: true,
      title: 'Delete Comment',
      message: 'Are you sure you want to delete this comment? This action cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
      type: 'confirm',
      onConfirm: async () => {
        setDialogConfig(null);
        try {
          await deleteCommentFromStore(postId, commentId);
          setComments((prev) => prev.filter((c) => c.id !== commentId && c.parentId !== commentId));
        } catch (error) {
          console.error('Failed to delete comment:', error);
        }
      },
    });
  };

  const topLevelComments = comments.filter((c) => !c.parentId);

  return (
    <div 
      className="bg-surface-hover/40 rounded-2xl mt-4 animate-fadeIn"
      style={{ padding: '20px' }}
    >
      {/* Comments List */}
      <div 
        className="comment-avatar-list space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-lg font-sans"
        tabIndex={0}
        aria-label="Comments list"
        role="region"
      >
        {isLoading && comments.length === 0 ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : comments.length === 0 ? (
          <p className="text-xs text-muted italic py-2 font-sans">No comments yet. Be the first!</p>
        ) : (
          topLevelComments.map((comment) => {
            const commentName = comment.user.displayName || comment.user.username || 'User';
            const replies = comments.filter((r) => r.parentId === comment.id);

            return (
              <div key={comment.id} className="space-y-3">
                {/* Top Level Comment */}
                <div className="flex items-start gap-3 group animate-slideDownIn">
                  <Avatar
                    src={comment.user.avatarUrl}
                    name={commentName}
                    size="sm"
                    className="!rounded-full border border-surface"
                    frameClass={comment.user.activeFrame?.cssClass || undefined}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="bg-surface p-3 rounded-xl rounded-tl-none shadow-sm inline-block max-w-full">
                      <div className="flex items-center justify-between gap-4 mb-0.5">
                        <span 
                          className="text-xs font-bold text-foreground font-display truncate max-w-[140px] block" 
                          title={commentName}
                        >
                          {commentName}
                        </span>
                        <span className="text-[10px] text-muted font-sans shrink-0">
                          {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap font-sans break-words overflow-wrap-break-word">
                        {comment.text}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 mt-1 ml-1 font-sans">
                      <CommentReactionControls
                        comment={comment}
                        onReact={handleReact}
                        onOpenReactors={setReactorsCommentId}
                      />
                      <button 
                        onClick={() => handleReplyClick(comment)}
                        className="text-[11px] font-bold text-muted hover:text-primary transition-all duration-100 ease-out active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 rounded px-1 select-none"
                      >
                        Reply
                      </button>
                      {comment.isOwn && (
                        <button
                          onClick={() => handleDelete(comment.id)}
                          className="text-[11px] font-bold text-error/80 hover:text-error transition-all duration-100 ease-out active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 rounded px-1 select-none"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Nested Replies */}
                {replies.length > 0 && (
                  <div className="ml-11 pl-4 border-l border-border/40 space-y-3">
                    {replies.map((reply) => {
                      const replyName = reply.user.displayName || reply.user.username || 'User';
                      return (
                        <div key={reply.id} className="flex items-start gap-2.5 group animate-slideDownIn">
                          <Avatar
                            src={reply.user.avatarUrl}
                            name={replyName}
                            size="xs"
                            className="!rounded-full border border-surface"
                            frameClass={reply.user.activeFrame?.cssClass || undefined}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="bg-surface/75 p-2.5 rounded-xl rounded-tl-none shadow-sm inline-block max-w-full">
                              <div className="flex items-center justify-between gap-4 mb-0.5">
                                <span 
                                  className="text-xs font-bold text-foreground font-display truncate max-w-[140px] block" 
                                  title={replyName}
                                >
                                  {replyName}
                                </span>
                                <span className="text-[10px] text-muted font-sans shrink-0">
                                  {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                                </span>
                              </div>
                              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap font-sans break-words overflow-wrap-break-word">
                                {reply.text}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 mt-1 ml-1 font-sans">
                              <CommentReactionControls
                                comment={reply}
                                onReact={handleReact}
                                onOpenReactors={setReactorsCommentId}
                              />
                              <button 
                                onClick={() => handleReplyClick(reply)}
                                className="text-[11px] font-bold text-muted hover:text-primary transition-all duration-100 ease-out active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 rounded px-1 select-none"
                              >
                                Reply
                              </button>
                              {reply.isOwn && (
                                <button
                                  onClick={() => handleDelete(reply.id)}
                                  className="text-[11px] font-bold text-error/80 hover:text-error transition-all duration-100 ease-out active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 rounded px-1 select-none"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* New Comment Input */}
      <div className="mt-4 pt-2">
        {replyingTo && (
          <div className="flex items-center justify-between bg-surface px-4 py-2 rounded-xl border border-border/40 text-xs font-sans animate-slideDownIn mb-2">
            <span className="text-muted">
              Replying to <span className="font-bold text-foreground">@{replyingTo.user.displayName || replyingTo.user.username}</span>
            </span>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="text-muted hover:text-foreground hover:scale-105 active:scale-95 transition-all p-0.5 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <Avatar 
            size="xs" 
            src={user?.avatarUrl} 
            name={user?.displayName || user?.email || 'User'} 
            className="!rounded-full"
            frameClass={profile?.activeFrame?.cssClass || undefined}
          />
          <div className="flex-1 relative">
            <input
              id={`comment-input-${postId}`}
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={replyingTo ? "Write a reply..." : "Write a comment..."}
              className="w-full bg-surface border border-border rounded-full h-[40px] px-4 pr-10 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted/60 text-foreground transition-all font-sans"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <button
              type="submit"
              disabled={!newComment.trim() || isSubmitting}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-primary disabled:text-muted hover:opacity-80 transition-all duration-100 ease-out active:scale-90 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 rounded-full p-0.5"
              aria-label="Send comment"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>

      <ReactorsModal
        isOpen={reactorsCommentId !== null}
        onClose={() => setReactorsCommentId(null)}
        fetchReactors={() => fetchCommentReactors(reactorsCommentId as string)}
        anchorRef={anchorRef}
      />

      {dialogConfig && (
        <ConfirmDialog
          isOpen={dialogConfig.isOpen}
          title={dialogConfig.title}
          message={dialogConfig.message}
          confirmLabel={dialogConfig.confirmLabel}
          cancelLabel={dialogConfig.cancelLabel}
          variant={dialogConfig.variant}
          type={dialogConfig.type}
          onConfirm={dialogConfig.onConfirm}
          onCancel={() => setDialogConfig(null)}
        />
      )}
    </div>
  );
};

export default CommentThread;
