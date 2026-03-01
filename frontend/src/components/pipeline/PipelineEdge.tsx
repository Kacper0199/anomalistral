"use client";

import { useState } from "react";
import {
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";

import { usePipelineStore } from "@/stores/pipelineStore";

export function PipelineEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  animated,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const strokeColor =
    selected || animated ? "rgb(59 130 246)" : "hsl(var(--muted-foreground))";

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    usePipelineStore.getState().removeEdge(id);
  }

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2}
        strokeDasharray={animated ? "6 3" : undefined}
        className={animated ? "animate-[dash_1s_linear_infinite]" : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: "pointer" }}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: "pointer" }}
      />
      {hovered && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <button
              type="button"
              onClick={handleDelete}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-card border border-red-500/50 text-red-400 hover:text-red-300 hover:border-red-400 shadow-sm transition-colors"
            >
              <X className="size-2.5" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
