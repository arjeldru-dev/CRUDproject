import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hideLabel?: boolean;
  /** Show a character counter (pass the max length). */
  maxChars?: number;
}

/**
 * Reusable textarea with label, error display, and optional character counter.
 * Soft geometry styling matching the Input component.
 */
const Textarea: React.FC<TextareaProps> = ({
  label,
  error,
  hideLabel,
  maxChars,
  id,
  value,
  className = '',
  ...props
}) => {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');
  const charCount = typeof value === 'string' ? value.length : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor={inputId}
          className={`text-sm font-medium text-muted tracking-wide ${hideLabel ? 'sr-only' : ''}`}
        >
          {label}
        </label>
        {maxChars && (
          <span
            className={`text-xs font-medium transition-colors ${
              charCount > maxChars ? 'text-error' : 'text-muted'
            }`}
          >
            {charCount}/{maxChars}
          </span>
        )}
      </div>
      <textarea
        id={inputId}
        value={value}
        className={`
          w-full px-5 py-3.5 rounded-xl resize-none
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
        {...props}
      />
      {error && (
        <p className="text-xs text-error mt-0.5" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default Textarea;
