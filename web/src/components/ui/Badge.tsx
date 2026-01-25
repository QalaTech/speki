import type { ReactNode, HTMLAttributes } from 'react';

type BadgeVariant =
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'neutral';

type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  outline?: boolean;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'badge-success',
  error: 'badge-error',
  warning: 'badge-warning',
  info: 'badge-info',
  primary: 'badge-primary',
  secondary: 'badge-secondary',
  ghost: 'badge-ghost',
  neutral: 'badge-neutral',
};

const sizeClasses: Record<BadgeSize, string> = {
  xs: 'badge-xs',
  sm: 'badge-sm',
  md: 'badge-md',
  lg: 'badge-lg',
};

/**
 * Status badge variants mapped to DaisyUI badge classes
 */
export const statusVariants = {
  completed: 'success',
  done: 'success',
  passed: 'success',
  approved: 'success',
  ready: 'info',
  pending: 'ghost',
  running: 'primary',
  active: 'primary',
  blocked: 'error',
  failed: 'error',
  rejected: 'error',
  warning: 'warning',
  edited: 'warning',
  draft: 'neutral',
  reviewed: 'secondary',
  decomposed: 'info',
} as const;

export type StatusType = keyof typeof statusVariants;

export function Badge({
  variant = 'neutral',
  size = 'sm',
  outline = false,
  className = '',
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`badge ${variantClasses[variant]} ${sizeClasses[size]} ${outline ? 'badge-outline' : ''} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

/**
 * Convenience component for status badges
 */
interface StatusBadgeProps {
  status: StatusType | string;
  size?: BadgeSize;
  className?: string;
}

export function StatusBadge({ status, size = 'sm', className = '' }: StatusBadgeProps) {
  const variant = statusVariants[status as StatusType] || 'neutral';
  return (
    <Badge variant={variant} size={size} className={className}>
      {status}
    </Badge>
  );
}
