import React from 'react';
import { REACTION_ICONS } from './reactionMeta';

/** Renders a reaction as the app's monochrome lucide icon (falls back to the glyph). */
export const ReactionGlyph: React.FC<{ emoji: string; className?: string }> = ({ emoji, className }) => {
  const Icon = REACTION_ICONS[emoji];
  return Icon ? <Icon className={className ?? 'w-4 h-4'} /> : <span className={className}>{emoji}</span>;
};

export default ReactionGlyph;
