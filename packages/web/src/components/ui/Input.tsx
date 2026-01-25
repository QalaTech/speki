import { forwardRef, type InputHTMLAttributes } from 'react';

type InputSize = 'xs' | 'sm' | 'md' | 'lg';
type InputVariant = 'bordered' | 'ghost' | 'primary' | 'secondary' | 'accent' | 'info' | 'success' | 'warning' | 'error';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  inputSize?: InputSize;
  variant?: InputVariant;
  label?: string;
  helperText?: string;
  error?: string;
  fullWidth?: boolean;
}

const sizeClasses: Record<InputSize, string> = {
  xs: 'input-xs',
  sm: 'input-sm',
  md: 'input-md',
  lg: 'input-lg',
};

const variantClasses: Record<InputVariant, string> = {
  bordered: 'input-bordered',
  ghost: 'input-ghost',
  primary: 'input-primary',
  secondary: 'input-secondary',
  accent: 'input-accent',
  info: 'input-info',
  success: 'input-success',
  warning: 'input-warning',
  error: 'input-error',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      inputSize = 'md',
      variant = 'bordered',
      label,
      helperText,
      error,
      fullWidth = true,
      className = '',
      ...props
    },
    ref
  ) => {
    const inputElement = (
      <input
        ref={ref}
        className={`input ${variantClasses[variant]} ${sizeClasses[inputSize]} ${error ? 'input-error' : ''} ${fullWidth ? 'w-full' : ''} ${className}`}
        {...props}
      />
    );

    if (!label && !helperText && !error) {
      return inputElement;
    }

    return (
      <div className={`form-control ${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label className="label">
            <span className="label-text">{label}</span>
          </label>
        )}
        {inputElement}
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

Input.displayName = 'Input';
