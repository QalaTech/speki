import type { ButtonHTMLAttributes } from 'react';

type ActionButtonVariant = 'primary' | 'danger' | 'secondary' | 'success' | 'approve' | 'reject';

interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant: ActionButtonVariant;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md';
  type?: 'button' | 'submit' | 'reset';
}

const variantClasses: Record<ActionButtonVariant, string> = {
  primary: 'btn-glass-primary',
  danger: 'btn-glass-error',
  secondary: 'btn-ghost btn-outline',
  success: 'btn-glass-success',
  approve: 'btn-glass-success',
  reject: 'btn-glass-error',
};

const sizeClasses = {
  sm: 'btn-sm',
  md: 'btn-md',
};

export function ActionButton({
  variant,
  onClick,
  disabled = false,
  children,
  className = '',
  size = 'md',
  type = 'button',
  ...rest
}: ActionButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
