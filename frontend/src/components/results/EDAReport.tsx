interface EDAReportProps {
  results: Record<string, unknown> | null;
}

export function EDAReport({ results }: EDAReportProps) {
  if (!results) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-4 text-sm text-muted-foreground">
        Waiting for EDA...
      </div>
    );
  }

  return (
    <pre className="max-h-[380px] overflow-auto rounded-lg border border-border/80 bg-muted/30 p-4 text-xs leading-relaxed">
      {JSON.stringify(results, null, 2)}
    </pre>
  );
}
