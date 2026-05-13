import React from 'react';
import { useFeedStore } from '../../store/feedStore';

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

  const emojis = ['👍', '❤️', '😮'];

  return (
    <div className="flex flex-wrap items-center gap-2 mt-4">
      {/* Active Reactions */}
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => reactToPost(postId, r.emoji)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
            r.userReacted
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'bg-surface border border-border-subtle text-muted hover:text-foreground'
          }`}
        >
          <span>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}

      {/* Add Reaction Picker (Simplified for V1) */}
      <div className="flex items-center gap-1 ml-auto">
        {emojis.map((emoji) => {
          const hasReacted = reactions.find((r) => r.emoji === emoji)?.userReacted;
          if (hasReacted) return null;

          return (
            <button
              key={emoji}
              onClick={() => reactToPost(postId, emoji)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface transition-colors cursor-pointer text-lg grayscale hover:grayscale-0"
              title={`React with ${emoji}`}
            >
              {emoji}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ReactionBar;
