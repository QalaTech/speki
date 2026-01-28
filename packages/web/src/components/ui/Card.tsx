import * as React from "react";
import { cn } from "../../lib/utils";

// ShadCN-style Card components
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: "default" | "bordered" | "compact" | "side";
    image?: string;
    imageAlt?: string;
  }
>(({ className, variant = "default", image, imageAlt, children, ...props }, ref) => {
  const variantClasses = {
    default: "",
    bordered: "border border-border",
    compact: "p-4",
    side: "flex-row",
  };

  return (
    <div
      ref={ref}
      className={cn(
        "rounded-xl bg-card text-card-foreground shadow-sm",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {image && (
        <figure className="overflow-hidden rounded-t-xl">
          <img src={image} alt={imageAlt || ""} className="w-full object-cover" />
        </figure>
      )}
      {children}
    </div>
  );
});
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

// Backward-compatible aliases
const CardBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6", className)} {...props} />
));
CardBody.displayName = "CardBody";

interface CardActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  justify?: "start" | "center" | "end";
}

const CardActions = React.forwardRef<HTMLDivElement, CardActionsProps>(
  ({ className, justify = "end", ...props }, ref) => {
    const justifyClass = {
      start: "justify-start",
      center: "justify-center",
      end: "justify-end",
    }[justify];

    return (
      <div
        ref={ref}
        className={cn("flex items-center gap-2 p-6 pt-0", justifyClass, className)}
        {...props}
      />
    );
  }
);
CardActions.displayName = "CardActions";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  CardBody,
  CardActions,
};
