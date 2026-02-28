"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
} from "@xyflow/react";

import { usePipelineStore, type PipelineFlowNode } from "@/stores/pipelineStore";

import { PipelineNode } from "./PipelineNode";

import "@xyflow/react/dist/style.css";

const nodeTypes = {
  pipelineNode: PipelineNode,
};

export function PipelineEditor() {
  const nodes = usePipelineStore((state) => state.nodes);
  const edges = usePipelineStore((state) => state.edges);
  const onNodesChange = usePipelineStore((state) => state.onNodesChange);
  const onEdgesChange = usePipelineStore((state) => state.onEdgesChange);
  const onConnect = usePipelineStore((state) => state.onConnect);

  return (
    <ReactFlowProvider>
      <div className="h-full min-h-[420px] w-full rounded-xl border border-border/80 bg-card/40">
        <ReactFlow<PipelineFlowNode, Edge>
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} size={1} color="var(--border)" />
          <MiniMap
            zoomable={false}
            pannable={false}
            className="!bg-background/90"
            style={{ width: 120, height: 80 }}
          />
          <Controls className="!border-border !bg-background/90" />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}
