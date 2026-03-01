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
  const edges = usePipelineStore((s) => s.edges);
  const setNodeData = usePipelineStore((s) => s.setNodeData);
  const node = blockId ? nodes.find((n) => n.id === blockId) ?? null : null;
  const blockType = node?.data.type ?? null;

  const [method, setMethod] = useState("");
  const [columns, setColumns] = useState("");
  const [weightsObj, setWeightsObj] = useState<Record<string, number>>({});
  const [promptOverride, setPromptOverride] = useState("");
  const [params, setParams] = useState("");
  const [saving, setSaving] = useState(false);

  const existingConfig = node?.data.config;
  const incomingEdges = blockType === "aggregator" && blockId 
    ? edges.filter((e) => e.target === blockId) 
    : [];
  const incomingNodes = incomingEdges
    .map((e) => nodes.find((n) => n.id === e.source))
    .filter((n) => n !== undefined);

  useEffect(() => {
    if (!open) return;
    const cfg = existingConfig;
    setMethod(cfg?.method ?? "");
    setColumns(cfg?.columns?.join(", ") ?? "");
    setWeightsObj(cfg?.weights ?? {});
    setPromptOverride(cfg?.prompt_override ?? "");
    setParams(cfg?.params ? JSON.stringify(cfg.params, null, 2) : "");
  }, [open, blockId, existingConfig]);

  async function handleSave() {
    if (!sessionId || !blockId) return;
    setSaving(true);
    try {
      let parsedWeights: Record<string, number> | undefined;
      if (blockType === "aggregator") {
        parsedWeights = Object.keys(weightsObj).length > 0 ? weightsObj : undefined;
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
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Inputs Weights</label>
              {incomingNodes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Connect algorithm blocks to set weights.</p>
              ) : (
                incomingNodes.map((n, i) => (
                  <div key={n.id} className="flex items-center gap-2">
                    <span className="text-xs w-20 truncate" title={n.data.label}>Input {i + 1} ({n.data.label})</span>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      className="h-8"
                      value={weightsObj[n.id] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : undefined;
                        setWeightsObj((prev) => {
                          const next = { ...prev };
                          if (val === undefined || isNaN(val)) {
                            delete next[n.id];
                          } else {
                            next[n.id] = val;
                          }
                          return next;
                        });
                      }}
                      placeholder="e.g. 0.5"
                    />
                  </div>
                ))
              )}
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
