import { Skeleton } from "@/components/ui/skeleton";

export function ResultsSkeleton() {
  return (
    <div className="h-full rounded-xl border border-border/80 bg-card/30 p-3">
      <div className="grid grid-cols-4 gap-2">
        <Skeleton className="h-9 rounded-md" />
        <Skeleton className="h-9 rounded-md" />
        <Skeleton className="h-9 rounded-md" />
        <Skeleton className="h-9 rounded-md" />
      </div>

      <div className="mt-4 space-y-4">
        <Skeleton className="h-6 w-48" />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>

        <div className="rounded-lg border border-border/70 p-3">
          <Skeleton className="h-8 w-full" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
