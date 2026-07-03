import { ThumbsUp, Heart, Flame, Sparkles, Trophy, Smile } from 'lucide-react';
import type React from 'react';

/** The standard reaction set, shared across posts and comments. */
export const REACTION_EMOJIS = ['👍', '❤️', '🔥', '😮', '🏆', '🙏'] as const;

export const REACTION_LABELS: Record<string, string> = {
  '👍': 'Like',
  '❤️': 'Love',
  '🔥': 'Fire',
  '😮': 'Wow',
  '🏆': 'Trophy',
  '🙏': 'Thank you',
};

/** Maps each reaction to the app's monochrome lucide icon. */
export const REACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '👍': ThumbsUp,
  '❤️': Heart,
  '🔥': Flame,
  '😮': Sparkles,
  '🏆': Trophy,
  '🙏': Smile,
};
