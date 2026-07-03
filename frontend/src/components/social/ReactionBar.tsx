import { useState } from 'react';
import { useFeedStore } from '../../store/feedStore';
import ReactionPicker from './ReactionPicker';
import { ReactionGlyph } from './ReactionGlyph';
import { REACTION_LABELS } from './reactionMeta';
import ReactorsModal from './ReactorsModal';

interface ReactionBarProps {
  postId: string;
  reactions: Array<{
    emoji: string;
    count: number;
    userReacted: boolean;
  }>;
}

const ReactionBar: React.FC<ReactionBarProps> = ({ postId, reactions }) => {
  const reactToPost = useFeedStore((state) => state.reactToPost);
  const fetchPostReactors = useFeedStore((state) => state.fetchPostReactors);
  const [showReactors, setShowReactors] = useState(false);

  const total = reactions.reduce((sum, r) => sum + r.count, 0);
  const userReaction = reactions.find((r) => r.userReacted)?.emoji ?? null;
  const topEmojis = [...reactions].sort((a, b) => b.count - a.count).slice(0, 3).map((r) => r.emoji);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* React trigger with hover/long-press picker */}
      <ReactionPicker
        onReact={(emoji) => reactToPost(postId, emoji)}
        quickEmoji={userReaction ?? '👍'}
        triggerAriaLabel={userReaction ? `Your reaction: ${REACTION_LABELS[userReaction]}` : 'React'}
        triggerClassName={`group px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-bold transition-colors duration-150 active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 ${
          userReaction ? 'bg-primary/10 text-primary' : 'bg-surface-hover/60 hover:bg-surface-hover text-muted'
        }`}
      >
        <ReactionGlyph emoji={userReaction ?? '👍'} className="w-4 h-4" />
        <span>{userReaction ? REACTION_LABELS[userReaction] : 'React'}</span>
      </ReactionPicker>

      {/* Reaction summary — opens the "who reacted" modal */}
      {total > 0 && (
        <button
          type="button"
          onClick={() => setShowReactors(true)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full hover:bg-surface-hover transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label={`See who reacted (${total})`}
        >
          <span className="flex items-center">
            {topEmojis.map((emoji, i) => (
              <span
                key={emoji}
                className="w-5 h-5 rounded-full bg-surface flex items-center justify-center text-primary shadow-sm"
                style={{ marginLeft: i === 0 ? 0 : -6, zIndex: topEmojis.length - i }}
              >
                <ReactionGlyph emoji={emoji} className="w-3 h-3" />
              </span>
            ))}
          </span>
          <span className="text-xs font-semibold text-muted font-mono">{total}</span>
        </button>
      )}

      <ReactorsModal
        isOpen={showReactors}
        onClose={() => setShowReactors(false)}
        fetchReactors={() => fetchPostReactors(postId)}
      />
    </div>
  );
};

export default ReactionBar;
