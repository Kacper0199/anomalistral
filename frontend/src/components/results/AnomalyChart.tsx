"use client";

import { useMemo } from "react";

import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AnomalyChartProps {
  edaResults?: Record<string, unknown> | null;
  validationResults: Record<string, unknown> | null;
}

interface AnomalyRecord {
  index: number;
  score: number | string;
  [key: string]: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toFinite(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.trim().replaceAll(",", ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function tryParseJson(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const trimmed = v.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return v;
  try {
    return JSON.parse(trimmed);
  } catch {
    return v;
  }
}

function extractAnomalyRecords(
  validationResults: Record<string, unknown> | null,
): { records: AnomalyRecord[]; summaryText: string | null } {
  if (!validationResults) return { records: [], summaryText: null };

  const scores = validationResults["anomaly_scores"];
  if (Array.isArray(scores) && scores.length > 0) {
    const records: AnomalyRecord[] = [];
    (scores as unknown[]).forEach((s, i) => {
      const numeric = toFinite(s);
      const isAnomaly = numeric === 1 || numeric === -1 || s === true;
      if (isAnomaly) {
        records.push({ index: i, score: numeric ?? String(s) });
      }
    });
    if (records.length > 0) return { records, summaryText: null };
  }

  const rawAnomalies =
    validationResults["anomalies"] ??
    validationResults["detected_anomalies"] ??
    validationResults["anomaly_points"] ??
    validationResults["outliers"];

  const anomaliesRaw = tryParseJson(rawAnomalies);

  if (typeof anomaliesRaw === "string" && anomaliesRaw.trim().length > 0) {
    return { records: [], summaryText: anomaliesRaw.trim() };
  }

  if (Array.isArray(anomaliesRaw) && anomaliesRaw.length > 0) {
    const records = (anomaliesRaw as unknown[]).map((entry, i): AnomalyRecord => {
      if (isRecord(entry)) {
        const idx = toFinite(entry["index"] ?? entry["idx"] ?? i) ?? i;
        const score =
          toFinite(entry["score"] ?? entry["anomaly_score"] ?? entry["confidence"]) ??
          "anomaly";
        const rest: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(entry)) {
          if (k !== "index" && k !== "idx" && k !== "score" && k !== "anomaly_score") {
            rest[k] = v;
          }
        }
        return { index: idx, score, ...rest };
      }
      const idx = toFinite(entry) ?? i;
      return { index: idx, score: "anomaly" };
    });
    return { records, summaryText: null };
  }

  const summaryKeys = ["summary", "message", "report", "text", "description"];
  for (const key of summaryKeys) {
    const val = validationResults[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return { records: [], summaryText: val.trim() };
    }
  }

  return { records: [], summaryText: null };
}

function resolveExtraColumns(records: AnomalyRecord[]): string[] {
  const known = new Set(["index", "score"]);
  const cols = new Set<string>();
  for (const r of records) {
    for (const k of Object.keys(r)) {
      if (!known.has(k)) cols.add(k);
    }
  }
  return [...cols].slice(0, 20);
}

export function AnomalyChart({ validationResults }: AnomalyChartProps) {
  const { records, summaryText } = useMemo(
    () => extractAnomalyRecords(validationResults),
    [validationResults],
  );

  const extraCols = useMemo(() => resolveExtraColumns(records), [records]);

  if (!validationResults) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-6 text-sm text-muted-foreground">
        Run the pipeline to see anomaly detection results
      </div>
    );
  }

  if (records.length === 0 && !summaryText) {
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
            No anomalies detected in the results.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (summaryText) {
    return (
      <Card className="border-zinc-800/80 bg-zinc-950/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-zinc-100">
            <AlertTriangle className="size-4 text-red-400" />
            Anomaly Detection Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
            {summaryText}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-zinc-800/80 bg-zinc-950/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-zinc-100">
          <AlertTriangle className="size-4 text-red-400" />
          Detected Anomalies
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="bg-red-950/70 text-red-200">
            {records.length} anomal{records.length === 1 ? "y" : "ies"} flagged
          </Badge>
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-800 bg-zinc-900/60">
              <tr>
                <th className="px-3 py-2 font-medium text-zinc-400">Row #</th>
                <th className="px-3 py-2 font-medium text-zinc-400">Score</th>
                {extraCols.map((col) => (
                  <th key={col} className="px-3 py-2 font-medium text-zinc-400 capitalize">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((row) => (
                <tr
                  key={row.index}
                  className="border-b border-zinc-800/50 bg-red-950/10 transition-colors hover:bg-red-950/20"
                >
                  <td className="px-3 py-2 font-mono text-zinc-300">{row.index}</td>
                  <td className="px-3 py-2 font-mono text-red-300">
                    {typeof row.score === "number" ? row.score.toFixed(4) : row.score}
                  </td>
                  {extraCols.map((col) => (
                    <td key={col} className="px-3 py-2 text-zinc-400">
                      {row[col] !== undefined && row[col] !== null
                        ? String(row[col])
                        : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
