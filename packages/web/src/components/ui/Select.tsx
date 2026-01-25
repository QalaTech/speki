import { forwardRef, type SelectHTMLAttributes, type ReactNode } from 'react';

type SelectSize = 'xs' | 'sm' | 'md' | 'lg';
type SelectVariant = 'bordered' | 'ghost' | 'primary' | 'secondary' | 'accent' | 'info' | 'success' | 'warning' | 'error';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  selectSize?: SelectSize;
  variant?: SelectVariant;
  label?: string;
  helperText?: string;
  error?: string;
  fullWidth?: boolean;
  children: ReactNode;
}

const sizeClasses: Record<SelectSize, string> = {
  xs: 'select-xs',
  sm: 'select-sm',
  md: 'select-md',
  lg: 'select-lg',
};

const variantClasses: Record<SelectVariant, string> = {
  bordered: 'select-bordered',
  ghost: 'select-ghost',
  primary: 'select-primary',
  secondary: 'select-secondary',
  accent: 'select-accent',
  info: 'select-info',
  success: 'select-success',
  warning: 'select-warning',
  error: 'select-error',
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      selectSize = 'md',
      variant = 'bordered',
      label,
      helperText,
      error,
      fullWidth = true,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const selectElement = (
      <select
        ref={ref}
        className={`select ${variantClasses[variant]} ${sizeClasses[selectSize]} ${error ? 'select-error' : ''} ${fullWidth ? 'w-full' : ''} ${className}`}
        {...props}
      >
        {children}
      </select>
    );

    if (!label && !helperText && !error) {
      return selectElement;
    }

    return (
      <div className={`form-control ${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label className="label">
            <span className="label-text">{label}</span>
          </label>
        )}
        {selectElement}
        {(helperText || error) && (
          <label className="label">
            <span className={`label-text-alt ${error ? 'text-error' : ''}`}>
              {error || helperText}
            </span>
          </label>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
