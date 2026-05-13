import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { TrendingUp, CreditCard, CheckCircle, Target, MoreHorizontal, Trash2, Eye, EyeOff, Lock, Edit3 } from 'lucide-react';
import { useFeedStore, type FeedPost } from '../../store/feedStore';
import { useAuthStore } from '../../store/authStore';
import Avatar from '../ui/Avatar';
import ReactionBar from './ReactionBar';
import CommentThread from './CommentThread';

interface FeedPostCardProps {
  post: FeedPost;
}

const FeedPostCard: React.FC<FeedPostCardProps> = ({ post }) => {
  const { user } = useAuthStore();
  const { deletePost, togglePostPrivacy, updatePostMessage } = useFeedStore();
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editMessage, setEditMessage] = useState('');
  
  const isAuthor = user?.id === post.userId;
  const isAllowedFriend = user?.id === post.content.friendUserId && post.content.allowFriendToPrivate;
  const canManage = isAuthor || isAllowedFriend;

  const getIcon = () => {
    switch (post.type) {
      case 'EXPENSE_ADDED':
        return <TrendingUp className="w-4 h-4 text-error" />;
      case 'SETTLEMENT_COMPLETED':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'BUDGET_MILESTONE':
        return <Target className="w-4 h-4 text-primary" />;
      default:
        return <CreditCard className="w-4 h-4 text-muted" />;
    }
  };

  const displayName = post.user.displayName || post.user.username || 'User';

  return (
    <div className="bg-background-card border border-border-subtle rounded-[32px] p-6 shadow-sm hover:shadow-md transition-all duration-300 animate-fadeInFast">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Avatar
            src={post.user.avatarUrl || undefined}
            name={displayName}
            size="md"
          />
          <div>
            <h3 className="font-display font-semibold text-foreground text-base">
              {displayName}
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
              <span>•</span>
              <div className="flex items-center gap-1">
                {getIcon()}
                <span className="capitalize">{post.type.replace('_', ' ').toLowerCase()}</span>
              </div>
              {post.content.isPrivate && (
                <>
                  <span>•</span>
                  <div className="flex items-center gap-1 text-secondary" title="Private">
                    <Lock className="w-3 h-3" />
                    <span>Private</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {canManage && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 text-muted hover:text-foreground rounded-full hover:bg-surface transition-colors"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 mt-1 w-48 bg-surface border border-border rounded-xl shadow-lg z-20 overflow-hidden">
                  {isAuthor && (
                    <button
                      onClick={() => {
                        setEditMessage(post.content.message || '');
                        setIsEditing(true);
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-background transition-colors text-left"
                    >
                      <Edit3 className="w-4 h-4 text-muted" />
                      Edit Post
                    </button>
                  )}
                  <button
                    onClick={() => {
                      togglePostPrivacy(post.id);
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-background transition-colors text-left"
                  >
                    {post.content.isPrivate ? (
                      <>
                        <Eye className="w-4 h-4 text-muted" />
                        Make Public
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-4 h-4 text-muted" />
                        Make Private
                      </>
                    )}
                  </button>
                  {isAuthor && (
                    <button
                      onClick={async () => {
                        if (window.confirm('Are you sure you want to delete this post?')) {
                          try {
                            await deletePost(post.id);
                          } catch (err: any) {
                            alert(err.response?.data?.error || 'Failed to delete post');
                          }
                        }
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-error hover:bg-error/10 transition-colors text-left"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Post
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="space-y-3">
        <div>
          {post.type !== 'BUDGET_MILESTONE' && (
            <h4 className="font-display font-bold text-2xl tracking-tight text-foreground">
              {post.content.categoryName || (post.type === 'SETTLEMENT_COMPLETED' ? 'Settlement' : 'Transaction')}
            </h4>
          )}
          <p className="text-foreground/80 text-[1.05rem] mt-1 leading-relaxed">
            {post.type === 'BUDGET_MILESTONE' 
              ? post.content.description 
              : (post.content.description.includes(' — ') 
                  ? post.content.description.split(' — ')[1] 
                  : post.content.description)
            }
          </p>
        </div>

        {isEditing ? (
          <div className="mt-3 space-y-2">
            <textarea
              value={editMessage}
              onChange={(e) => setEditMessage(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border-subtle text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary resize-none"
              rows={2}
              placeholder="What is this for?"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  updatePostMessage(post.id, editMessage);
                  setIsEditing(false);
                }}
                className="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors shadow-sm"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          post.content.message && (
            <div className="mt-3 p-4 bg-background rounded-2xl border border-border-subtle">
              <p className="text-sm text-foreground/80 italic">"{post.content.message}"</p>
            </div>
          )
        )}

        {/* Milestone Detail */}
        {post.type === 'BUDGET_MILESTONE' && post.content.percentage && (
          <div className="w-full bg-surface rounded-full h-2.5 mt-4 overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ${
                post.content.percentage >= 100 ? 'bg-error' : 'bg-primary'
              }`}
              style={{ width: `${Math.min(100, post.content.percentage)}%` }}
            ></div>
          </div>
        )}
      </div>

      {/* Interactions */}
      <ReactionBar postId={post.id} reactions={post.reactions} />
      <CommentThread postId={post.id} initialCount={post.commentCount} />
    </div>
  );
};

export default FeedPostCard;
