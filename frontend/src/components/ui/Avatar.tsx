import React from 'react';

interface AvatarProps {
  /** URL of the avatar image. Falls back to initials if null/undefined. */
  src?: string | null;
  /** User's display name or email — used for generating initials. */
  name: string;
  /** Size variant of the avatar. */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Additional CSS classes. */
  className?: string;
  /** Click handler (used for avatar upload trigger). */
  onClick?: () => void;
  /** CSS classes for avatar frame ring (from AvatarFrame.cssClass) */
  frameClass?: string;
}

const sizeMap: Record<string, { container: string; text: string }> = {
  xs: { container: 'w-6 h-6', text: 'text-[10px]' },
  sm: { container: 'w-8 h-8', text: 'text-xs' },
  md: { container: 'w-10 h-10', text: 'text-sm' },
  lg: { container: 'w-16 h-16', text: 'text-xl' },
  xl: { container: 'w-24 h-24', text: 'text-3xl' },
};

/** Deterministic color from a string — produces a pleasant hue. */
function getInitialsColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

/** Extract up to 2 initials from a name. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (name.slice(0, 2)).toUpperCase();
}

/**
 * Reusable avatar component.
 * Renders the user's uploaded avatar image, or falls back to a
 * colored circle with initials (CSS-based, no image needed).
 */
const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  className = '',
  onClick,
  frameClass,
}) => {
  const { container, text } = sizeMap[size];
  const initials = getInitials(name);
  const bgColor = getInitialsColor(name);

  const baseClasses = `
    rounded-xl flex items-center justify-center overflow-hidden
    font-display font-semibold select-none shrink-0
    transition-all duration-200
    ${onClick && !frameClass ? 'cursor-pointer hover:opacity-80 active:scale-95' : ''}
    ${container} ${text} ${className}
  `;

  const renderAvatar = () => {
    if (src) {
      return (
        <div className={baseClasses} onClick={frameClass ? undefined : onClick}>
          <img
            src={src}
            alt={`${name}'s avatar`}
            className="w-full h-full object-cover"
            onError={(e) => {
              // On load error, hide image so initials fallback shows
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      );
    }

    return (
      <div
        className={baseClasses}
        onClick={frameClass ? undefined : onClick}
        style={{ backgroundColor: bgColor }}
        aria-label={`${name}'s avatar`}
      >
        <span className="text-white drop-shadow-sm">{initials}</span>
      </div>
    );
  };

  if (frameClass) {
    return (
      <div
        className={`relative inline-flex rounded-xl p-[2px] transition-all duration-200 ${frameClass} ${
          onClick ? 'cursor-pointer hover:opacity-80 active:scale-95' : ''
        }`}
        onClick={onClick}
      >
        {renderAvatar()}
      </div>
    );
  }

  return renderAvatar();
};

export default Avatar;
