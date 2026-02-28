"use client"

import { useEffect, useMemo, useState } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { Bot, FlaskConical, Search, ShieldCheck, Upload } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { PipelineNodeData } from "@/types"

type EnhancedPipelineNodeData = PipelineNodeData & {
  progress?: number
  startedAt?: string
  completedAt?: string
  previewData?: string
}
type PipelineFlowNode = Node<EnhancedPipelineNodeData, "pipelineNode">
const iconMap = {
  upload: Upload,
  eda: Search,
  algorithm: Bot,
  codegen: FlaskConical,
  validation: ShieldCheck,
  deploy: ShieldCheck,
}
const statusClassMap: Record<EnhancedPipelineNodeData["status"], string> = {
  idle: "border-border/80",
  running: "border-blue-500/80",
  success: "border-emerald-500/80",
  error: "border-red-500/80",
}
const dotClassMap: Record<EnhancedPipelineNodeData["status"], string> = {
  idle: "bg-zinc-500",
  running: "bg-blue-500 animate-status-pulse",
  success: "bg-emerald-500",
  error: "bg-red-500",
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function formatElapsed(startedAt: string, nowMs: number): string {
  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return "0s"
  return formatDuration(nowMs - start)
}

export function PipelineNode({ data }: NodeProps<PipelineFlowNode>) {
  const Icon = iconMap[data.type]
  const isRunning = data.status === "running"
  const isSuccess = data.status === "success"
  const progressNumber =
    typeof data.progress === "number" && Number.isFinite(data.progress) ? data.progress : null
  const hasProgress = isRunning && progressNumber !== null
  const progressValue = hasProgress ? Math.min(100, Math.max(0, progressNumber)) : undefined
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!isRunning || !data.startedAt) return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [isRunning, data.startedAt])

  const elapsedLabel = useMemo(() => {
    if (!isRunning || !data.startedAt) return null
    return formatElapsed(data.startedAt, now)
  }, [data.startedAt, isRunning, now])

  const completionLabel = useMemo(() => {
    if (!isSuccess || !data.startedAt || !data.completedAt) return null
    const startedMs = new Date(data.startedAt).getTime()
    const completedMs = new Date(data.completedAt).getTime()
    if (Number.isNaN(startedMs) || Number.isNaN(completedMs)) return null
    return `took ${formatDuration(completedMs - startedMs)}`
  }, [data.completedAt, data.startedAt, isSuccess])

  const tooltipText = data.previewData?.trim().length ? data.previewData : `${data.label} - ${data.status}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`min-w-[220px] rounded-xl border bg-card/95 px-3.5 py-2.5 shadow-sm backdrop-blur transition-all duration-200 ${statusClassMap[data.status]}`}
        >
          <Handle
            type="target"
            position={Position.Left}
            className="!h-2 !w-2 !border-none !bg-muted-foreground"
          />
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="rounded-md bg-muted/60 p-1.5">
                <Icon className="size-4" />
              </span>
              <div className="truncate text-sm font-medium leading-tight">{data.label}</div>
            </div>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              <span className={`mr-1 inline-block h-2 w-2 rounded-full ${dotClassMap[data.status]}`} />
              {data.status}
            </Badge>
          </div>
          {data.detail ? <p className="mt-2 text-xs text-muted-foreground">{data.detail}</p> : null}
          {hasProgress && typeof progressValue === "number" ? (
            <div className="mt-2 space-y-1.5">
              <Progress value={progressValue} className="h-1.5" />
              <div className="text-[10px] text-muted-foreground">{Math.round(progressValue)}%</div>
            </div>
          ) : null}
          {elapsedLabel ? <div className="mt-2 text-[10px] text-blue-300">elapsed {elapsedLabel}</div> : null}
          {completionLabel ? <div className="mt-2 text-[10px] text-muted-foreground">{completionLabel}</div> : null}
          <Handle
            type="source"
            position={Position.Right}
            className="!h-2 !w-2 !border-none !bg-muted-foreground"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={10} className="max-w-72 whitespace-pre-wrap break-words">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  )
}
