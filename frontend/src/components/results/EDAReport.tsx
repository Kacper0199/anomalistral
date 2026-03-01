"use client";

import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface EDAReportProps {
  results: Record<string, unknown> | string | null;
}

type UnknownRecord = Record<string, unknown>;

interface OverviewData {
  rowCount: number | null;
  columnCount: number | null;
}

interface StatsRow {
  column: string;
  type: string;
  mean: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
  missing: number | null;
}

interface PercentilePoint {
  label: string;
  value: number;
  isMedian: boolean;
}

const MAX_COLUMN_TABS = 8;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toText = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
};

const getValue = (record: UnknownRecord, keys: string[]): unknown => {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }
  return undefined;
};

const getRecord = (record: UnknownRecord, keys: string[]): UnknownRecord | null => {
  const value = getValue(record, keys);
  return isRecord(value) ? value : null;
};

const formatNumber = (value: number | null, digits = 2): string => {
  if (value === null) {
    return "-";
  }
  if (Math.abs(value) >= 1_000_000) {
    return value.toExponential(2);
  }
  return value.toFixed(digits);
};

const formatInt = (value: number | null): string => {
  if (value === null) {
    return "-";
  }
  return Math.round(value).toLocaleString();
};

const getOverview = (results: UnknownRecord): OverviewData => {
  const stats = getRecord(results, ["statistics", "stats"]);

  let rowCount = toNumber(getValue(results, ["row_count", "rows", "rowCount", "total_rows"]));
  if (rowCount === null && stats) {
    rowCount = toNumber(getValue(stats, ["rows", "row_count", "num_rows", "total_rows"]));
  }

  let columnCount = toNumber(getValue(results, ["column_count", "columns", "columnCount", "total_columns"]));
  if (columnCount === null && stats) {
    const colsVal = getValue(stats, ["columns", "column_count", "num_columns", "total_columns"]);
    columnCount = Array.isArray(colsVal) ? colsVal.length : toNumber(colsVal);
  }

  return { rowCount, columnCount };
};

const getStatsRows = (results: UnknownRecord, statsSource: UnknownRecord): StatsRow[] => {
  const columnTypes = getRecord(results, ["column_types", "columnTypes", "types"]);
  const missingValues = getRecord(results, ["missing_values", "missingValues", "missing"]);

  return Object.entries(statsSource).map(([column, raw]) => {
    const record = isRecord(raw) ? raw : null;
    const mean = record ? toNumber(getValue(record, ["mean", "avg", "average"])) : toNumber(raw);
    const std = record ? toNumber(getValue(record, ["std", "std_dev", "stdev", "standard_deviation"])) : null;
    const min = record ? toNumber(getValue(record, ["min", "minimum"])) : null;
    const max = record ? toNumber(getValue(record, ["max", "maximum"])) : null;
    const missing =
      (record ? toNumber(getValue(record, ["missing", "missing_count", "missing_values", "nulls", "null_count"])) : null) ??
      (missingValues ? toNumber(missingValues[column]) : null);
    const type =
      (record ? toText(getValue(record, ["type", "dtype", "data_type"])) : null) ??
      (columnTypes ? toText(columnTypes[column]) : null) ??
      (mean !== null || std !== null ? "numeric" : "categorical");

    return { column, type, mean, std, min, max, missing };
  });
};

const buildPercentilePoints = (row: StatsRow, rawRecord: UnknownRecord | null): PercentilePoint[] => {
  const p25 = rawRecord ? toNumber(getValue(rawRecord, ["p25", "25%", "q1", "quartile_1"])) : null;
  const p50 = rawRecord ? toNumber(getValue(rawRecord, ["p50", "50%", "median", "q2", "quartile_2"])) : null;
  const p75 = rawRecord ? toNumber(getValue(rawRecord, ["p75", "75%", "q3", "quartile_3"])) : null;

  const minVal = row.min;
  const maxVal = row.max;
  const meanVal = row.mean;
  const stdVal = row.std;

  if (minVal === null || maxVal === null) {
    return [];
  }

  const estimatedP25 = p25 ?? (meanVal !== null && stdVal !== null ? meanVal - 0.674 * stdVal : minVal + (maxVal - minVal) * 0.25);
  const estimatedP50 = p50 ?? meanVal ?? minVal + (maxVal - minVal) * 0.5;
  const estimatedP75 = p75 ?? (meanVal !== null && stdVal !== null ? meanVal + 0.674 * stdVal : minVal + (maxVal - minVal) * 0.75);

  return [
    { label: "Min", value: minVal, isMedian: false },
    { label: "P25", value: estimatedP25, isMedian: false },
    { label: "Median", value: estimatedP50, isMedian: true },
    { label: "P75", value: estimatedP75, isMedian: false },
    { label: "Max", value: maxVal, isMedian: false },
  ];
};

function PercentileBarChart({ points }: { points: PercentilePoint[] }) {
  if (!points.length) {
    return <p className="text-xs text-muted-foreground">No percentile data available.</p>;
  }

  const values = points.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  return (
    <div className="space-y-1.5">
      {points.map((point) => {
        const pct = Math.min(((point.value - minVal) / range) * 100, 100);
        const color = point.isMedian ? "bg-amber-500" : "bg-blue-500";
        return (
          <div key={point.label} className="flex items-center gap-2 text-xs">
            <span className="w-14 shrink-0 text-muted-foreground">{point.label}</span>
            <div className="relative h-5 flex-1 rounded bg-muted/30">
              <div
                className={`absolute inset-y-0 left-0 rounded ${color} transition-all`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
              {formatNumber(point.value, 2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ColumnTab({ row, rawRecord }: { row: StatsRow; rawRecord: UnknownRecord | null }) {
  const percentilePoints = useMemo(() => buildPercentilePoints(row, rawRecord), [row, rawRecord]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
          <div className="text-xs text-muted-foreground">Mean</div>
          <div className="mt-0.5 text-sm font-medium tabular-nums">{formatNumber(row.mean)}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
          <div className="text-xs text-muted-foreground">Std Dev</div>
          <div className="mt-0.5 text-sm font-medium tabular-nums">{formatNumber(row.std)}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
          <div className="text-xs text-muted-foreground">Min</div>
          <div className="mt-0.5 text-sm font-medium tabular-nums">{formatNumber(row.min)}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
          <div className="text-xs text-muted-foreground">Max</div>
          <div className="mt-0.5 text-sm font-medium tabular-nums">{formatNumber(row.max)}</div>
        </div>
        <div className="col-span-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
          <div className="text-xs text-muted-foreground">Missing</div>
          <div className="mt-0.5 text-sm font-medium tabular-nums">{formatInt(row.missing)}</div>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Percentile Distribution</p>
        <PercentileBarChart points={percentilePoints} />
      </div>
    </div>
  );
}

export function EDAReport({ results: rawResults }: EDAReportProps) {
  const results = useMemo((): Record<string, unknown> | null => {
    if (!rawResults) {
      return null;
    }

    if (typeof rawResults === "string") {
      try {
        const parsed = JSON.parse(rawResults);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
        return { data: parsed };
      } catch {
        return { raw: rawResults };
      }
    }

    if (typeof rawResults === "object" && !Array.isArray(rawResults)) {
      return rawResults;
    }

    return { data: rawResults };
  }, [rawResults]);

  const statsRows = useMemo(() => {
    if (!results) return [];
    try {
      const statsSource = getRecord(results, ["statistics", "stats"]);
      return statsSource ? getStatsRows(results, statsSource) : [];
    } catch {
      return [];
    }
  }, [results]);

  const numericRows = useMemo(
    () => statsRows.filter((row) => row.type === "numeric" || row.mean !== null),
    [statsRows],
  );

  const visibleColumnTabs = useMemo(
    () => numericRows.slice(0, MAX_COLUMN_TABS),
    [numericRows],
  );

  const hasOverflowColumns = numericRows.length > MAX_COLUMN_TABS;

  const statsSource = useMemo(
    () => (results ? getRecord(results, ["statistics", "stats"]) : null),
    [results],
  );

  if (!results) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
        Waiting for EDA analysis...
      </div>
    );
  }

  const overview = getOverview(results);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <Card className="border-border/70 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Rows</div>
                <div className="mt-1 text-2xl font-semibold tracking-tight">{formatInt(overview.rowCount)}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Columns</div>
                <div className="mt-1 text-2xl font-semibold tracking-tight">{formatInt(overview.columnCount)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {visibleColumnTabs.length > 0 ? (
          <Card className="border-border/70 bg-card/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">Column Analysis</CardTitle>
                {hasOverflowColumns ? (
                  <span className="text-xs text-muted-foreground">
                    Showing {MAX_COLUMN_TABS} of {numericRows.length} columns
                  </span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue={visibleColumnTabs[0]?.column ?? ""}>
                <TabsList className="flex h-auto flex-wrap gap-1 bg-transparent p-0">
                  {visibleColumnTabs.map((row) => {
                    const isTruncated = row.column.length > 20;
                    const displayName = isTruncated ? `${row.column.slice(0, 20)}…` : row.column;
                    const trigger = (
                      <TabsTrigger
                        key={row.column}
                        value={row.column}
                        className="h-7 rounded px-2.5 py-1 text-xs data-[state=active]:bg-muted data-[state=active]:text-foreground"
                      >
                        {displayName}
                      </TabsTrigger>
                    );
                    if (!isTruncated) {
                      return trigger;
                    }
                    return (
                      <Tooltip key={row.column}>
                        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="text-xs">{row.column}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                  {hasOverflowColumns ? (
                    <span className="flex h-7 items-center px-2 text-xs text-muted-foreground">
                      +{numericRows.length - MAX_COLUMN_TABS} more
                    </span>
                  ) : null}
                </TabsList>

                {visibleColumnTabs.map((row) => {
                  const rawRecord = statsSource ? (isRecord(statsSource[row.column]) ? (statsSource[row.column] as UnknownRecord) : null) : null;
                  return (
                    <TabsContent key={row.column} value={row.column} className="mt-4">
                      <ColumnTab row={row} rawRecord={rawRecord} />
                    </TabsContent>
                  );
                })}
              </Tabs>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
