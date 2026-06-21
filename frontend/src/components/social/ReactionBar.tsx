import { ThumbsUp, Heart, Flame, Sparkles, Trophy, Smile } from 'lucide-react';
import { useFeedStore } from '../../store/feedStore';

interface ReactionBarProps {
  postId: string;
  reactions: Array<{
    emoji: string;
    count: number;
    userReacted: boolean;
  }>;
}

const emojiLabels: Record<string, string> = {
  '👍': 'Like',
  '❤️': 'Love',
  '🔥': 'Fire',
  '😮': 'Wow',
  '🏆': 'Trophy',
  '🙏': 'Thank you',
};

const getReactionIcon = (emoji: string, isActive: boolean) => {
  const cls = `w-4 h-4 transition-colors ${isActive ? 'text-primary' : 'text-muted group-hover:text-foreground'}`;
  switch (emoji) {
    case '👍': return <ThumbsUp className={cls} />;
    case '❤️': return <Heart className={cls} />;
    case '🔥': return <Flame className={cls} />;
    case '😮': return <Sparkles className={cls} />;
    case '🏆': return <Trophy className={cls} />;
    case '🙏': return <Smile className={cls} />;
    default: return null;
  }
};

const ReactionBar: React.FC<ReactionBarProps> = ({ postId, reactions }) => {
  const reactToPost = useFeedStore((state) => state.reactToPost);

  const emojis = ['👍', '❤️', '🔥', '😮', '🏆', '🙏'];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Active & Inactive Reaction Pills */}
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => reactToPost(postId, r.emoji)}
          className={`group px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-bold transition-all duration-120 ease-out [@media(hover:hover)_and_(pointer:fine)]:hover:scale-105 active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 ${
            r.userReacted
              ? 'bg-primary/10 text-primary'
              : 'bg-surface-hover/60 hover:bg-surface-hover text-foreground'
          }`}
          aria-label={`${r.userReacted ? 'Remove' : 'React with'} ${emojiLabels[r.emoji] || 'reaction'}, count: ${r.count}`}
        >
          <span className="flex items-center justify-center shrink-0">
            {getReactionIcon(r.emoji, r.userReacted)}
          </span>
          <span className="font-mono">{r.count}</span>
        </button>
      ))}

      {/* Add Reaction Picker (Inline) */}
      <div className="flex items-center gap-1 ml-2.5">
        {emojis.map((emoji) => {
          const hasReacted = reactions.find((r) => r.emoji === emoji)?.userReacted;
          if (hasReacted) return null;

          return (
            <button
              key={emoji}
              onClick={() => reactToPost(postId, emoji)}
              className="w-10 h-10 flex items-center justify-center rounded-full [@media(hover:hover)_and_(pointer:fine)]:hover:scale-120 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-surface-hover transition-all duration-120 ease-out active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/30 text-base grayscale [@media(hover:hover)_and_(pointer:fine)]:hover:grayscale-0"
              title={`React with ${emojiLabels[emoji] || 'reaction'}`}
              aria-label={`React with ${emojiLabels[emoji] || 'reaction'}`}
            >
              {getReactionIcon(emoji, false)}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ReactionBar;
