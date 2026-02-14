import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { X, Info, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";

const alertVariants = cva(
  "relative w-full rounded-2xl border px-5 py-4 text-sm transition-all duration-300 flex items-start gap-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-md",
  {
    variants: {
      variant: {
        default: "bg-card/80 border-border/50 text-foreground",
        info: "border-info/30 bg-linear-to-r from-info/10 to-transparent text-info ring-1 ring-info/15",
        success: "border-success/30 bg-linear-to-r from-success/10 to-transparent text-green-400 ring-1 ring-success/15",
        warning: "border-warning/30 bg-linear-to-r from-warning/10 to-transparent text-yellow-300 ring-1 ring-warning/15",
        error: "border-error/30 bg-linear-to-r from-error/10 to-transparent text-error ring-1 ring-error/15",
        destructive: "border-destructive/30 bg-linear-to-r from-destructive/10 to-transparent text-destructive ring-1 ring-destructive/15",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const defaultIcons: Record<string, React.ReactNode> = {
  default: <Info className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
  success: <CheckCircle className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  error: <XCircle className="h-4 w-4" />,
  destructive: <XCircle className="h-4 w-4" />,
};

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  icon?: React.ReactNode;
  title?: string;
  onClose?: () => void;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "default", icon, title, children, onClose, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <div className={cn(
        "shrink-0 p-2.5 rounded-xl flex items-center justify-center -mt-1 shadow-inner",
        variant === "error" || variant === "destructive" ? "bg-error/20 text-error" :
        variant === "success" ? "bg-success/20 text-success" :
        variant === "warning" ? "bg-warning/20 text-warning" :
        variant === "info" ? "bg-info/20 text-info" : "bg-muted/30"
      )}>
        {icon || defaultIcons[variant || "default"]}
      </div>
      <div className="flex-1 pt-0.5">
        {title && <AlertTitle>{title}</AlertTitle>}
        <AlertDescription>{children}</AlertDescription>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="shrink-0 p-2 -mr-2 -mt-1 rounded-full opacity-70 transition-all hover:opacity-100 hover:bg-muted/30 focus:outline-none"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription, alertVariants };
