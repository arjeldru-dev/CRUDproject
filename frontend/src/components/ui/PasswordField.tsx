import React, { useState, useRef, useEffect } from 'react';
import { LockSimple, Eye, EyeSlash } from '@phosphor-icons/react';

interface PasswordFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
  autoComplete?: string;
  extraElement?: React.ReactNode;
}

/**
 * Reusable password input field with built-in show/hide visual toggle.
 * Integrates WebKit reflow fix, selection index retention, and touch event bubbling preservation.
 */
const PasswordField: React.FC<PasswordFieldProps> = ({
  label,
  error,
  autoComplete = 'current-password',
  id,
  className = '',
  disabled,
  style,
  extraElement,
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');

  // Cancel any pending animation frames on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const handleTogglePassword = () => {
    const input = passwordRef.current;
    if (!input) return;

    // Check if the input is currently focused
    const isFocused = document.activeElement === input;
    const isCurrentlyVisible = showPassword;

    // Cancel any pending toggle animation from rapid taps
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    // Blur BEFORE state change — outside the updater, and ONLY if currently focused
    if (isCurrentlyVisible && isFocused) {
      // Safari WebKit fix: when switching BACK to type="password",
      // Safari's compositor doesn't always re-engage dot masking.
      // We force a full re-render cycle by blurring to detach Safari's
      // credential/autofill attachment, only if the user is currently editing.
      input.blur();
    }

    setShowPassword((prev) => !prev);

    // Use double-RAF to ensure React's DOM commit + Safari's paint cycle both complete
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (input) {
          // Read cursor position inside the RAF callback to prevent stale closures
          const cursorStart = input.selectionStart;
          const cursorEnd = input.selectionEnd;

          // Force Safari to fully re-composite the input by toggling a style
          // that affects the text rendering layer (not just layout)
          const originalOpacity = input.style.opacity;
          input.style.opacity = '0.99';
          // Force synchronous style recalculation
          void input.offsetHeight;
          input.style.opacity = originalOpacity;

          // Only restore focus if the input was focused when clicked
          if (isFocused) {
            input.focus();
            if (cursorStart !== null && cursorEnd !== null) {
              try {
                input.setSelectionRange(cursorStart, cursorEnd);
              } catch {
                // setSelectionRange can throw on type="password" in some WebKit builds
              }
            }
          }
        }
      });
    });
  };

  return (
    <div className="flex flex-col gap-2.5 group">
      <label
        htmlFor={inputId}
        className="text-xs font-bold text-muted uppercase tracking-wider font-sans"
      >
        {label}
      </label>
      <div className="relative w-full group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none w-5 h-5 flex items-center justify-center group-focus-within:text-primary transition-colors duration-150">
          <LockSimple size={18} />
        </div>
        <input
          id={inputId}
          ref={passwordRef}
          type={showPassword ? 'text' : 'password'}
          autoComplete={autoComplete}
          disabled={disabled}
          className={`w-full h-14 bg-surface-hover border rounded-lg pr-12 text-foreground text-sm placeholder:text-muted/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-150 font-sans disabled:opacity-60 disabled:cursor-not-allowed ${
            error ? 'border-error focus:border-error focus:ring-error/20' : 'border-border'
          } ${className}`}
          style={{
            paddingLeft: '2.75rem',
            WebkitTextSecurity: showPassword ? 'none' : 'disc',
            ...style,
          } as React.CSSProperties}
          {...props}
        />
        <button
          type="button"
          onClick={handleTogglePassword}
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          disabled={disabled}
          className="absolute right-1 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-muted hover:text-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-md transition-[transform,color] duration-150 ease-out active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? (
            <EyeSlash size={18} className="pointer-events-none" />
          ) : (
            <Eye size={18} className="pointer-events-none" />
          )}
        </button>
      </div>
      {extraElement}
      {error && (
        <p className="text-xs text-error font-medium font-sans mt-0.5 break-words" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default PasswordField;
