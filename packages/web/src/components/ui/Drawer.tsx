/**
 * ShadCN-style Drawer component built on Vaul
 * 
 * A smooth, swipeable drawer with spring animations.
 * Based on https://ui.shadcn.com/docs/components/drawer
 */
import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { cn } from "@/lib/utils";

// ============================================
// Root Drawer
// ============================================

const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root
    shouldScaleBackground={shouldScaleBackground}
    {...props}
  />
);
Drawer.displayName = "Drawer";

// ============================================
// Drawer Trigger
// ============================================

const DrawerTrigger = DrawerPrimitive.Trigger;

// ============================================
// Drawer Portal
// ============================================

const DrawerPortal = DrawerPrimitive.Portal;

// ============================================
// Drawer Close
// ============================================

const DrawerClose = DrawerPrimitive.Close;

// ============================================
// Drawer Overlay
// ============================================

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-1000 bg-black/60 backdrop-blur-sm",
      className
    )}
    {...props}
  />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

// ============================================
// Drawer Content
// ============================================

interface DrawerContentProps
  extends React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> {
  side?: "left" | "right" | "top" | "bottom";
  /** Hide the overlay backdrop - useful when modal={false} to prevent rendering issues */
  hideOverlay?: boolean;
}

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  DrawerContentProps
>(({ className, children, side = "bottom", hideOverlay = false, ...props }, ref) => {
  // Position styles based on side
  const positionStyles = {
    bottom: "inset-x-0 bottom-0 mt-24 rounded-t-2xl",
    top: "inset-x-0 top-0 mb-24 rounded-b-2xl",
    left: "inset-y-0 left-0 mr-24 rounded-r-2xl w-[400px] max-w-[85vw]",
    right: "inset-y-0 right-0 ml-24 rounded-l-2xl w-[400px] max-w-[85vw]",
  };

  return (
    <DrawerPortal>
      {!hideOverlay && <DrawerOverlay />}
      <DrawerPrimitive.Content
        ref={ref}
        className={cn(
          "fixed z-1000 flex flex-col focus:outline-none",
          "bg-background",
          "border border-border",
          "shadow-2xl shadow-black/40",
          positionStyles[side],
          className
        )}
        {...props}
      >
        {/* Drag handle for bottom/top drawers */}
        {(side === "bottom" || side === "top") && (
          <div className={cn(
            "mx-auto w-12 h-1.5 shrink-0 rounded-full bg-muted-foreground mb-4",
            side === "bottom" ? "mt-4" : "mb-4 mt-auto"
          )} />
        )}
        {/* Drag handle for left/right drawers */}
        {(side === "left" || side === "right") && (
          <div className={cn(
            "absolute top-1/2 -translate-y-1/2 w-1.5 h-12 rounded-full bg-muted-foreground",
            side === "left" ? "right-2" : "left-2"
          )} />
        )}
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
});
DrawerContent.displayName = "DrawerContent";

// ============================================
// Drawer Header
// ============================================

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col gap-1.5 px-6 py-4",
      "border-b border-border/50",
      "bg-main/50",
      className
    )}
    {...props}
  />
);
DrawerHeader.displayName = "DrawerHeader";

// ============================================
// Drawer Title
// ============================================

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

// ============================================
// Drawer Description
// ============================================

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

// ============================================
// Drawer Body (scrollable content area)
// ============================================

const DrawerBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex-1 overflow-y-auto px-6 py-5", className)}
    {...props}
  />
));
DrawerBody.displayName = "DrawerBody";

// ============================================
// Drawer Footer
// ============================================

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex items-center justify-end gap-3",
      "px-6 py-4",
      "border-t border-border",
      "bg-secondary/30",
      className
    )}
    {...props}
  />
);
DrawerFooter.displayName = "DrawerFooter";

// ============================================
// Exports
// ============================================

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
