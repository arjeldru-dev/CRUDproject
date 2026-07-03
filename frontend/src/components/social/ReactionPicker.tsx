import React, { useCallback, useEffect, useRef, useState } from 'react';
import { REACTION_EMOJIS, REACTION_LABELS } from './reactionMeta';
import { ReactionGlyph } from './ReactionGlyph';

interface ReactionPickerProps {
  onReact: (emoji: string) => void;
  /** Emoji applied on a plain tap/click of the trigger (usually the user's current reaction, else 👍). */
  quickEmoji?: string;
  triggerClassName?: string;
  triggerAriaLabel?: string;
  children: React.ReactNode;
  align?: 'left' | 'right';
}

/**
 * Reaction control: a trigger that reacts with a default emoji on tap, and
 * reveals a flyout of all reactions on hover (pointer devices) or long-press
 * (touch devices).
 */
const ReactionPicker: React.FC<ReactionPickerProps> = ({
  onReact,
  quickEmoji = '👍',
  triggerClassName,
  triggerAriaLabel = 'React',
  children,
  align = 'left',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const canHover = useRef(
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
      : false
  );

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  useEffect(() => () => clearTimers(), []);

  // Close on outside click / Escape (mainly for touch-opened flyouts).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleMouseEnter = () => {
    if (!canHover.current) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => setOpen(true), 220);
  };

  const handleMouseLeave = () => {
    if (!canHover.current) return;
    if (openTimer.current) clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 200);
  };

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      suppressClick.current = true;
      setOpen(true);
    }, 380);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleTriggerClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (open) {
      setOpen(false);
      return;
    }
    onReact(quickEmoji);
  };

  const handleSelect = useCallback(
    (emoji: string) => {
      suppressClick.current = true;
      setOpen(false);
      onReact(emoji);
    },
    [onReact]
  );

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={handleTriggerClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        className={triggerClassName}
        aria-label={triggerAriaLabel}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {children}
      </button>

      {open && (
        <div
          className={`absolute bottom-full mb-2 z-30 flex items-center gap-1 p-1.5 rounded-full bg-surface shadow-lg animate-scaleIn origin-bottom ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          role="menu"
          aria-label="Choose a reaction"
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleSelect(emoji)}
              className="w-9 h-9 flex items-center justify-center rounded-full text-muted hover:text-primary hover:bg-surface-hover [@media(hover:hover)]:hover:scale-125 transition-[transform,color,background-color] duration-150 ease-out active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
              title={REACTION_LABELS[emoji]}
              aria-label={REACTION_LABELS[emoji]}
              role="menuitem"
            >
              <ReactionGlyph emoji={emoji} className="w-5 h-5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReactionPicker;
