import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ValidationReportProps {
  results: Record<string, unknown> | null;
}

type CheckStatus = "pass" | "fail" | "warning";

interface ParsedMetric {
  key: string;
  label: string;
  value: number;
}

interface ParsedCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

const reservedMetricKeys = new Set([
  "overall_score",
  "score",
  "passed",
  "status",
  "checks",
  "validations",
  "recommendations",
  "confidence",
  "metrics",
]);

const metricSurfaceClasses = [
  "border-emerald-500/25 bg-emerald-500/10",
  "border-cyan-500/25 bg-cyan-500/10",
  "border-amber-500/25 bg-amber-500/10",
  "border-violet-500/25 bg-violet-500/10",
  "border-sky-500/25 bg-sky-500/10",
  "border-rose-500/25 bg-rose-500/10",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickFirstValue(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in source) {
      return source[key];
    }
  }
  return undefined;
}

function normalizePercentage(value: number): number {
  return value >= 0 && value <= 1 ? value * 100 : value;
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatLabel(label: string): string {
  return label
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isRatio(value: number): boolean {
  return value >= 0 && value <= 1;
}

function formatMetricValue(value: number): string {
  if (isRatio(value)) {
    return `${formatNumber(value * 100, 1)}%`;
  }
  return formatNumber(value, 3);
}

function parseStatus(value: unknown): CheckStatus | null {
  if (typeof value === "boolean") {
    return value ? "pass" : "fail";
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (/(fail|error|invalid|false|rejected|critical)/.test(normalized)) {
      return "fail";
    }
    if (/(warn|warning|partial|pending|review|unknown)/.test(normalized)) {
      return "warning";
    }
    if (/(pass|passed|success|ok|valid|true|approved)/.test(normalized)) {
      return "pass";
    }
  }

  return null;
}

function parseScore(source: Record<string, unknown>): number | null {
  const scoreValue = toNumber(pickFirstValue(source, ["overall_score", "score"]));
  if (scoreValue === null) {
    return null;
  }
  return clampPercentage(normalizePercentage(scoreValue));
}

function parseConfidence(source: Record<string, unknown>): number | null {
  const confidenceValue = toNumber(source.confidence);
  if (confidenceValue === null) {
    return null;
  }
  return clampPercentage(normalizePercentage(confidenceValue));
}

function parseOverallStatus(source: Record<string, unknown>): CheckStatus | null {
  const passedValue = pickFirstValue(source, ["passed", "status"]);
  const status = parseStatus(passedValue);
  if (status === "warning") {
    return null;
  }
  return status;
}

function parseMetrics(source: Record<string, unknown>): ParsedMetric[] {
  const metricObject = isRecord(source.metrics) ? source.metrics : null;
  const entries = metricObject
    ? Object.entries(metricObject)
    : Object.entries(source).filter(([key]) => !reservedMetricKeys.has(key));

  return entries
    .map(([key, value]) => {
      const metricValue = toNumber(value);
      if (metricValue === null) {
        return null;
      }
      return {
        key,
        label: formatLabel(key),
        value: metricValue,
      };
    })
    .filter((metric): metric is ParsedMetric => metric !== null);
}

function parseCheck(source: unknown, index: number): ParsedCheck | null {
  if (typeof source === "string") {
    return {
      name: source,
      status: "warning",
      detail: "Needs review",
    };
  }

  if (typeof source === "boolean") {
    return {
      name: `Check ${index + 1}`,
      status: source ? "pass" : "fail",
      detail: source ? "Passed" : "Failed",
    };
  }

  if (!isRecord(source)) {
    return null;
  }

  const nameValue = pickFirstValue(source, ["name", "check", "title", "rule", "metric", "id"]);
  const detailValue = pickFirstValue(source, ["result", "message", "detail", "details", "description"]);
  const statusValue = pickFirstValue(source, ["passed", "success", "status", "outcome", "result"]);

  const name =
    typeof nameValue === "string" && nameValue.trim().length > 0
      ? nameValue
      : `Check ${index + 1}`;

  const detail =
    typeof detailValue === "string" && detailValue.trim().length > 0
      ? detailValue
      : "No additional details";

  const status = parseStatus(statusValue) ?? parseStatus(detailValue) ?? "warning";

  return {
    name,
    status,
    detail,
  };
}

function parseChecks(source: Record<string, unknown>): ParsedCheck[] {
  const checksSource = toArray(pickFirstValue(source, ["checks", "validations"]));

  return checksSource
    .map((entry, index) => parseCheck(entry, index))
    .filter((entry): entry is ParsedCheck => entry !== null);
}

function parseRecommendation(entry: unknown): string | null {
  if (typeof entry === "string") {
    const value = entry.trim();
    return value.length > 0 ? value : null;
  }

  if (!isRecord(entry)) {
    return null;
  }

  const title = typeof entry.title === "string" ? entry.title.trim() : "";
  const description =
    typeof entry.description === "string" ? entry.description.trim() : "";

  if (title && description) {
    return `${title}: ${description}`;
  }

  const recommendationValue = pickFirstValue(entry, [
    "recommendation",
    "suggestion",
    "action",
    "message",
    "text",
    "title",
  ]);

  if (typeof recommendationValue === "string" && recommendationValue.trim().length > 0) {
    return recommendationValue;
  }

  return JSON.stringify(entry);
}

function parseRecommendations(source: Record<string, unknown>): string[] {
  return toArray(source.recommendations)
    .map((entry) => parseRecommendation(entry))
    .filter((entry): entry is string => entry !== null);
}

function getScoreTone(score: number): "good" | "medium" | "bad" {
  if (score >= 80) {
    return "good";
  }
  if (score >= 50) {
    return "medium";
  }
  return "bad";
}

function getCheckVisual(status: CheckStatus): {
  icon: typeof CheckCircle;
  iconClass: string;
  badgeClass: string;
  badgeLabel: string;
} {
  if (status === "pass") {
    return {
      icon: CheckCircle,
      iconClass: "text-emerald-400",
      badgeClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
      badgeLabel: "Pass",
    };
  }
  if (status === "fail") {
    return {
      icon: XCircle,
      iconClass: "text-rose-400",
      badgeClass: "border-rose-500/40 bg-rose-500/15 text-rose-300",
      badgeLabel: "Fail",
    };
  }
  return {
    icon: AlertTriangle,
    iconClass: "text-amber-400",
    badgeClass: "border-amber-500/40 bg-amber-500/15 text-amber-300",
    badgeLabel: "Review",
  };
}

export function ValidationReport({ results }: ValidationReportProps) {
  if (!results) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-4 text-sm text-muted-foreground">
        Waiting for validation...
      </div>
    );
  }

  const score = parseScore(results);
  const confidence = parseConfidence(results);
  const overallStatus = parseOverallStatus(results);
  const metrics = parseMetrics(results);
  const checks = parseChecks(results);
  const recommendations = parseRecommendations(results);

  const hasStructuredData =
    score !== null ||
    confidence !== null ||
    overallStatus !== null ||
    metrics.length > 0 ||
    checks.length > 0 ||
    recommendations.length > 0;

  if (!hasStructuredData) {
    return (
      <pre className="max-h-[420px] overflow-auto rounded-lg border border-border/80 bg-muted/30 p-4 text-xs leading-relaxed">
        {JSON.stringify(results, null, 2)}
      </pre>
    );
  }

  const scoreTone = score === null ? "medium" : getScoreTone(score);
  const scoreToneClasses =
    scoreTone === "good"
      ? {
          value: "text-emerald-300",
          progress: "bg-emerald-500/20 [&>[data-slot=progress-indicator]]:bg-emerald-500",
          chip: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
        }
      : scoreTone === "medium"
        ? {
            value: "text-amber-300",
            progress: "bg-amber-500/20 [&>[data-slot=progress-indicator]]:bg-amber-500",
            chip: "border-amber-500/40 bg-amber-500/15 text-amber-300",
          }
        : {
            value: "text-rose-300",
            progress: "bg-rose-500/20 [&>[data-slot=progress-indicator]]:bg-rose-500",
            chip: "border-rose-500/40 bg-rose-500/15 text-rose-300",
          };

  return (
    <div className="space-y-4">
      <Card className="border-border/80 bg-zinc-950/40 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-sky-300" />
              Overall Validation Score
            </span>
            {overallStatus === "pass" ? (
              <CheckCircle className="size-5 text-emerald-400" />
            ) : overallStatus === "fail" ? (
              <XCircle className="size-5 text-rose-400" />
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className={cn("text-4xl font-semibold tracking-tight", scoreToneClasses.value)}>
                {score === null ? "N/A" : `${formatNumber(score, 1)}%`}
              </p>
              {confidence !== null ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Confidence {formatNumber(confidence, 1)}%
                </p>
              ) : null}
            </div>
            {overallStatus ? (
              <Badge variant="outline" className={scoreToneClasses.chip}>
                {overallStatus === "pass" ? "Validation Passed" : "Validation Failed"}
              </Badge>
            ) : null}
          </div>
          {score !== null ? <Progress value={score} className={scoreToneClasses.progress} /> : null}
        </CardContent>
      </Card>

      {metrics.length > 0 ? (
        <Card className="border-border/80 bg-card/40 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4 text-sky-300" />
              Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {metrics.map((metric, index) => (
                <div
                  key={metric.key}
                  className={cn(
                    "rounded-lg border p-3",
                    metricSurfaceClasses[index % metricSurfaceClasses.length],
                  )}
                >
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">{metric.label}</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{formatMetricValue(metric.value)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {checks.length > 0 ? (
        <Card className="border-border/80 bg-card/40 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-sky-300" />
              Validation Checks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {checks.map((check, index) => {
              const visual = getCheckVisual(check.status);
              const Icon = visual.icon;

              return (
                <div
                  key={`${check.name}-${index}`}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <Icon className={cn("mt-0.5 size-4 shrink-0", visual.iconClass)} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{check.name}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{check.detail}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={visual.badgeClass}>
                    {visual.badgeLabel}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {recommendations.length > 0 ? (
        <Card className="border-border/80 bg-card/40 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-sky-300" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recommendations.map((recommendation, index) => (
                <li
                  key={`${recommendation.slice(0, 32)}-${index}`}
                  className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground"
                >
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-300" />
                  <span className="leading-relaxed">{recommendation}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
