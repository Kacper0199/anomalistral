"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { updateBlock } from "@/lib/api";
import { usePipelineStore } from "@/stores/pipelineStore";
import type { BlockConfig, BlockType } from "@/types";

interface BlockSettingsProps {
  open: boolean;
  onClose: () => void;
  blockId: string | null;
  sessionId: string | null;
}

const blockTypeLabels: Record<BlockType, string> = {
  upload: "Upload",
  eda: "EDA",
  normalization: "Normalization",
  imputation: "Imputation",
  algorithm: "Algorithm",
  aggregator: "Aggregator",
  anomaly_viz: "Anomaly Visualization",
};

const METHOD_OPTIONS: Record<string, { value: string; label: string }[]> = {
  normalization: [
    { value: "standard_scaler", label: "Standard Scaler (z-score)" },
    { value: "min_max", label: "Min-Max" },
  ],
  imputation: [
    { value: "mean", label: "Mean" },
    { value: "median", label: "Median" },
  ],
};

export function BlockSettings({ open, onClose, blockId, sessionId }: BlockSettingsProps) {
  const nodes = usePipelineStore((s) => s.nodes);
  const setNodeData = usePipelineStore((s) => s.setNodeData);
  const node = blockId ? nodes.find((n) => n.id === blockId) ?? null : null;
  const blockType = node?.data.type ?? null;

  const [method, setMethod] = useState("");
  const [columns, setColumns] = useState("");
  const [weights, setWeights] = useState("");
  const [promptOverride, setPromptOverride] = useState("");
  const [params, setParams] = useState("");
  const [saving, setSaving] = useState(false);

  const existingConfig = node?.data.config;

  useEffect(() => {
    if (!open) return;
    const cfg = existingConfig;
    setMethod(cfg?.method ?? "");
    setColumns(cfg?.columns?.join(", ") ?? "");
    setWeights(cfg?.weights ? JSON.stringify(cfg.weights, null, 2) : "");
    setPromptOverride(cfg?.prompt_override ?? "");
    setParams(cfg?.params ? JSON.stringify(cfg.params, null, 2) : "");
  }, [open, blockId, existingConfig]);

  async function handleSave() {
    if (!sessionId || !blockId) return;
    setSaving(true);
    try {
      let parsedWeights: Record<string, number> | undefined;
      if (weights.trim()) {
        parsedWeights = JSON.parse(weights) as Record<string, number>;
      }
      let parsedParams: Record<string, unknown> | undefined;
      if (params.trim()) {
        parsedParams = JSON.parse(params) as Record<string, unknown>;
      }
      const config: BlockConfig = {
        method: method.trim() || undefined,
        weights: parsedWeights,
        columns: columns.trim() ? columns.split(",").map((c) => c.trim()).filter(Boolean) : undefined,
        prompt_override: promptOverride.trim() || undefined,
        params: parsedParams,
      };
      await updateBlock(sessionId, blockId, config);
      setNodeData(blockId, { config });
      toast.success("Block settings saved");
      onClose();
    } catch (err) {
      toast.error(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  const typeLabel = blockType ? (blockTypeLabels[blockType] ?? blockType) : "Block";
  const showMethod = blockType === "normalization" || blockType === "imputation";
  const methodOptions = blockType ? (METHOD_OPTIONS[blockType] ?? []) : [];
  const showColumns = blockType === "upload" || blockType === "normalization" || blockType === "imputation";
  const showWeights = blockType === "aggregator";
  const showPrompt = blockType === "algorithm";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{typeLabel} Settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {showMethod && methodOptions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="block-method" className="text-sm font-medium">Method</label>
              <select
                id="block-method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">— select —</option>
                {methodOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {showColumns && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="block-columns" className="text-sm font-medium">Columns (comma-separated)</label>
              <Input
                id="block-columns"
                placeholder="col1, col2, col3"
                value={columns}
                onChange={(e) => setColumns(e.target.value)}
              />
            </div>
          )}

          {showWeights && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="block-weights" className="text-sm font-medium">Weights (JSON)</label>
              <Textarea
                id="block-weights"
                placeholder='{"iforest": 0.6, "lof": 0.4}'
                value={weights}
                onChange={(e) => setWeights(e.target.value)}
                rows={3}
                className="font-mono text-xs"
              />
            </div>
          )}

          {showPrompt && (
            <>
              <Separator />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="block-prompt" className="text-sm font-medium">System Prompt Override</label>
                <Textarea
                  id="block-prompt"
                  placeholder="Optional: custom instructions for the algorithm generation..."
                  value={promptOverride}
                  onChange={(e) => setPromptOverride(e.target.value)}
                  rows={4}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={handleSave} disabled={saving || !sessionId}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
