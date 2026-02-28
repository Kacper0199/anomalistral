import { Skeleton } from "@/components/ui/skeleton";

const nodeOffsets = [40, 300, 560, 820, 1080];

export function PipelineSkeleton() {
  return (
    <div className="relative h-full min-h-[420px] overflow-x-auto rounded-xl border border-border/80 bg-card/40">
      <div className="relative mx-auto h-full min-h-[420px] w-[1280px] py-24">
        {nodeOffsets.map((offset, index) => (
          <div key={offset} className="absolute" style={{ left: `${offset}px`, top: "50%", transform: "translateY(-50%)" }}>
            <div className="flex items-center">
              <div className="h-[80px] w-[180px] rounded-xl border border-border/70 bg-card/60 p-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-2 w-32" />
                <Skeleton className="mt-2 h-2 w-20" />
              </div>
              {index < nodeOffsets.length - 1 ? <Skeleton className="mx-4 h-px w-16" /> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
