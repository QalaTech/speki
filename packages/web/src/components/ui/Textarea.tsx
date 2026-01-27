import * as React from "react";
import { cn } from "../../lib/utils";

type TextareaSize = "xs" | "sm" | "md" | "lg";

export interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> {
  textareaSize?: TextareaSize;
  label?: string;
  helperText?: string;
  error?: string;
  fullWidth?: boolean;
}

const sizeClasses: Record<TextareaSize, string> = {
  xs: "text-xs min-h-[60px]",
  sm: "text-sm min-h-[80px]",
  md: "text-sm min-h-[100px]",
  lg: "text-base min-h-[120px]",
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      textareaSize = "md",
      label,
      helperText,
      error,
      fullWidth = true,
      ...props
    },
    ref
  ) => {
    const textareaElement = (
      <textarea
        className={cn(
          "flex w-full rounded-md border border-input bg-transparent px-3 py-2 shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y",
          sizeClasses[textareaSize],
          error && "border-error focus-visible:ring-error",
          fullWidth ? "w-full" : "",
          className
        )}
        ref={ref}
        {...props}
      />
    );

    if (!label && !helperText && !error) {
      return textareaElement;
    }

    return (
      <div className={cn("space-y-2", fullWidth ? "w-full" : "")}>
        {label && (
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {label}
          </label>
        )}
        {textareaElement}
        {(helperText || error) && (
          <p className={cn("text-xs", error ? "text-error" : "text-muted-foreground")}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

export { Textarea };
