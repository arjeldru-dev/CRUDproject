import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  leftIcon?: React.ReactNode;
  hideLabel?: boolean;
}

/**
 * Reusable input with label and error display.
 * Consistent 48px height, 8px radius, single focus ring.
 */
const Input: React.FC<InputProps> = ({
  label,
  error,
  leftIcon,
  hideLabel,
  id,
  className = '',
  ...props
}) => {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className={`text-xs font-semibold text-muted uppercase tracking-wider ${hideLabel ? 'sr-only' : ''}`}
      >
        {label}
      </label>
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-muted">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          className={`
            w-full h-12 pr-4 rounded-lg
            bg-surface border border-border text-foreground placeholder-muted/50 font-medium text-sm
            transition-all duration-150
            focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15
            ${
              error
                ? 'border-error focus:border-error focus:ring-error/15'
                : 'hover:border-muted/30'
            }
            ${className}
          `}
          style={{ paddingLeft: leftIcon ? '2.75rem' : '0.875rem', ...props.style }}
          {...props}
        />
      </div>
      {error && (
        <p className="text-xs text-error font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default Input;
