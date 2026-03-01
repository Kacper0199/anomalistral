"use client";

import { useCallback } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  ReactFlow,
  useReactFlow,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";

import { usePipelineStore, type PipelineFlowNode } from "@/stores/pipelineStore";
import type { BlockType } from "@/types";

import { DAGToolbar } from "./DAGToolbar";
import { PipelineEdge } from "./PipelineEdge";
import { PipelineNode } from "./PipelineNode";

import "@xyflow/react/dist/style.css";

interface PipelineEditorProps {
  onBlockDoubleClick?: (blockId: string) => void;
}

const nodeTypes = {
  pipelineNode: PipelineNode,
};

const edgeTypes = {
  default: PipelineEdge,
};

const defaultEdgeOptions = {
  type: "default",
  animated: true,
};

const fitViewOptions = {
  padding: 0.3,
  maxZoom: 1.2,
};

const snapGrid: [number, number] = [20, 20];

const backgroundGap: [number, number] = [20, 20];

const proOptions = { hideAttribution: true };

function FlowCanvas({ onBlockDoubleClick }: PipelineEditorProps) {
  const { screenToFlowPosition } = useReactFlow();
  const nodes = usePipelineStore((s) => s.nodes);
  const edges = usePipelineStore((s) => s.edges);
  const sessionId = usePipelineStore((s) => s.sessionId);
  const onNodesChange = usePipelineStore((s) => s.onNodesChange);
  const onEdgesChange = usePipelineStore((s) => s.onEdgesChange);
  const onConnect = usePipelineStore((s) => s.onConnect);

  const handleNodeDoubleClick: NodeMouseHandler<PipelineFlowNode> = useCallback(
    (_event, node) => {
      onBlockDoubleClick?.(node.id);
    },
    [onBlockDoubleClick]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const blockType = event.dataTransfer.getData(
        "application/anomalistral-block"
      ) as BlockType;
      if (!blockType) return;
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      usePipelineStore.getState().addNode(blockType, position);
    },
    [screenToFlowPosition]
  );

  return (
    <div className="flex h-full flex-col gap-2">
      <DAGToolbar sessionId={sessionId} />
      <div
        className="relative h-full min-h-[420px] w-full flex-1 overflow-hidden rounded-xl border border-border/80 bg-card/40"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <ReactFlow<PipelineFlowNode, Edge>
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={handleNodeDoubleClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          fitViewOptions={fitViewOptions}
          snapToGrid
          snapGrid={snapGrid}
          connectionLineType={ConnectionLineType.SmoothStep}
          proOptions={proOptions}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={backgroundGap}
            size={1}
            color="var(--border)"
          />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

export function PipelineEditor({ onBlockDoubleClick }: PipelineEditorProps) {
  return <FlowCanvas onBlockDoubleClick={onBlockDoubleClick} />;
}
