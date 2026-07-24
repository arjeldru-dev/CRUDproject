import React from 'react';

interface AvatarProps {
  /** URL of the avatar image. Falls back to initials if null/undefined. */
  src?: string | null;
  /** User's display name or email — used for generating initials. */
  name: string;
  /** Size variant of the avatar. */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Additional CSS classes. */
  className?: string;
  /** Click handler (used for avatar upload trigger). */
  onClick?: () => void;
  /** CSS classes for avatar frame ring (from AvatarFrame.cssClass) */
  frameClass?: string;
}

const sizeMap: Record<string, { container: string; text: string }> = {
  xs: { container: 'w-6 h-6', text: 'text-[9px]' },
  sm: { container: 'w-8 h-8', text: 'text-[10px]' },
  md: { container: 'w-10 h-10', text: 'text-xs' },
  lg: { container: 'w-16 h-16', text: 'text-lg' },
  xl: { container: 'w-24 h-24', text: 'text-2xl' },
  '2xl': { container: 'w-32 h-32', text: 'text-4xl' },
};

const frameStyleMap: Record<string, string> = {
  'ring-2 ring-amber-600': 'avatar-frame-bronze',
  'ring-2 ring-gray-400': 'avatar-frame-silver',
  'ring-2 ring-yellow-400': 'avatar-frame-gold',
  'ring-2 ring-emerald-400 shadow-emerald-400/40 shadow-lg': 'avatar-frame-emerald',
  'ring-2 ring-orange-500 animate-pulse': 'avatar-frame-fire',
  'ring-4 ring-primary shadow-primary/30 shadow-xl': 'avatar-frame-diamond',
};

const paddingMap: Record<string, string> = {
  xs: 'p-[1.5px]',
  sm: 'p-[2px]',
  md: 'p-[2.5px]',
  lg: 'p-[3.5px]',
  xl: 'p-[4.5px]',
  '2xl': 'p-[5.5px]',
};

/** Deterministic color from a string — produces a pleasant hue. */
function getInitialsColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 50%)`;
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
 * colored circle with initials.
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
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    setImgError(false);
  }, [src]);

  const baseClasses = `
    rounded-full flex items-center justify-center overflow-hidden
    bg-surface font-display font-semibold select-none shrink-0
    transition-all duration-150
    ${container} ${text} ${className}
  `;

  const renderAvatarContent = () => {
    if (src && !imgError) {
      return (
        <div className={baseClasses}>
          <img
            src={src}
            alt={`${name}'s avatar`}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        </div>
      );
    }

    return (
      <div
        className={baseClasses}
        style={{ backgroundColor: bgColor }}
        aria-label={`${name}'s avatar`}
      >
        <span className="text-white/90">{initials}</span>
      </div>
    );
  };

  // Resolve the theme class:
  //  - new frames store the semantic class directly (e.g. "avatar-frame-blush") → use as-is
  //  - the original 6 frames store Tailwind strings → map via frameStyleMap
  const themeClass = frameClass
    ? frameClass.startsWith('avatar-frame-')
      ? frameClass
      : frameStyleMap[frameClass] || frameClass
    : '';

  // Continuous frame animation is suppressed in dense lists (xs/sm) for
  // performance; those sizes render the static gradient only. md+ animates.
  const isSmallSize = size === 'xs' || size === 'sm';

  const framedContent = frameClass ? (
    <div
      className={`avatar-frame ${isSmallSize ? 'frame-static' : ''} relative inline-flex rounded-full transition-all duration-150 ${
        paddingMap[size] || 'p-[2.5px]'
      } ${themeClass}`}
    >
      {renderAvatarContent()}
    </div>
  ) : (
    renderAvatarContent()
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="p-0 m-0 border-0 bg-transparent text-left outline-none cursor-pointer rounded-full avatar-interactive-btn focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 shrink-0 inline-flex"
        aria-label={`Upload or edit avatar for ${name}`}
      >
        {framedContent}
      </button>
    );
  }

  return framedContent;
};

export default Avatar;
