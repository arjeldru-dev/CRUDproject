import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
}

const variantClasses: Record<string, string> = {
  primary:
    'bg-primary text-white font-semibold hover:bg-primary/90 shadow-sm hover:shadow-md active:scale-[0.98]',
  outline:
    'border border-border text-foreground font-semibold hover:bg-surface hover:border-primary/40 active:scale-[0.98]',
  ghost:
    'text-muted font-semibold hover:text-foreground hover:bg-surface active:scale-[0.98]',
};

const sizeClasses: Record<string, string> = {
  sm: 'px-4 py-2.5 text-sm rounded-lg',
  md: 'px-6 py-3 text-[0.9rem] rounded-xl',
  lg: 'px-8 py-4 text-base rounded-xl',
};

/**
 * Reusable button component with variant styling, loading spinner,
 * and auto-disable during loading states.
 */
const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  children,
  className = '',
  ...props
}) => {
  const isDisabled = disabled || isLoading;

  return (
    <button
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center gap-2 font-medium
        transition-all duration-200 ease-out cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
      {...props}
    >
      {isLoading && (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
};

export default Button;
