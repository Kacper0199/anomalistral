"use client";

import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface EDAReportProps {
  results: Record<string, unknown> | string | null;
}

type UnknownRecord = Record<string, unknown>;
type QualityTone = "green" | "yellow" | "red" | "neutral";

interface OverviewData {
  rowCount: number | null;
  columnCount: number | null;
  summary: string | null;
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

interface QualityFlag {
  label: string;
  value: string;
  tone: QualityTone;
}

interface BarDatum {
  name: string;
  value: number;
}

interface PercentilePoint {
  label: string;
  value: number;
  isMedian: boolean;
}

const TONE_CLASSES: Record<QualityTone, string> = {
  green: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  yellow: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  red: "text-red-400 bg-red-500/10 border-red-500/30",
  neutral: "text-muted-foreground bg-muted/30 border-border/60",
};

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

const prettyLabel = (value: string): string =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (s) => s.toUpperCase());

const getOverview = (results: UnknownRecord): OverviewData => {
  const summaryValue = getValue(results, ["summary", "overview", "description"]);
  const summary =
    toText(summaryValue) ??
    (isRecord(summaryValue)
      ? toText(getValue(summaryValue, ["summary", "text", "description", "details"]))
      : null);

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

  return { rowCount, columnCount, summary };
};

const scoreTone = (value: number): QualityTone => {
  const normalized = value <= 1 ? value * 100 : value;
  if (normalized >= 80) {
    return "green";
  }
  if (normalized >= 50) {
    return "yellow";
  }
  return "red";
};

const textTone = (value: string): QualityTone => {
  const lower = value.toLowerCase();
  if (["good", "high", "pass", "ok", "clean", "healthy"].some((k) => lower.includes(k))) {
    return "green";
  }
  if (["warn", "medium", "moderate", "fair"].some((k) => lower.includes(k))) {
    return "yellow";
  }
  if (["low", "bad", "poor", "critical", "fail", "error"].some((k) => lower.includes(k))) {
    return "red";
  }
  return "neutral";
};

const parseQualityFlag = (label: string, value: unknown): QualityFlag | null => {
  if (typeof value === "boolean") {
    return { label: prettyLabel(label), value: value ? "Pass" : "Fail", tone: value ? "green" : "red" };
  }

  const numeric = toNumber(value);
  if (numeric !== null) {
    const display = numeric <= 1 ? `${(numeric * 100).toFixed(0)}%` : formatNumber(numeric, 1);
    return { label: prettyLabel(label), value: display, tone: scoreTone(numeric) };
  }

  const text = toText(value);
  if (text) {
    return { label: prettyLabel(label), value: text, tone: textTone(text) };
  }

  if (isRecord(value)) {
    const nested =
      getValue(value, ["score", "value", "ratio", "percentage", "percent", "status", "level", "state"]) ??
      Object.values(value)[0];
    return parseQualityFlag(label, nested);
  }

  return null;
};

const getQualityFlags = (results: UnknownRecord): QualityFlag[] => {
  const qualityRecord = getRecord(results, ["data_quality_flags", "data_quality", "quality", "quality_flags", "quality_metrics"]);
  const source =
    qualityRecord ??
    Object.fromEntries(
      Object.entries(results).filter(([key]) => key.toLowerCase().includes("quality") || key.toLowerCase().includes("score")),
    );

  return Object.entries(source)
    .flatMap(([key, value]) => {
      if (isRecord(value)) {
        return Object.entries(value).map(([subKey, subValue]) =>
          parseQualityFlag(`${prettyLabel(key)} ${prettyLabel(subKey)}`, subValue),
        );
      }
      return [parseQualityFlag(key, value)];
    })
    .filter((flag): flag is QualityFlag => flag !== null)
    .slice(0, 12);
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

function CSSBarChart({ data, metricType }: { data: BarDatum[]; metricType: "missing" | "mean" }) {
  const maxValue = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  return (
    <div className="space-y-1.5">
      {data.map((entry) => {
        const pct = Math.min((Math.abs(entry.value) / maxValue) * 100, 100);
        const color = metricType === "missing" && entry.value > 0 ? "bg-amber-500" : "bg-blue-500";
        return (
          <div key={entry.name} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 truncate text-muted-foreground" title={entry.name}>
              {entry.name}
            </span>
            <div className="relative h-5 flex-1 rounded bg-muted/30">
              <div
                className={`absolute inset-y-0 left-0 rounded ${color} transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
              {formatNumber(entry.value, 1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

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
  const [metricPreference, setMetricPreference] = useState<"missing" | "mean">("missing");

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

  const missingChartData = useMemo(() => {
    try {
      return statsRows
        .filter((row) => row.missing !== null)
        .map((row) => ({ name: row.column, value: row.missing ?? 0 }))
        .slice(0, 12);
    } catch {
      return [];
    }
  }, [statsRows]);

  const meanChartData = useMemo(() => {
    try {
      return statsRows
        .filter((row) => row.mean !== null)
        .map((row) => ({ name: row.column, value: row.mean ?? 0 }))
        .slice(0, 12);
    } catch {
      return [];
    }
  }, [statsRows]);

  const activeMetric = useMemo(
    () =>
      metricPreference === "missing"
        ? missingChartData.length > 0
          ? "missing"
          : "mean"
        : meanChartData.length > 0
          ? "mean"
          : "missing",
    [metricPreference, missingChartData.length, meanChartData.length],
  );

  const chartData = activeMetric === "missing" ? missingChartData : meanChartData;

  if (!results) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
        Waiting for EDA analysis...
      </div>
    );
  }

  const overview = getOverview(results);
  const qualityFlags = getQualityFlags(results);

  const hasKnownStructure =
    overview.rowCount !== null ||
    overview.columnCount !== null ||
    Boolean(overview.summary) ||
    qualityFlags.length > 0 ||
    Boolean(statsSource);

  if (!hasKnownStructure) {
    return (
      <pre className="max-h-[380px] overflow-auto rounded-lg border border-border/80 bg-muted/30 p-4 text-xs leading-relaxed">
        {JSON.stringify(results, null, 2)}
      </pre>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <Card className="border-border/70 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
            {overview.summary ? <p className="text-sm leading-relaxed text-muted-foreground">{overview.summary}</p> : null}
          </CardContent>
        </Card>

        {qualityFlags.length > 0 ? (
          <Card className="border-border/70 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Data Quality</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {qualityFlags.map((flag) => (
                  <div
                    key={flag.label}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[flag.tone]}`}
                  >
                    <span className="text-muted-foreground/80">{flag.label}:</span>
                    <span>{flag.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {chartData.length > 0 ? (
          <Card className="border-border/70 bg-card/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm font-medium">Distribution Preview</CardTitle>
                {missingChartData.length > 0 && meanChartData.length > 0 ? (
                  <div className="inline-flex rounded-md border border-border/70 bg-muted/20 p-0.5">
                    <button
                      type="button"
                      onClick={() => setMetricPreference("missing")}
                      className={`rounded px-2 py-1 text-xs transition-colors ${
                        activeMetric === "missing" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Missing
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetricPreference("mean")}
                      className={`rounded px-2 py-1 text-xs transition-colors ${
                        activeMetric === "mean" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Mean
                    </button>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <CSSBarChart data={chartData} metricType={activeMetric} />
            </CardContent>
          </Card>
        ) : null}

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
