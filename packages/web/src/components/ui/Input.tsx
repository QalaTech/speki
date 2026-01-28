import * as React from "react";
import { cn } from "../../lib/utils";

type InputSize = "xs" | "sm" | "md" | "lg";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  inputSize?: InputSize;
  label?: string;
  helperText?: string;
  error?: string;
  fullWidth?: boolean;
}

const sizeClasses: Record<InputSize, string> = {
  xs: "h-7 text-xs",
  sm: "h-8 text-sm",
  md: "h-9 text-sm",
  lg: "h-10 text-base",
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      inputSize = "md",
      label,
      helperText,
      error,
      fullWidth = true,
      ...props
    },
    ref
  ) => {
    const inputElement = (
      <input
        type={type}
        className={cn(
          "flex w-full rounded-md border border-input bg-transparent px-3 py-1 shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          sizeClasses[inputSize],
          error && "border-error focus-visible:ring-error",
          fullWidth ? "w-full" : "",
          className
        )}
        ref={ref}
        {...props}
      />
    );

    if (!label && !helperText && !error) {
      return inputElement;
    }

    return (
      <div className={cn("space-y-2", fullWidth ? "w-full" : "")}>
        {label && (
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {label}
          </label>
        )}
        {inputElement}
        {(helperText || error) && (
          <p className={cn("text-xs", error ? "text-error" : "text-muted-foreground")}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
