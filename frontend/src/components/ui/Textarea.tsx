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
 * Matches Input component styling.
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
          className={`text-xs font-semibold text-muted uppercase tracking-wider ${hideLabel ? 'sr-only' : ''}`}
        >
          {label}
        </label>
        {maxChars && (
          <span
            className={`text-xs font-medium tabular-nums transition-colors ${
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
          w-full px-3.5 py-3 rounded-lg resize-none
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
        {...props}
      />
      {error && (
        <p className="text-xs text-error font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default Textarea;
