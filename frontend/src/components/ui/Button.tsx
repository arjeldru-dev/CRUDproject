import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
}

const variantClasses: Record<string, string> = {
  primary:
    'bg-primary text-white font-semibold hover:bg-primary-hover',
  outline:
    'border border-border text-foreground font-semibold hover:border-primary hover:text-primary',
  ghost:
    'text-muted font-semibold hover:text-foreground hover:bg-surface-hover',
  danger:
    'bg-error text-white font-semibold hover:bg-error/90',
};

const sizeClasses: Record<string, string> = {
  sm: 'px-3.5 py-2 md:py-1.5 text-xs rounded-md gap-1.5 min-h-[40px] md:min-h-[32px]',
  md: 'px-4 py-3 md:py-2 text-sm rounded-lg gap-2 min-h-[44px] md:min-h-[38px]',
  lg: 'px-6 py-4 md:py-3 text-base rounded-lg gap-2 min-h-[48px]',
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
        inline-flex items-center justify-center font-medium
        btn-press cursor-pointer select-none
        disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
      {...props}
    >
      {isLoading && (
        <svg
          className="h-4 w-4"
          style={{ animation: 'spin 0.6s linear infinite' }}
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
