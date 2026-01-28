import * as React from "react";
import { cn } from "../../lib/utils";

type SpinnerSize = "xs" | "sm" | "md" | "lg";

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
}

const spinnerSizeClasses: Record<SpinnerSize, string> = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

function Spinner({ size = "md", className = "" }: SpinnerProps) {
  return (
    <svg
      className={cn("animate-spin text-primary", spinnerSizeClasses[size], className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
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
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// Backward-compatible Loading component
type LoadingSize = "xs" | "sm" | "md" | "lg";
type LoadingVariant = "spinner" | "dots" | "ring" | "ball" | "bars" | "infinity";

interface LoadingProps {
  size?: LoadingSize;
  variant?: LoadingVariant;
  className?: string;
}

function Loading({ size = "md", variant = "spinner", className = "" }: LoadingProps) {
  // For backward compatibility, always use spinner now (DaisyUI variants removed)
  if (variant === "dots") {
    return (
      <div className={cn("flex gap-1", className)}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "rounded-full bg-primary animate-pulse",
              size === "xs" && "h-1 w-1",
              size === "sm" && "h-1.5 w-1.5",
              size === "md" && "h-2 w-2",
              size === "lg" && "h-3 w-3"
            )}
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    );
  }

  return <Spinner size={size} className={className} />;
}

interface LoadingOverlayProps {
  text?: string;
  size?: LoadingSize;
  variant?: LoadingVariant;
}

function LoadingOverlay({ text, size = "lg", variant = "spinner" }: LoadingOverlayProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <Loading size={size} variant={variant} />
      {text && <span className="text-muted-foreground">{text}</span>}
    </div>
  );
}

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "circle" | "rectangle";
  width?: string;
  height?: string;
}

function Skeleton({ className, variant = "text", width, height, ...props }: SkeletonProps) {
  const variantClasses = {
    text: "rounded-md",
    circle: "rounded-full",
    rectangle: "rounded-md",
  };

  return (
    <div
      className={cn(
        "animate-pulse bg-muted",
        variantClasses[variant],
        !height && variant === "text" && "h-4",
        !width && variant === "text" && "w-full",
        className
      )}
      style={{
        width: width || undefined,
        height: height || undefined,
      }}
      {...props}
    />
  );
}

export { Spinner, Loading, LoadingOverlay, Skeleton };
