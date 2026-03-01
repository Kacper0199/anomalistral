"use client";

import { useCallback, useMemo } from "react";

import { AlertTriangle, TrendingUp } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AnomalyChartProps {
  edaResults: Record<string, unknown> | null;
  validationResults: Record<string, unknown> | null;
}

interface ChartPoint {
  x: string | number;
  value: number;
  pointIndex: number;
  rawX: string | number;
  sourceIndex: number;
}

interface ParsedAnomaly {
  index: number | null;
  timestamp: string | null;
  value: number | null;
  score: number | null;
}

interface NormalizedAnomaly {
  x: string | number;
  y: number;
  pointIndex: number;
  score: number | null;
}

const SERIES_KEYS = [
  "time_series_preview",
  "sample_data",
  "time_series",
  "timeseries",
  "series",
  "data_preview",
  "preview",
  "data",
];

const ANOMALY_KEYS = [
  "anomalies",
  "detected_anomalies",
  "anomaly_points",
  "outliers",
  "anomaly_indices",
  "outlier_indices",
  "indices",
];

const THRESHOLD_KEYS = [
  "thresholds",
  "threshold",
  "anomaly_threshold",
  "upper_threshold",
  "lower_threshold",
  "cutoff",
  "bounds",
  "limits",
];

const X_KEY_PRIORITY = ["timestamp", "time", "datetime", "date", "ds", "t", "index", "idx", "step"];

const VALUE_KEY_PRIORITY = [
  "value",
  "reading",
  "measurement",
  "sensor_value",
  "metric",
  "target",
  "y",
  "amount",
  "signal",
];

const COMPOSED_CHART_MARGIN = { top: 16, right: 20, left: 6, bottom: 8 };

const AC_XAXIS_TICK = { fill: "#a1a1aa", fontSize: 12 };
const AC_XAXIS_TICK_LINE = { stroke: "#3f3f46" };
const AC_XAXIS_AXIS_LINE = { stroke: "#3f3f46" };

const AC_YAXIS_TICK = { fill: "#a1a1aa", fontSize: 12 };
const AC_YAXIS_TICK_LINE = { stroke: "#3f3f46" };
const AC_YAXIS_AXIS_LINE = { stroke: "#3f3f46" };

const AC_TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: "0.5rem",
};
const AC_TOOLTIP_CURSOR = { stroke: "#52525b", strokeDasharray: "4 4" };
const AC_TOOLTIP_LABEL_STYLE = { color: "#d4d4d8" };
const AC_TOOLTIP_ITEM_STYLE = { color: "#e4e4e7" };

const AC_LEGEND_STYLE = { color: "#d4d4d8", fontSize: "12px" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim().replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toIndex(value: unknown): number | null {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return null;
  }
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function toText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is Record<string, unknown> => isRecord(item));
}

function getValueByLowerKey(record: Record<string, unknown>, lowerKey: string): unknown {
  const target = lowerKey.toLowerCase();
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() === target) {
      return value;
    }
  }
  return undefined;
}

function getValuesByKeys(record: Record<string, unknown>, keys: string[]): unknown[] {
  return keys
    .map((key) => getValueByLowerKey(record, key))
    .filter((value): value is unknown => value !== undefined);
}

function collectArrays(value: unknown, maxDepth: number): unknown[] {
  const seen = new Set<unknown>();
  const output: unknown[] = [];

  const visit = (node: unknown, depth: number) => {
    if (depth > maxDepth || node === null || typeof node !== "object") {
      return;
    }
    if (seen.has(node)) {
      return;
    }
    seen.add(node);

    if (Array.isArray(node)) {
      output.push(node);
      for (const entry of node) {
        visit(entry, depth + 1);
      }
      return;
    }

    for (const entry of Object.values(node)) {
      visit(entry, depth + 1);
    }
  };

  visit(value, 0);
  return output;
}

function collectValuesByKeyPattern(value: unknown, pattern: RegExp, maxDepth: number): unknown[] {
  const seen = new Set<unknown>();
  const output: unknown[] = [];

  const visit = (node: unknown, depth: number) => {
    if (depth > maxDepth || node === null || typeof node !== "object") {
      return;
    }
    if (seen.has(node)) {
      return;
    }
    seen.add(node);

    if (Array.isArray(node)) {
      for (const entry of node) {
        visit(entry, depth + 1);
      }
      return;
    }

    for (const [key, entry] of Object.entries(node)) {
      if (pattern.test(key)) {
        output.push(entry);
      }
      visit(entry, depth + 1);
    }
  };

  visit(value, 0);
  return output;
}

function inferValueKey(rows: Record<string, unknown>[]): string | null {
  const stats = new Map<string, number>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const lower = key.toLowerCase();
      const value = toFiniteNumber(getValueByLowerKey(row, lower));
      if (value !== null) {
        stats.set(lower, (stats.get(lower) ?? 0) + 1);
      }
    }
  }

  const minCount = Math.max(1, Math.floor(rows.length * 0.3));
  for (const key of VALUE_KEY_PRIORITY) {
    const count = stats.get(key) ?? 0;
    if (count >= minCount) {
      return key;
    }
  }

  let winner: string | null = null;
  let winnerScore = -1;

  for (const [key, count] of stats.entries()) {
    if (count < minCount) {
      continue;
    }
    const penalty = /index|idx|id|timestamp|time|date|year|month|day|hour|minute|second|anomaly|outlier|score|threshold|flag|label/i.test(
      key
    )
      ? 6
      : 0;
    const score = count - penalty;
    if (score > winnerScore) {
      winnerScore = score;
      winner = key;
    }
  }

  return winner;
}

function inferXKey(rows: Record<string, unknown>[]): string | null {
  const stats = new Map<string, number>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const lower = key.toLowerCase();
      const value = getValueByLowerKey(row, lower);
      if (typeof value === "string" || typeof value === "number") {
        stats.set(lower, (stats.get(lower) ?? 0) + 1);
      }
    }
  }

  const minCount = Math.max(1, Math.floor(rows.length * 0.3));
  for (const key of X_KEY_PRIORITY) {
    const count = stats.get(key) ?? 0;
    if (count >= minCount) {
      return key;
    }
  }

  let winner: string | null = null;
  let winnerScore = -1;

  for (const [key, count] of stats.entries()) {
    if (count < minCount) {
      continue;
    }
    const bonus = /time|date|index|step|idx|timestamp/i.test(key) ? 4 : 0;
    const score = count + bonus;
    if (score > winnerScore) {
      winnerScore = score;
      winner = key;
    }
  }

  return winner;
}

function normalizeSeries(rows: Record<string, unknown>[]): ChartPoint[] {
  if (rows.length < 2) {
    return [];
  }

  const valueKey = inferValueKey(rows);
  if (!valueKey) {
    return [];
  }

  const xKey = inferXKey(rows);
  const points: ChartPoint[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const value = toFiniteNumber(getValueByLowerKey(row, valueKey));
    if (value === null) {
      continue;
    }

    const xCandidate = xKey ? getValueByLowerKey(row, xKey) : undefined;
    const rawX = typeof xCandidate === "number" || typeof xCandidate === "string" ? xCandidate : index;

    points.push({
      x: rawX,
      value,
      pointIndex: points.length,
      rawX,
      sourceIndex: index,
    });
  }

  return points;
}

function extractSeriesData(
  edaResults: Record<string, unknown> | null,
  validationResults: Record<string, unknown> | null
): ChartPoint[] {
  const candidates: Array<{ value: unknown; priority: number }> = [];

  const addCandidates = (source: Record<string, unknown> | null, keyPriority: number, deepPriority: number) => {
    if (!source) {
      return;
    }
    for (const key of SERIES_KEYS) {
      const candidate = getValueByLowerKey(source, key);
      if (candidate !== undefined) {
        candidates.push({ value: candidate, priority: keyPriority });
      }
    }
    for (const candidate of collectArrays(source, 3)) {
      candidates.push({ value: candidate, priority: deepPriority });
    }
  };

  addCandidates(edaResults, 3, 1);
  addCandidates(validationResults, 2, 0);

  let best: ChartPoint[] = [];
  let bestScore = -1;

  for (const candidate of candidates) {
    const rows = toRecordArray(candidate.value);
    const points = normalizeSeries(rows);
    if (points.length < 2) {
      continue;
    }
    const score = points.length + candidate.priority * 20;
    if (score > bestScore) {
      bestScore = score;
      best = points;
    }
  }

  return best;
}

function extractNumbers(value: unknown, maxDepth: number): number[] {
  const visit = (node: unknown, depth: number): number[] => {
    if (depth > maxDepth) {
      return [];
    }
    const direct = toFiniteNumber(node);
    if (direct !== null) {
      return [direct];
    }
    if (Array.isArray(node)) {
      return node.flatMap((entry) => visit(entry, depth + 1));
    }
    if (isRecord(node)) {
      return Object.values(node).flatMap((entry) => visit(entry, depth + 1));
    }
    return [];
  };

  return visit(value, 0);
}

function parseAnomalyEntries(value: unknown, depth = 0): ParsedAnomaly[] {
  if (depth > 3) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseAnomalyEntries(entry, depth + 1));
  }

  if (typeof value === "number") {
    return [{ index: toIndex(value), timestamp: null, value: null, score: null }];
  }

  if (typeof value === "string") {
    const asIndex = toIndex(value);
    return [{ index: asIndex, timestamp: asIndex === null ? toText(value) : null, value: null, score: null }];
  }

  if (!isRecord(value)) {
    return [];
  }

  const nested = getValuesByKeys(value, ["items", "points", "data", "values", "indices"]);
  const nestedEntries = nested.flatMap((entry) => parseAnomalyEntries(entry, depth + 1));

  const index =
    toIndex(getValueByLowerKey(value, "index")) ??
    toIndex(getValueByLowerKey(value, "idx")) ??
    toIndex(getValueByLowerKey(value, "point_index")) ??
    toIndex(getValueByLowerKey(value, "row")) ??
    toIndex(getValueByLowerKey(value, "position"));

  const timestamp =
    toText(getValueByLowerKey(value, "timestamp")) ??
    toText(getValueByLowerKey(value, "time")) ??
    toText(getValueByLowerKey(value, "datetime")) ??
    toText(getValueByLowerKey(value, "date")) ??
    toText(getValueByLowerKey(value, "ds"));

  const pointValue =
    toFiniteNumber(getValueByLowerKey(value, "value")) ??
    toFiniteNumber(getValueByLowerKey(value, "reading")) ??
    toFiniteNumber(getValueByLowerKey(value, "measurement")) ??
    toFiniteNumber(getValueByLowerKey(value, "y"));

  const score =
    toFiniteNumber(getValueByLowerKey(value, "score")) ??
    toFiniteNumber(getValueByLowerKey(value, "anomaly_score")) ??
    toFiniteNumber(getValueByLowerKey(value, "confidence")) ??
    toFiniteNumber(getValueByLowerKey(value, "probability"));

  const direct: ParsedAnomaly[] =
    index !== null || timestamp !== null || pointValue !== null || score !== null
      ? [{ index, timestamp, value: pointValue, score }]
      : [];

  return [...direct, ...nestedEntries];
}

function normalizeMatchValue(value: string | number): string {
  return String(value).trim().toLowerCase();
}

function resolveAnomalies(
  validationResults: Record<string, unknown> | null,
  seriesData: ChartPoint[]
): NormalizedAnomaly[] {
  if (!validationResults || seriesData.length === 0) {
    return [];
  }

  // Explicitly check for anomaly_scores binary array from the algorithm prompt
  if (Array.isArray(validationResults.anomaly_scores)) {
    const isBinary = validationResults.anomaly_scores.length > 0 && validationResults.anomaly_scores.every(v => v === 0 || v === 1);
    if (isBinary || validationResults.anomaly_scores.length === seriesData.length) {
      const resolved: NormalizedAnomaly[] = [];
      const scores = validationResults.anomaly_scores as (number | boolean)[];
      for (let i = 0; i < Math.min(scores.length, seriesData.length); i++) {
        if (scores[i] === 1 || scores[i] === true || scores[i] === -1) { // some models use -1 for anomaly
          resolved.push({
            x: seriesData[i].x,
            y: seriesData[i].value,
            pointIndex: i,
            score: typeof scores[i] === 'number' ? (scores[i] as number) : 1,
          });
        }
      }
      if (resolved.length > 0) return resolved;
    }
  }

  const rawAnomalyValues = [
    ...getValuesByKeys(validationResults, ANOMALY_KEYS),
    ...collectValuesByKeyPattern(validationResults, /anomal|outlier/i, 3),
  ];

  const parsed = rawAnomalyValues.flatMap((entry) => parseAnomalyEntries(entry));
  if (parsed.length === 0) {
    return [];
  }

  const bySourceIndex = new Map<number, ChartPoint>();
  const byRawX = new Map<string, ChartPoint>();

  for (const point of seriesData) {
    bySourceIndex.set(point.sourceIndex, point);
    byRawX.set(normalizeMatchValue(point.rawX), point);
    byRawX.set(normalizeMatchValue(point.x), point);
  }

  const resolved: NormalizedAnomaly[] = [];
  const seen = new Set<number>();

  for (const anomaly of parsed) {
    let target: ChartPoint | undefined;

    if (anomaly.index !== null) {
      target = bySourceIndex.get(anomaly.index) ?? seriesData[anomaly.index];
    }

    if (!target && anomaly.timestamp) {
      target = byRawX.get(normalizeMatchValue(anomaly.timestamp));
    }

    if (!target && anomaly.value !== null) {
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const point of seriesData) {
        const distance = Math.abs(point.value - anomaly.value);
        if (distance < bestDistance) {
          bestDistance = distance;
          target = point;
        }
      }
    }

    if (!target || seen.has(target.pointIndex)) {
      continue;
    }

    seen.add(target.pointIndex);
    resolved.push({
      x: target.x,
      y: target.value,
      pointIndex: target.pointIndex,
      score: anomaly.score,
    });
  }

  return resolved;
}

function extractThresholds(validationResults: Record<string, unknown> | null): number[] {
  if (!validationResults) {
    return [];
  }

  const rawValues = [
    ...getValuesByKeys(validationResults, THRESHOLD_KEYS),
    ...collectValuesByKeyPattern(validationResults, /threshold|cutoff|bound|limit/i, 3),
  ];

  const thresholds = rawValues.flatMap((entry) => extractNumbers(entry, 3));
  const unique = new Set<number>();
  for (const value of thresholds) {
    const rounded = Number.parseFloat(value.toFixed(8));
    if (Number.isFinite(rounded)) {
      unique.add(rounded);
    }
  }

  return [...unique].sort((a, b) => a - b).slice(0, 4);
}

function formatXAxisTick(value: string | number): string {
  if (typeof value === "number") {
    return String(value);
  }
  const normalized = value.trim();
  const date = new Date(normalized);
  if (!Number.isNaN(date.getTime())) {
    const hasTime = normalized.includes("T") || normalized.includes(":");
    if (hasTime) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return normalized.length > 14 ? `${normalized.slice(0, 14)}...` : normalized;
}

export function AnomalyChart({ edaResults, validationResults }: AnomalyChartProps) {
  const seriesData = useMemo(() => extractSeriesData(edaResults, validationResults), [edaResults, validationResults]);
  const anomalies = useMemo(() => resolveAnomalies(validationResults, seriesData), [seriesData, validationResults]);
  const thresholds = useMemo(() => extractThresholds(validationResults), [validationResults]);

  const formatXAxisTickMemo = useCallback(
    (value: unknown) => formatXAxisTick(value as string | number),
    [],
  );

  if (!edaResults && !validationResults) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-6 text-sm text-muted-foreground">
        Run the pipeline to see anomaly detection results
      </div>
    );
  }

  if (seriesData.length === 0) {
    return (
      <Card className="border-zinc-800/80 bg-zinc-950/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-zinc-100">
            <AlertTriangle className="size-4 text-amber-400" />
            Anomaly Detection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 p-6 text-center text-sm text-zinc-400">
            Anomaly visualization will appear after pipeline completion
            <div className="mt-5 flex h-20 items-end justify-center gap-1.5">
              {[28, 42, 35, 64, 48, 74, 52, 68, 46, 58, 44, 39].map((height, index) => (
                <div
                  key={`${height}-${index}`}
                  className="w-2 rounded-sm bg-gradient-to-t from-zinc-700 to-zinc-500"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalPoints = seriesData.length;
  const anomalyCount = anomalies.length;
  const anomalyRate = totalPoints > 0 ? (anomalyCount / totalPoints) * 100 : 0;

  return (
    <Card className="border-zinc-800/80 bg-zinc-950/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-zinc-100">
          <TrendingUp className="size-4 text-blue-400" />
          Time-Series Anomaly Detection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={seriesData} margin={COMPOSED_CHART_MARGIN}>
              <defs>
                <linearGradient id="anomalyAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis
                dataKey="x"
                tick={AC_XAXIS_TICK}
                tickLine={AC_XAXIS_TICK_LINE}
                axisLine={AC_XAXIS_AXIS_LINE}
                minTickGap={24}
                tickFormatter={formatXAxisTickMemo}
              />
              <YAxis
                tick={AC_YAXIS_TICK}
                tickLine={AC_YAXIS_TICK_LINE}
                axisLine={AC_YAXIS_AXIS_LINE}
                width={62}
              />
              <RechartsTooltip
                contentStyle={AC_TOOLTIP_CONTENT_STYLE}
                cursor={AC_TOOLTIP_CURSOR}
                labelStyle={AC_TOOLTIP_LABEL_STYLE}
                itemStyle={AC_TOOLTIP_ITEM_STYLE}
              />
              <Legend wrapperStyle={AC_LEGEND_STYLE} />
              <Area type="monotone" dataKey="value" fill="url(#anomalyAreaGradient)" stroke="none" name="Signal" />
              <Line
                type="monotone"
                dataKey="value"
                name="Time Series"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              {thresholds.map((threshold, index) => (
                <ReferenceLine
                  key={`threshold-${threshold}-${index}`}
                  y={threshold}
                  stroke="#facc15"
                  strokeDasharray="7 5"
                  strokeWidth={1.5}
                />
              ))}
              {anomalies.map((anomaly) => (
                <ReferenceDot
                  key={`anomaly-${anomaly.pointIndex}`}
                  x={anomaly.x}
                  y={anomaly.y}
                  r={6}
                  fill="#ef4444"
                  stroke="#991b1b"
                  strokeWidth={1.5}
                  ifOverflow="visible"
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap gap-2" aria-live="polite">
          <Badge variant="secondary" className="bg-zinc-800/80 text-zinc-200">
            Total points: {totalPoints}
          </Badge>
          <Badge variant="secondary" className="bg-red-950/70 text-red-200">
            Anomalies: {anomalyCount}
          </Badge>
          <Badge variant="secondary" className="bg-amber-950/70 text-amber-200">
            Anomaly rate: {anomalyRate.toFixed(2)}%
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
