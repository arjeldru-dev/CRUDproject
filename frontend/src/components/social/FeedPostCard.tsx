import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { TrendingUp, CreditCard, CheckCircle, Target, MoreHorizontal, Trash2, Eye, EyeOff, Lock, Edit3, Award, Trophy, Flame, MessageSquare } from 'lucide-react';
import { useFeedStore, type FeedPost } from '../../store/feedStore';
import { useAuthStore } from '../../store/authStore';
import Avatar from '../ui/Avatar';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import ReactionBar from './ReactionBar';
import CommentThread from './CommentThread';

interface FeedPostCardProps {
  post: FeedPost;
  index: number;
}

const FeedPostCard: React.FC<FeedPostCardProps> = React.memo(({ post, index }) => {
  const { user } = useAuthStore();
  const { deletePost, togglePostPrivacy, updatePostMessage } = useFeedStore();
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editMessage, setEditMessage] = useState('');
  const [showComments, setShowComments] = useState(false);
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
  
  const isAuthor = user?.id === post.userId;
  const isAllowedFriend = (user?.id === post.content.friendUserId || 
    (user?.id && Array.isArray(post.content.involvedFriendUserIds) && post.content.involvedFriendUserIds.includes(user.id))) && 
    post.content.allowFriendToPrivate;
  const canManage = isAuthor || isAllowedFriend;

  const getIcon = () => {
    switch (post.type) {
      case 'EXPENSE_ADDED':
        return <TrendingUp className="w-4 h-4 text-primary" />;
      case 'SETTLEMENT_COMPLETED':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'BUDGET_MILESTONE':
        return <Target className="w-4 h-4 text-warning" />;
      case 'BADGE_EARNED':
        return <Award className="w-4 h-4 text-warning" />;
      case 'CHALLENGE_COMPLETED':
        return <Trophy className="w-4 h-4 text-warning" />;
      case 'STREAK_MILESTONE':
        return <Flame className="w-4 h-4 text-secondary" />;
      default:
        return <CreditCard className="w-4 h-4 text-muted" />;
    }
  };

  const getBadgeStyle = () => {
    switch (post.type) {
      case 'SETTLEMENT_COMPLETED':
        return 'bg-success/10 text-success';
      case 'BUDGET_MILESTONE':
      case 'BADGE_EARNED':
      case 'CHALLENGE_COMPLETED':
      case 'STREAK_MILESTONE':
        return 'bg-warning/10 text-warning';
      default:
        return 'bg-primary/10 text-primary';
    }
  };

  const displayName = post.user.displayName || post.user.username || 'User';

  const highlightDescription = (text: string) => {
    const pesoRegex = /(₱\d+(?:,\d+)*(?:\.\d+)?)/g;
    const parts = text.split(pesoRegex);
    return parts.map((part, index) => {
      if (pesoRegex.test(part)) {
        return (
          <span key={index} className="font-mono font-bold text-primary">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const descriptionText = ['BUDGET_MILESTONE', 'BADGE_EARNED', 'CHALLENGE_COMPLETED', 'STREAK_MILESTONE'].includes(post.type)
    ? post.content.description 
    : (post.content.description.includes(' — ') 
        ? post.content.description.split(' — ')[1] 
        : post.content.description);

  return (
    <article 
      className="bg-surface rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md animate-stagger-card"
      style={{ 
        padding: '24px',
        animationDelay: `${Math.min(index * 60, 360)}ms` 
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="shrink-0">
            <Avatar
              src={post.user.avatarUrl}
              name={displayName}
              size="md"
              className="!rounded-full"
              frameClass={post.user.activeFrame?.cssClass || undefined}
            />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm leading-tight">
              {displayName}
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
              <span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
              <span>•</span>
              <div className="flex items-center gap-1">
                {getIcon()}
                <span className="capitalize">{post.type.replace(/_/g, ' ').toLowerCase()}</span>
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

        <div className="flex items-center gap-2">
          {/* Post Type Badge */}
          <span className={`px-3 py-1 text-[11px] font-bold rounded-full uppercase tracking-wider ${getBadgeStyle()}`}>
            {post.type.replace(/_ADDED|_COMPLETED|_EARNED|_MILESTONE/g, '').toLowerCase()}
          </span>

          {canManage && (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 text-muted hover:text-foreground rounded-lg hover:bg-surface-hover transition-transform duration-100 ease-out active:scale-90 cursor-pointer"
                aria-label="Post actions"
                aria-haspopup="true"
                aria-expanded={showMenu}
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 mt-1 w-48 bg-surface border border-border rounded-xl shadow-lg z-20 overflow-hidden origin-top-right animate-scaleIn">
                    {isAuthor && (
                      <button
                        onClick={() => {
                          setEditMessage(post.content.message || '');
                          setIsEditing(true);
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-surface-hover transition-all duration-100 active:scale-[0.98] text-left cursor-pointer"
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
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-surface-hover transition-all duration-100 active:scale-[0.98] text-left cursor-pointer"
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
                        onClick={() => {
                          setShowMenu(false);
                          setDialogConfig({
                            isOpen: true,
                            title: 'Delete Post',
                            message: 'Are you sure you want to delete this post? This action cannot be undone.',
                            confirmLabel: 'Delete',
                            cancelLabel: 'Cancel',
                            variant: 'danger',
                            type: 'confirm',
                            onConfirm: async () => {
                              setDialogConfig(null);
                              try {
                                await deletePost(post.id);
                              } catch (err: unknown) {
                                const error = err as any;
                                setDialogConfig({
                                  isOpen: true,
                                  title: 'Error',
                                  message: error.response?.data?.error || 'Failed to delete post',
                                  type: 'alert',
                                  onConfirm: () => setDialogConfig(null),
                                });
                              }
                            },
                          });
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-error hover:bg-error/10 transition-all duration-100 active:scale-[0.98] text-left cursor-pointer font-medium"
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
      </div>

      {/* Content */}
      <div className="space-y-3">
        <div className="flex gap-4 items-start">
          <div className="flex-1 min-w-0">
            {post.type !== 'BUDGET_MILESTONE' && !['BADGE_EARNED', 'CHALLENGE_COMPLETED', 'STREAK_MILESTONE'].includes(post.type) && (
              <h4 className="font-display font-semibold text-lg text-foreground mb-1 truncate">
                {post.content.categoryName || (post.type === 'SETTLEMENT_COMPLETED' ? 'Settlement' : 'Transaction')}
              </h4>
            )}
            <p className="font-sans text-foreground/90 text-sm sm:text-base leading-relaxed break-words overflow-wrap-break-word">
              {highlightDescription(descriptionText)}
            </p>
          </div>
        </div>

        {post.type === 'BADGE_EARNED' && post.content.badgeName && (
          <div className="mt-2 flex items-center gap-3 p-4 bg-warning/5 border border-warning/15 rounded-lg animate-scaleIn">
            <Award className="w-6 h-6 text-warning shrink-0" />
            <div className="min-w-0">
              <span className="font-bold text-warning text-xs block uppercase tracking-wider animate-fadeIn">Badge Unlocked!</span>
              <span className="font-display font-bold text-foreground text-base sm:text-lg block truncate">{post.content.badgeName}</span>
            </div>
          </div>
        )}

        {post.type === 'CHALLENGE_COMPLETED' && post.content.challengeName && (
          <div className="mt-2 flex items-center gap-3 p-4 bg-success/5 border border-success/15 rounded-lg animate-scaleIn">
            <Trophy className="w-6 h-6 text-success shrink-0" />
            <div className="min-w-0">
              <span className="font-bold text-success text-xs block uppercase tracking-wider animate-fadeIn">Challenge Completed!</span>
              <span className="font-display font-bold text-foreground text-base sm:text-lg block truncate">{post.content.challengeName}</span>
            </div>
          </div>
        )}

        {post.type === 'STREAK_MILESTONE' && post.content.streakDays && (
          <div className="mt-2 flex items-center gap-3 p-4 bg-error/5 border border-error/15 rounded-lg animate-scaleIn">
            <Flame className="w-6 h-6 text-error shrink-0" />
            <div className="min-w-0">
              <span className="font-bold text-error text-xs block uppercase tracking-wider animate-fadeIn">Streak Milestone!</span>
              <span className="font-display font-bold text-foreground text-base sm:text-lg block truncate">{post.content.streakDays}-Day Streak Reached</span>
            </div>
          </div>
        )}

        {isEditing ? (
          <div className="mt-3 space-y-2 animate-slideDownIn">
            <textarea
              value={editMessage}
              onChange={(e) => setEditMessage(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-surface-hover border border-border-subtle text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-all duration-150"
              rows={2}
              placeholder="What is this for?"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-all duration-120 active:scale-95 cursor-pointer rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  updatePostMessage(post.id, editMessage);
                  setIsEditing(false);
                }}
                className="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary-hover transition-all duration-120 active:scale-95 shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          post.content.message && (
            <div className="mt-2.5 p-3.5 bg-surface-hover rounded-xl border border-border-subtle animate-fadeIn">
              <p className="text-sm text-foreground/80 italic font-sans break-words overflow-wrap-break-word">"{post.content.message}"</p>
            </div>
          )
        )}

        {/* Milestone Progress Bar */}
        {post.type === 'BUDGET_MILESTONE' && post.content.percentage && (
          <div className="w-full bg-background rounded-full h-1.5 mt-4 overflow-hidden animate-fadeIn">
            <div
              className={`h-full transition-all duration-1000 ${
                post.content.percentage >= 100 ? 'bg-error' : 'bg-secondary'
              }`}
              style={{ width: `${Math.min(100, post.content.percentage)}%` }}
            ></div>
          </div>
        )}
      </div>

      {/* Interactions Row (Reactions and Comments button aligned together) */}
      <div className="flex items-center justify-between gap-6 border-t border-border-subtle pt-3.5 mt-5">
        <ReactionBar postId={post.id} reactions={post.reactions} />
        
        <button
          onClick={() => setShowComments(!showComments)}
          className="text-secondary text-[14px] font-bold hover:underline transition-all duration-100 active:scale-95 cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-secondary/30 rounded-lg px-2 py-1 select-none shrink-0"
          aria-expanded={showComments}
        >
          <MessageSquare className="w-[16px] h-[16px] text-secondary" />
          <span className="font-display font-bold">
            {post.commentCount === 0 ? (
              <span className="hidden sm:inline">Add comment</span>
            ) : (
              <>
                <span className="hidden sm:inline">
                  {post.commentCount} comment{post.commentCount === 1 ? '' : 's'}
                </span>
                <span className="inline sm:hidden">{post.commentCount}</span>
              </>
            )}
          </span>
        </button>
      </div>

      {/* Expanded Comment Box */}
      {showComments && (
        <CommentThread postId={post.id} />
      )}
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
    </article>
  );
}, (prevProps, nextProps) => {
  const prevReactions = prevProps.post.reactions;
  const nextReactions = nextProps.post.reactions;
  const reactionsEqual = prevReactions.length === nextReactions.length &&
    prevReactions.every((r, idx) => {
      const nr = nextReactions[idx];
      return nr && r.emoji === nr.emoji && r.count === nr.count && r.userReacted === nr.userReacted;
    });

  return prevProps.index === nextProps.index &&
    prevProps.post.id === nextProps.post.id &&
    prevProps.post.type === nextProps.post.type &&
    prevProps.post.createdAt === nextProps.post.createdAt &&
    prevProps.post.commentCount === nextProps.post.commentCount &&
    reactionsEqual &&
    prevProps.post.content.message === nextProps.post.content.message &&
    prevProps.post.content.isPrivate === nextProps.post.content.isPrivate &&
    prevProps.post.user.avatarUrl === nextProps.post.user.avatarUrl &&
    prevProps.post.user.displayName === nextProps.post.user.displayName &&
    prevProps.post.user.activeFrame?.cssClass === nextProps.post.user.activeFrame?.cssClass;
});

export default FeedPostCard;
