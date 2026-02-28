import { PipelineSkeleton } from "@/components/loading/PipelineSkeleton";
import { ResultsSkeleton } from "@/components/loading/ResultsSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

const chatMessageWidths = ["w-[82%]", "w-[64%]", "w-[76%]", "w-[58%]", "w-[70%]"];

export function SessionSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/80 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between px-4 md:px-6">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </header>

      <main className="mx-auto grid h-[calc(100vh-4rem)] w-full max-w-[1800px] grid-cols-1 gap-4 p-4 md:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_420px]">
        <section className="min-h-[340px] md:h-full">
          <div className="flex h-full flex-col rounded-xl border border-border/80 bg-card/50">
            <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
            <div className="flex-1 space-y-3 px-4 py-3">
              {chatMessageWidths.map((width, index) => (
                <Skeleton key={`${width}-${index}`} className={`h-10 ${width}`} />
              ))}
            </div>
            <div className="border-t border-border/80 p-3">
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </section>

        <section className="flex min-h-[420px] flex-col rounded-xl border border-border/80 bg-card/30 p-3">
          <div className="mb-3 flex items-center justify-between px-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
          </div>
          <PipelineSkeleton />
        </section>

        <section className="min-h-[340px] xl:overflow-hidden">
          <ResultsSkeleton />
        </section>
      </main>
    </div>
  );
}
