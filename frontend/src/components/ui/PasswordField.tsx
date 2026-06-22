import React, { useState, useRef } from 'react';
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
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');

  const handleTogglePassword = () => {
    setShowPassword((prev) => !prev);
    // Restore focus and force a repaint on iOS WebKit to avoid cursor issues and visual glitches
    setTimeout(() => {
      if (passwordRef.current) {
        const input = passwordRef.current;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        
        // Force rendering reflow on WebKit/Safari
        void input.offsetHeight;
        
        input.focus();
        if (start !== null && end !== null) {
          input.setSelectionRange(start, end);
        }
      }
    }, 0);
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
          style={{ paddingLeft: '2.75rem', ...style }}
          {...props}
        />
        <button
          type="button"
          onClick={handleTogglePassword}
          onMouseDown={(e) => e.preventDefault()}
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
