"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react";
import {
  BarChart3,
  Bot,
  GitMerge,
  Layers,
  MessageSquare,
  PenTool,
  Search,
  Settings,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PipelineNodeData } from "@/types";
import { usePipelineStore, type PipelineFlowNode } from "@/stores/pipelineStore";

const iconMap: Record<string, React.ElementType> = {
  upload: Upload,
  eda: Search,
  normalization: Layers,
  imputation: PenTool,
  algorithm: Bot,
  aggregator: GitMerge,
  anomaly_viz: BarChart3,
};

const statusBorderMap: Record<PipelineNodeData["status"], string> = {
  idle: "border-zinc-600/60",
  running: "border-blue-500/80",
  success: "border-emerald-500/80",
  error: "border-red-500/80",
  paused: "border-amber-500/80",
};

const dotClassMap: Record<PipelineNodeData["status"], string> = {
  idle: "bg-zinc-500",
  running: "bg-blue-500 animate-pulse",
  success: "bg-emerald-500",
  error: "bg-red-500",
  paused: "bg-amber-500",
};

const badgeColorMap: Record<PipelineNodeData["status"], string> = {
  idle: "text-zinc-400",
  running: "text-blue-400",
  success: "text-emerald-400",
  error: "text-red-400",
  paused: "text-amber-400",
};

const targetHandleStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  background: "hsl(var(--muted-foreground))",
  border: "none",
};

const sourceHandleStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  background: "hsl(var(--muted-foreground))",
  border: "none",
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatElapsed(startedAt: string, nowMs: number): string {
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return "0s";
  return formatDuration(nowMs - start);
}

export function PipelineNode({ id, data }: NodeProps<PipelineFlowNode>) {
  const Icon = iconMap[data.type] ?? Bot;
  const isRunning = data.status === "running";
  const isSuccess = data.status === "success";
  const [hovered, setHovered] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning || !data.startedAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isRunning, data.startedAt]);

  const progressNumber =
    typeof data.progress === "number" && Number.isFinite(data.progress)
      ? data.progress
      : null;
  const hasProgress = isRunning && progressNumber !== null;
  const progressValue = hasProgress ? Math.min(100, Math.max(0, progressNumber!)) : undefined;

  const elapsedLabel = useMemo(() => {
    if (!isRunning || !data.startedAt) return null;
    return formatElapsed(data.startedAt, now);
  }, [data.startedAt, isRunning, now]);

  const completionLabel = useMemo(() => {
    if (!isSuccess || !data.startedAt || !data.completedAt) return null;
    const startedMs = new Date(data.startedAt).getTime();
    const completedMs = new Date(data.completedAt).getTime();
    if (Number.isNaN(startedMs) || Number.isNaN(completedMs)) return null;
    return `took ${formatDuration(completedMs - startedMs)}`;
  }, [data.completedAt, data.startedAt, isSuccess]);

  const tooltipText =
    data.previewData?.trim().length ? data.previewData : `${data.label} — ${data.status}`;

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    usePipelineStore.getState().removeNode(id);
  }

  function handleSettings(e: React.MouseEvent) {
    e.stopPropagation();
  }

  function handleChat(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`relative min-w-[200px] rounded-xl border bg-card/95 px-3.5 py-2.5 shadow-sm backdrop-blur transition-all duration-200 ${statusBorderMap[data.status]}`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <Handle
            type="target"
            position={Position.Top}
            style={targetHandleStyle}
          />

          {hovered && (
            <div className="absolute -top-3 right-2 flex items-center gap-1">
              <button
                type="button"
                onClick={handleChat}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border/60 text-muted-foreground hover:text-foreground shadow-sm transition-colors"
              >
                <MessageSquare className="size-3" />
              </button>
              <button
                type="button"
                onClick={handleSettings}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border/60 text-muted-foreground hover:text-foreground shadow-sm transition-colors"
              >
                <Settings className="size-3" />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-card border border-red-500/40 text-red-400 hover:text-red-300 hover:border-red-400 shadow-sm transition-colors"
              >
                <X className="size-3" />
              </button>
            </div>
          )}

          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="rounded-md bg-muted/60 p-1.5">
                <Icon className="size-4" />
              </span>
              <div className="truncate text-sm font-medium leading-tight">{data.label}</div>
            </div>
            <Badge
              variant="secondary"
              className={`text-[10px] uppercase tracking-wide ${badgeColorMap[data.status]}`}
            >
              <span
                className={`mr-1 inline-block h-2 w-2 rounded-full ${dotClassMap[data.status]}`}
              />
              {data.status}
            </Badge>
          </div>

          {data.detail ? (
            <p className="mt-2 text-xs text-muted-foreground">{data.detail}</p>
          ) : null}

          {hasProgress && typeof progressValue === "number" ? (
            <div className="mt-2 space-y-1.5">
              <Progress value={progressValue} className="h-1.5" />
              <div className="text-[10px] text-muted-foreground">{Math.round(progressValue)}%</div>
            </div>
          ) : null}

          {elapsedLabel ? (
            <div className="mt-2 text-[10px] text-blue-300">elapsed {elapsedLabel}</div>
          ) : null}

          {completionLabel ? (
            <div className="mt-2 text-[10px] text-muted-foreground">{completionLabel}</div>
          ) : null}

          <Handle
            type="source"
            position={Position.Bottom}
            style={sourceHandleStyle}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={10} className="max-w-72 whitespace-pre-wrap break-words">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}
