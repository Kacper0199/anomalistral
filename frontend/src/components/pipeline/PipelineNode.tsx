import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Bot, FlaskConical, Search, ShieldCheck, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { PipelineNodeData } from "@/types";

type PipelineFlowNode = Node<PipelineNodeData, "pipelineNode">;

const iconMap = {
  upload: Upload,
  eda: Search,
  algorithm: Bot,
  codegen: FlaskConical,
  validation: ShieldCheck,
  deploy: ShieldCheck,
};

const statusClassMap: Record<PipelineNodeData["status"], string> = {
  idle: "border-border/80",
  running: "border-blue-500/80",
  success: "border-emerald-500/80",
  error: "border-red-500/80",
};

const dotClassMap: Record<PipelineNodeData["status"], string> = {
  idle: "bg-zinc-500",
  running: "bg-blue-500 animate-status-pulse",
  success: "bg-emerald-500",
  error: "bg-red-500",
};

export function PipelineNode({ data }: NodeProps<PipelineFlowNode>) {
  const Icon = iconMap[data.type];

  return (
    <div
      className={`min-w-[190px] rounded-xl border bg-card/90 px-3 py-2 shadow-sm backdrop-blur ${statusClassMap[data.status]}`}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-none !bg-muted-foreground" />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-muted/60 p-1.5">
            <Icon className="size-4" />
          </span>
          <div className="text-sm font-medium leading-tight">{data.label}</div>
        </div>
        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
          <span className={`mr-1 inline-block h-2 w-2 rounded-full ${dotClassMap[data.status]}`} />
          {data.status}
        </Badge>
      </div>
      {data.detail ? <p className="mt-2 text-xs text-muted-foreground">{data.detail}</p> : null}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-none !bg-muted-foreground" />
    </div>
  );
}
