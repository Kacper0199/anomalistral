"use client";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnConnect,
  type OnNodesChange,
} from "@xyflow/react";
import { create } from "zustand";

import type { PipelineNodeData } from "@/types";

export type PipelineFlowNode = Node<PipelineNodeData, "pipelineNode">;

function createDefaultNodes(): PipelineFlowNode[] {
  return [
    {
      id: "upload",
      type: "pipelineNode",
      position: { x: 40, y: 100 },
      data: { label: "Upload", status: "idle", type: "upload" },
    },
    {
      id: "eda",
      type: "pipelineNode",
      position: { x: 300, y: 100 },
      data: { label: "EDA", status: "idle", type: "eda" },
    },
    {
      id: "algorithm",
      type: "pipelineNode",
      position: { x: 560, y: 100 },
      data: { label: "Algorithm Selection", status: "idle", type: "algorithm" },
    },
    {
      id: "codegen",
      type: "pipelineNode",
      position: { x: 820, y: 100 },
      data: { label: "Code Generation", status: "idle", type: "codegen" },
    },
    {
      id: "validation",
      type: "pipelineNode",
      position: { x: 1080, y: 100 },
      data: { label: "Validation", status: "idle", type: "validation" },
    },
  ];
}

function createDefaultEdges(): Edge[] {
  return [
    { id: "e-upload-eda", source: "upload", target: "eda" },
    { id: "e-eda-algorithm", source: "eda", target: "algorithm" },
    { id: "e-algorithm-codegen", source: "algorithm", target: "codegen" },
    { id: "e-codegen-validation", source: "codegen", target: "validation" },
  ];
}

interface PipelineStore {
  nodes: PipelineFlowNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<PipelineFlowNode>;
  onEdgesChange: OnEdgesChange<Edge>;
  onConnect: OnConnect;
  setNodeStatus: (nodeId: string, status: PipelineNodeData["status"]) => void;
  resetPipeline: () => void;
}

export const usePipelineStore = create<PipelineStore>((set) => ({
  nodes: createDefaultNodes(),
  edges: createDefaultEdges(),
  onNodesChange: (changes) =>
    set((state) => ({
      nodes: applyNodeChanges<PipelineFlowNode>(changes, state.nodes),
    })),
  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    })),
  onConnect: (connection) =>
    set((state) => ({
      edges: addEdge(connection, state.edges),
    })),
  setNodeStatus: (nodeId, status) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                status,
              },
            }
          : node
      ),
    })),
  resetPipeline: () => set({ nodes: createDefaultNodes(), edges: createDefaultEdges() }),
}));
