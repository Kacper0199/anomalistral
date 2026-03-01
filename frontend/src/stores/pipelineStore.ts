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

import type { BlockType, BlockStatus, DAGDefinition, NodePosition, PipelineNodeData } from "@/types";

export type PipelineFlowNode = Node<PipelineNodeData, "pipelineNode">;

const BLOCK_LABELS: Record<BlockType, string> = {
  upload: "Upload",
  eda: "EDA",
  normalization: "Normalization",
  imputation: "Imputation",
  algorithm: "Algorithm",
  aggregator: "Aggregator",
  anomaly_viz: "Anomaly Visualization",
};

type PipelineStatus = "idle" | "running" | "paused" | "completed" | "error";

interface PipelineStore {
  nodes: PipelineFlowNode[];
  edges: Edge[];
  sessionId: string | null;
  isModified: boolean;
  pipelineStatus: PipelineStatus;
  activeChatBlockId: string | null;
  activeSettingsBlockId: string | null;
  onNodesChange: OnNodesChange<PipelineFlowNode>;
  onEdgesChange: OnEdgesChange<Edge>;
  onConnect: OnConnect;
  setNodeStatus: (nodeId: string, status: BlockStatus) => void;
  setNodeData: (nodeId: string, data: Partial<PipelineNodeData>) => void;
  resetPipeline: () => void;
  loadFromDAG: (dag: DAGDefinition, sessionId: string) => void;
  toDAGDefinition: () => DAGDefinition;
  addNode: (blockType: BlockType, position: NodePosition) => void;
  removeNode: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
  setPipelineStatus: (status: PipelineStatus) => void;
  setModified: (modified: boolean) => void;
  setActiveChatBlockId: (id: string | null) => void;
  setActiveSettingsBlockId: (id: string | null) => void;
  resetDownstream: (fromNodeId: string) => void;
}

export const usePipelineStore = create<PipelineStore>((set, get) => ({
  nodes: [],
  edges: [],
  sessionId: null,
  isModified: false,
  pipelineStatus: "idle",
  activeChatBlockId: null,
  activeSettingsBlockId: null,

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
      isModified: true,
    })),

  setNodeStatus: (nodeId, status) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, status } }
          : node
      ),
    })),

  setNodeData: (nodeId, data) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } }
          : node
      ),
    })),

  resetPipeline: () =>
    set({ nodes: [], edges: [], sessionId: null, isModified: false, pipelineStatus: "idle" }),

  loadFromDAG: (dag, sessionId) => {
    const nodes: PipelineFlowNode[] = dag.nodes.map((dagNode) => ({
      id: dagNode.id,
      type: "pipelineNode" as const,
      position: dagNode.position,
      data: {
        label: BLOCK_LABELS[dagNode.block_type] ?? dagNode.block_type,
        status: dagNode.status,
        type: dagNode.block_type,
        config: dagNode.config ?? null,
      },
    }));

    const edges: Edge[] = dag.edges.map((dagEdge) => ({
      id: dagEdge.id,
      source: dagEdge.source,
      target: dagEdge.target,
      sourceHandle: dagEdge.source_handle ?? undefined,
      targetHandle: dagEdge.target_handle ?? undefined,
    }));

    set({ nodes, edges, sessionId, isModified: false });
  },

  toDAGDefinition: (): DAGDefinition => {
    const { nodes, edges } = get();
    return {
      nodes: nodes.map((node) => ({
        id: node.id,
        block_type: node.data.type,
        position: node.position,
        config: (node.data.config as import("@/types").BlockConfig | null | undefined) ?? null,
        status: node.data.status,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        source_handle: edge.sourceHandle ?? null,
        target_handle: edge.targetHandle ?? null,
      })),
    };
  },

  addNode: (blockType, position) =>
    set((state) => {
      const newNode: PipelineFlowNode = {
        id: crypto.randomUUID(),
        type: "pipelineNode",
        position,
        data: {
          label: BLOCK_LABELS[blockType] ?? blockType,
          status: "idle",
          type: blockType,
        },
      };
      return { nodes: [...state.nodes, newNode], isModified: true };
    }),

  removeNode: (nodeId) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      isModified: true,
    })),

  removeEdge: (edgeId) =>
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== edgeId),
      isModified: true,
    })),

  setPipelineStatus: (status) => set({ pipelineStatus: status }),

  setModified: (modified) => set({ isModified: modified }),
  setActiveChatBlockId: (id) => set({ activeChatBlockId: id }),
  setActiveSettingsBlockId: (id) => set({ activeSettingsBlockId: id }),

  resetDownstream: (fromNodeId) =>
    set((state) => {
      const reachable = new Set<string>();
      const queue = [fromNodeId];

      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const edge of state.edges) {
          if (edge.source === current && !reachable.has(edge.target)) {
            reachable.add(edge.target);
            queue.push(edge.target);
          }
        }
      }

      return {
        nodes: state.nodes.map((node) =>
          reachable.has(node.id)
            ? { ...node, data: { ...node.data, status: "idle" as BlockStatus } }
            : node
        ),
      };
    }),
}));
