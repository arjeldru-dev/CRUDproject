import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

/**
 * Reusable input with label and error display.
 * High-contrast design for accessibility (WCAG AA).
 */
const Input: React.FC<InputProps> = ({
  label,
  error,
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
        className="text-sm font-medium text-zinc-300"
      >
        {label}
      </label>
      <input
        id={inputId}
        className={`
          w-full px-4 py-2.5 rounded-xl
          bg-white/5 border text-white placeholder-zinc-500
          transition-all duration-200 ease-out
          focus:outline-none focus:ring-2 focus:ring-offset-0
          ${
            error
              ? 'border-red-500/60 focus:ring-red-500/40 focus:border-red-500'
              : 'border-white/10 focus:ring-indigo-500/40 focus:border-indigo-500/60 hover:border-white/20'
          }
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="text-xs text-red-400 mt-0.5" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default Input;
