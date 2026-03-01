"use client";

import { useState } from "react";
import {
  BarChart3,
  Bot,
  GitMerge,
  Layers,
  PenTool,
  Pause,
  Play,
  RefreshCw,
  Save,
  Search,
  Square,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { controlPipeline, saveDAG, validateDAG } from "@/lib/api";
import { usePipelineStore } from "@/stores/pipelineStore";
import type { BlockType } from "@/types";

interface DAGToolbarProps {
  sessionId: string | null;
}

const blockPalette: { type: BlockType; label: string; Icon: React.ElementType }[] = [
  { type: "upload", label: "Upload", Icon: Upload },
  { type: "eda", label: "EDA", Icon: Search },
  { type: "normalization", label: "Normalize", Icon: Layers },
  { type: "imputation", label: "Impute", Icon: PenTool },
  { type: "algorithm", label: "Algorithm", Icon: Bot },
  { type: "aggregator", label: "Aggregator", Icon: GitMerge },
  { type: "anomaly_viz", label: "Anomaly Viz", Icon: BarChart3 },
];

export function DAGToolbar({ sessionId }: DAGToolbarProps) {
  const pipelineStatus = usePipelineStore((s) => s.pipelineStatus);
  const isModified = usePipelineStore((s) => s.isModified);
  const toDAGDefinition = usePipelineStore((s) => s.toDAGDefinition);
  const setModified = usePipelineStore((s) => s.setModified);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);

  const isIdle = pipelineStatus === "idle";
  const isRunning = pipelineStatus === "running";
  const isPaused = pipelineStatus === "paused";
  const isCompleted = pipelineStatus === "completed";
  const isError = pipelineStatus === "error";

  function onDragStart(e: React.DragEvent, blockType: BlockType) {
    e.dataTransfer.setData("application/anomalistral-block", blockType);
    e.dataTransfer.effectAllowed = "move";
  }

  async function handleControl(action: "run" | "stop" | "pause" | "rerun") {
    if (!sessionId) return;
    try {
      await controlPipeline(sessionId, { action });
    } catch (err) {
      toast.error(`Failed to ${action} pipeline: ${(err as Error).message}`);
    }
  }

  async function handleSave() {
    if (!sessionId) return;
    setSaving(true);
    try {
      const dag = toDAGDefinition();
      await saveDAG(sessionId, dag);
      setModified(false);
      toast.success("DAG saved");
    } catch (err) {
      toast.error(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleValidate() {
    if (!sessionId) return;
    setValidating(true);
    try {
      const result = await validateDAG(sessionId);
      if (result.valid) {
        toast.success("DAG is valid");
      } else {
        toast.error(`Validation failed: ${result.errors.join(", ")}`);
      }
    } catch (err) {
      toast.error(`Validation error: ${(err as Error).message}`);
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2 py-1.5 backdrop-blur">
      <div className="flex items-center gap-1.5">
        {blockPalette.map(({ type, label, Icon }) => (
          <Tooltip key={type}>
            <TooltipTrigger asChild>
              <div
                draggable
                onDragStart={(e) => onDragStart(e, type)}
                className="flex cursor-grab items-center gap-1.5 rounded-md border border-border/50 bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/80 hover:text-foreground active:cursor-grabbing select-none"
              >
                <Icon className="size-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
              disabled={!isIdle && !isPaused}
              onClick={() => handleControl("run")}
            >
              <Play className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{isPaused ? "Resume" : "Run"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
              disabled={!isRunning}
              onClick={() => handleControl("pause")}
            >
              <Pause className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Pause</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
              disabled={!isRunning && !isPaused}
              onClick={() => handleControl("stop")}
            >
              <Square className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Stop</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
              disabled={!isCompleted && !isError}
              onClick={() => handleControl("rerun")}
            >
              <RefreshCw className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Rerun</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs"
              disabled={!isModified || saving || !sessionId}
              onClick={handleSave}
            >
              <Save className="size-3.5" />
              {saving ? "Saving…" : "Save"}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Save DAG to backend</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs"
              disabled={validating || !sessionId}
              onClick={handleValidate}
            >
              <Search className="size-3.5" />
              {validating ? "Checking…" : "Validate"}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Validate DAG structure</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
