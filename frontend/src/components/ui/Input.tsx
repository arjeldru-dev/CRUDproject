import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  leftIcon?: React.ReactNode;
  hideLabel?: boolean;
}

/**
 * Reusable input with label and error display.
 * Soft geometry styling with rounded corners and subtle borders.
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
  // Generate stable id from label if not provided
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className={`text-sm font-medium text-muted tracking-wide ${hideLabel ? 'sr-only' : ''}`}
      >
        {label}
      </label>
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-muted">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          className={`
            w-full py-3.5 pr-4 rounded-xl
            bg-surface border border-border-subtle text-foreground placeholder-muted/60 font-medium
            transition-all duration-200 ease-out
            focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10
            ${
              error
                ? 'border-error focus:border-error focus:ring-error/10'
                : 'hover:border-border'
            }
            ${className}
          `}
          style={{ paddingLeft: leftIcon ? '3.5rem' : '1.25rem', ...props.style }}
          {...props}
        />
      </div>
      {error && (
        <p className="text-xs text-error mt-0.5" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default Input;
