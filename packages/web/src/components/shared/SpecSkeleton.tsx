import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("animate-shimmer rounded-md bg-muted/20", className)} />
  );
}

export function SpecContentSkeleton() {
  return (
    <div className="p-8 max-w-4xl mx-auto w-full space-y-8 animate-in fade-in duration-500">
      <div className="space-y-4">
        <Skeleton className="h-10 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </div>
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <div className="space-y-3 pt-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    </div>
  );
}

export function TaskListSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center mb-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-32 rounded-full" />
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="py-4 px-5 rounded-2xl border border-border/10 bg-muted/5 flex items-center gap-3">
          {/* Status Icon */}
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          
          {/* ID Badge */}
          <Skeleton className="h-5 w-12 rounded-lg shrink-0" />
          
          {/* Complexity/Review Badges */}
          <div className="flex gap-1.5 shrink-0">
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>

          {/* Title */}
          <Skeleton className="h-4 flex-1 min-w-[100px]" />
          
          {/* Action Buttons & Chevron */}
          <div className="flex items-center gap-2 shrink-0">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-5 w-5 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
