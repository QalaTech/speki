import { Button, type ButtonProps } from "./Button";

/**
 * Legacy ActionButton wrapper to maintain backward compatibility 
 * while transitioning to the new premium Button primitive.
 */
interface ActionButtonProps extends Omit<ButtonProps, "variant"> {
  variant: "primary" | "secondary" | "danger" | "success" | "approve" | "reject" | "ghost" | "high-contrast";
}

export function ActionButton({ variant, className, ...props }: ActionButtonProps) {
  let effectiveVariant: any = variant;
  
  // Map legacy variants to new primitive variants
  if (variant === "danger" || variant === "reject") effectiveVariant = "destructive";
  if (variant === "success" || variant === "approve") effectiveVariant = "accent";
  if (variant === "secondary") effectiveVariant = "secondary";
  
  return (
    <Button 
      variant={effectiveVariant} 
      className={className}
      {...props} 
    />
  );
}

export { Button };
