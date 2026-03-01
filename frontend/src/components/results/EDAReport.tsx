"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

const badgeToneClass: Record<QualityTone, string> = {
  green: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  yellow: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  red: "border-rose-500/30 bg-rose-500/15 text-rose-300",
  neutral: "border-border/70 bg-muted/40 text-muted-foreground",
};

const CHART_MARGIN = { top: 10, right: 10, left: 0, bottom: 40 };

const XAXIS_TICK_LINE = { stroke: "hsl(var(--border))" };
const XAXIS_AXIS_LINE = { stroke: "hsl(var(--border))" };
const YAXIS_TICK_LINE = { stroke: "hsl(var(--border))" };
const YAXIS_AXIS_LINE = { stroke: "hsl(var(--border))" };

const TOOLTIP_CURSOR = { fill: "rgba(59,130,246,0.12)" };
const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
};

const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

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

  const tooltipFormatter = useCallback(
    (value: unknown) => {
      const numeric = Array.isArray(value) ? toNumber(value[0]) : toNumber(value);
      return [formatNumber(numeric, 2), activeMetric === "missing" ? "Missing" : "Mean"];
    },
    [activeMetric],
  );

  if (!results) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
        Waiting for EDA analysis...
      </div>
    );
  }

  const overview = getOverview(results);
  const qualityFlags = getQualityFlags(results);
  const statsSource = getRecord(results, ["statistics", "stats"]);

  const chartData = activeMetric === "missing" ? missingChartData : meanChartData;

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
            <CardTitle className="text-sm font-medium">Data Quality Flags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {qualityFlags.map((flag) => (
                <Badge key={`${flag.label}-${flag.value}`} variant="outline" className={badgeToneClass[flag.tone]}>
                  {flag.label}: {flag.value}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {statsSource ? (
        <Card className="border-border/70 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Column Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Mean</TableHead>
                  <TableHead>Std</TableHead>
                  <TableHead>Min</TableHead>
                  <TableHead>Max</TableHead>
                  <TableHead>Missing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statsRows.map((row) => (
                  <TableRow key={row.column}>
                    <TableCell className="font-medium">{row.column}</TableCell>
                    <TableCell className="text-muted-foreground">{row.type}</TableCell>
                    <TableCell>{formatNumber(row.mean)}</TableCell>
                    <TableCell>{formatNumber(row.std)}</TableCell>
                    <TableCell>{formatNumber(row.min)}</TableCell>
                    <TableCell>{formatNumber(row.max)}</TableCell>
                    <TableCell>{formatInt(row.missing)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {!statsRows.length ? <TableCaption>No statistics rows were detected.</TableCaption> : null}
            </Table>
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
            <div className="h-64 w-full rounded-lg border border-border/60 bg-background/40 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    stroke="hsl(var(--muted-foreground))"
                    tickLine={XAXIS_TICK_LINE}
                    axisLine={XAXIS_AXIS_LINE}
                    angle={-28}
                    textAnchor="end"
                    interval={0}
                    height={64}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    tickLine={YAXIS_TICK_LINE}
                    axisLine={YAXIS_AXIS_LINE}
                  />
                  <RechartsTooltip
                    cursor={TOOLTIP_CURSOR}
                    contentStyle={TOOLTIP_CONTENT_STYLE}
                    formatter={tooltipFormatter}
                  />
                  <Bar dataKey="value" fill="#3b82f6" radius={BAR_RADIUS}>
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={activeMetric === "missing" && entry.value > 0 ? "#f59e0b" : "#3b82f6"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
