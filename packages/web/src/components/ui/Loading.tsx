type LoadingSize = 'xs' | 'sm' | 'md' | 'lg';
type LoadingVariant = 'spinner' | 'dots' | 'ring' | 'ball' | 'bars' | 'infinity';

interface LoadingProps {
  size?: LoadingSize;
  variant?: LoadingVariant;
  className?: string;
}

const sizeClasses: Record<LoadingSize, string> = {
  xs: 'loading-xs',
  sm: 'loading-sm',
  md: 'loading-md',
  lg: 'loading-lg',
};

const variantClasses: Record<LoadingVariant, string> = {
  spinner: 'loading-spinner',
  dots: 'loading-dots',
  ring: 'loading-ring',
  ball: 'loading-ball',
  bars: 'loading-bars',
  infinity: 'loading-infinity',
};

export function Loading({ size = 'md', variant = 'spinner', className = '' }: LoadingProps) {
  return (
    <span className={`loading ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} />
  );
}

interface LoadingOverlayProps {
  text?: string;
  size?: LoadingSize;
  variant?: LoadingVariant;
}

export function LoadingOverlay({ text, size = 'lg', variant = 'spinner' }: LoadingOverlayProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <Loading size={size} variant={variant} />
      {text && <span className="text-base-content/60">{text}</span>}
    </div>
  );
}

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circle' | 'rectangle';
  width?: string;
  height?: string;
}

export function Skeleton({ className = '', variant = 'text', width, height }: SkeletonProps) {
  const variantClass = variant === 'circle' ? 'rounded-full' : variant === 'rectangle' ? 'rounded' : '';
  const style = { width, height };

  return (
    <div
      className={`skeleton ${variantClass} ${className}`}
      style={Object.keys(style).length > 0 ? style : undefined}
    />
  );
}
