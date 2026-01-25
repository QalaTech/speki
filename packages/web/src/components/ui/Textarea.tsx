import { forwardRef, type TextareaHTMLAttributes } from 'react';

type TextareaSize = 'xs' | 'sm' | 'md' | 'lg';
type TextareaVariant = 'bordered' | 'ghost' | 'primary' | 'secondary' | 'accent' | 'info' | 'success' | 'warning' | 'error';

interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  textareaSize?: TextareaSize;
  variant?: TextareaVariant;
  label?: string;
  helperText?: string;
  error?: string;
  fullWidth?: boolean;
}

const sizeClasses: Record<TextareaSize, string> = {
  xs: 'textarea-xs',
  sm: 'textarea-sm',
  md: 'textarea-md',
  lg: 'textarea-lg',
};

const variantClasses: Record<TextareaVariant, string> = {
  bordered: 'textarea-bordered',
  ghost: 'textarea-ghost',
  primary: 'textarea-primary',
  secondary: 'textarea-secondary',
  accent: 'textarea-accent',
  info: 'textarea-info',
  success: 'textarea-success',
  warning: 'textarea-warning',
  error: 'textarea-error',
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      textareaSize = 'md',
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
    const textareaElement = (
      <textarea
        ref={ref}
        className={`textarea ${variantClasses[variant]} ${sizeClasses[textareaSize]} ${error ? 'textarea-error' : ''} ${fullWidth ? 'w-full' : ''} ${className}`}
        {...props}
      />
    );

    if (!label && !helperText && !error) {
      return textareaElement;
    }

    return (
      <div className={`form-control ${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label className="label">
            <span className="label-text">{label}</span>
          </label>
        )}
        {textareaElement}
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

Textarea.displayName = 'Textarea';
