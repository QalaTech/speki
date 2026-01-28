import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 font-[Poppins,system-ui,sans-serif]",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow",
        primary: "border-transparent bg-primary text-primary-foreground shadow",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow",
        outline: "text-foreground",
        success: "border-transparent bg-success/20 text-success",
        error: "border-transparent bg-error/20 text-error",
        warning: "border-transparent bg-warning/20 text-warning-foreground",
        info: "border-transparent bg-info/20 text-info",
        ghost: "border-transparent bg-muted text-muted-foreground",
        neutral: "border-transparent bg-muted text-muted-foreground",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        xs: "px-1.5 py-0 text-[10px]",
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  outline?: boolean;
}

function Badge({ className, variant, size, outline, ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        badgeVariants({ variant, size }),
        outline && "bg-transparent",
        className
      )}
      {...props}
    />
  );
}

// Status variants mapping for StatusBadge
export const statusVariants = {
  completed: "success",
  done: "success",
  passed: "success",
  approved: "success",
  ready: "info",
  pending: "ghost",
  running: "primary",
  active: "primary",
  blocked: "error",
  failed: "error",
  rejected: "error",
  warning: "warning",
  edited: "warning",
  draft: "neutral",
  reviewed: "secondary",
  decomposed: "info",
} as const;

export type StatusType = keyof typeof statusVariants;

interface StatusBadgeProps {
  status: StatusType | string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

function StatusBadge({ status, size = "sm", className = "" }: StatusBadgeProps) {
  const variant = statusVariants[status as StatusType] || "neutral";
  return (
    <Badge variant={variant as BadgeProps["variant"]} size={size} className={className}>
      {status}
    </Badge>
  );
}

export { Badge, StatusBadge, badgeVariants };
