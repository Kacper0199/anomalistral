"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useParams } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";

import { BlockChat } from "@/components/chat/BlockChat";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { PanelError } from "@/components/error/PanelError";
import { Header } from "@/components/layout/Header";
import { SessionSkeleton } from "@/components/loading/SessionSkeleton";
import { PipelineEditor } from "@/components/pipeline/PipelineEditor";
import { BlockSettings } from "@/components/pipeline/BlockSettings";
import { DAGToolbar } from "@/components/pipeline/DAGToolbar";
import { TemplateSelector } from "@/components/pipeline/TemplateSelector";
import { AnomalyChart } from "@/components/results/AnomalyChart";
import { CodeViewer } from "@/components/results/CodeViewer";
import { EDAReport } from "@/components/results/EDAReport";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/hooks/useSession";
import { useSSE } from "@/hooks/useSSE";
import { getDAG, saveDAG } from "@/lib/api";
import { usePipelineStore } from "@/stores/pipelineStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useStreamStore } from "@/stores/streamStore";
import type { Session, DAGDefinition, BlockType } from "@/types";

interface CodeEntry {
  blockId: string;
  blockType: string;
  label: string;
  code: string;
}

function getPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

function getPayloadRecord(
  payload: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const value = payload[key];
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function SessionInner({ sessionId }: { sessionId: string }) {
  const [blockResults, setBlockResults] = useState<Record<string, Record<string, unknown>>>({});
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const processedSeqRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dagLoadedRef = useRef(false);

  const { currentSession, loadSession } = useSession();
  const setSession = useSessionStore((s) => s.setSession);
  const addMessage = useSessionStore((s) => s.addMessage);
  const addBlockMessage = useSessionStore((s) => s.addBlockMessage);

  const events = useStreamStore((s) => s.events);
  const clearStream = useStreamStore((s) => s.clear);

  const nodes = usePipelineStore((s) => s.nodes);
  const activeChatBlockId = usePipelineStore((s) => s.activeChatBlockId);
  const activeSettingsBlockId = usePipelineStore((s) => s.activeSettingsBlockId);
  const setActiveChatBlockId = usePipelineStore((s) => s.setActiveChatBlockId);
  const setActiveSettingsBlockId = usePipelineStore((s) => s.setActiveSettingsBlockId);
  const isModified = usePipelineStore((s) => s.isModified);
  const resetPipeline = usePipelineStore((s) => s.resetPipeline);
  const setNodeStatus = usePipelineStore((s) => s.setNodeStatus);
  const loadFromDAG = usePipelineStore((s) => s.loadFromDAG);
  const toDAGDefinition = usePipelineStore((s) => s.toDAGDefinition);
  const setModified = usePipelineStore((s) => s.setModified);

  const { connect, disconnect, isConnected } = useSSE(sessionId);

  const sseRef = useRef({ connect, disconnect, clearStream });
  useEffect(() => {
    sseRef.current = { connect, disconnect, clearStream };
  });

  useEffect(() => {
    processedSeqRef.current = 0;
    dagLoadedRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    void loadSession(sessionId);
  }, [loadSession, sessionId]);

  useEffect(() => {
    sseRef.current.connect();
    return () => {
      sseRef.current.disconnect();
      sseRef.current.clearStream();
    };
  }, [sessionId]);

  useEffect(() => {
    resetPipeline();
  }, [sessionId, resetPipeline]);

  useEffect(() => {
    if (!currentSession || dagLoadedRef.current) return;
    dagLoadedRef.current = true;
    const hasDag = currentSession.dag_config !== null || currentSession.template_id !== null;
    if (!hasDag) {
      void Promise.resolve().then(() => setShowTemplateSelector(true));
      return;
    }
    getDAG(sessionId)
      .then((dag) => {
        loadFromDAG(dag, sessionId);
        setShowTemplateSelector(false);
      })
      .catch(() => {
        setShowTemplateSelector(true);
      });
  }, [currentSession, sessionId, loadFromDAG]);

  const handleTemplateApply = useCallback(
    (dag: DAGDefinition) => {
      loadFromDAG(dag, sessionId);
      setShowTemplateSelector(false);
    },
    [loadFromDAG, sessionId]
  );

  const handleBlockClose = useCallback(() => {
    setActiveChatBlockId(null);
  }, [setActiveChatBlockId]);

  useEffect(() => {
    if (!isModified) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const dag = toDAGDefinition();
      saveDAG(sessionId, dag)
        .then(() => setModified(false))
        .catch(() => {});
    }, 1000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [isModified, sessionId, toDAGDefinition, setModified]);

  useEffect(() => {
    if (events.length === 0) return;

    const pendingEvents = events.filter((e) => e.seq > processedSeqRef.current);
    if (pendingEvents.length === 0) return;

    const updateSession = (updater: (s: Session) => Session) => {
      const s = useSessionStore.getState().currentSession;
      if (!s) return;
      setSession(updater(s));
    };

    for (const event of pendingEvents) {
      processedSeqRef.current = event.seq;

      if (event.type === "pipeline.started") {
        updateSession((s) => ({ ...s, status: "eda_running" }));
        addMessage({ id: `${event.seq}`, role: "system", content: "Pipeline started.", timestamp: event.ts });
        continue;
      }

      if (event.type === "pipeline.completed") {
        updateSession((s) => ({ ...s, status: "completed" }));
        addMessage({ id: `${event.seq}`, role: "system", content: "Pipeline completed successfully.", timestamp: event.ts });
        continue;
      }

      if (event.type === "pipeline.failed") {
        const errorMsg = getPayloadString(event.payload, "error") ?? "Unknown error";
        updateSession((s) => ({ ...s, status: "failed" }));
        addMessage({ id: `${event.seq}`, role: "system", content: `Pipeline failed: ${errorMsg}`, timestamp: event.ts });
        continue;
      }

      if (event.type === "block.started") {
        const blockId = getPayloadString(event.payload, "block_id");
        const blockType = getPayloadString(event.payload, "block_type");
        if (blockId) {
          setNodeStatus(blockId, "running");
          addMessage({
            id: `${event.seq}`,
            role: "system",
            content: `Block ${blockType ?? blockId} started.`,
            timestamp: event.ts,
          });
        }
        continue;
      }

      if (event.type === "block.completed") {
        const blockId = getPayloadString(event.payload, "block_id");
        const blockType = getPayloadString(event.payload, "block_type");
        const result = getPayloadRecord(event.payload, "result");
        if (blockId) {
          setNodeStatus(blockId, "success");
          if (result) {
            setBlockResults((prev) => ({ ...prev, [blockId]: result }));
            if (blockType === "eda") {
              updateSession((s) => ({ ...s, eda_results: result }));
            }
          }
          addMessage({
            id: `${event.seq}`,
            role: "system",
            content: `Block ${blockType ?? blockId} completed.`,
            timestamp: event.ts,
          });
        }
        continue;
      }

      if (event.type === "block.failed") {
        const blockId = getPayloadString(event.payload, "block_id");
        const blockType = getPayloadString(event.payload, "block_type");
        const errorMsg = getPayloadString(event.payload, "error") ?? "Unknown error";
        if (blockId) {
          setNodeStatus(blockId, "error");
          addMessage({
            id: `${event.seq}`,
            role: "system",
            content: `Block ${blockType ?? blockId} failed: ${errorMsg}`,
            timestamp: event.ts,
          });
        }
        continue;
      }

      if (event.type === "block.agent.message") {
        const blockId = getPayloadString(event.payload, "block_id");
        const text = getPayloadString(event.payload, "text");
        const agent = getPayloadString(event.payload, "agent");
        if (blockId && text) {
          const msg = { id: `${event.seq}`, role: "assistant" as const, content: text, agent, timestamp: event.ts };
          addBlockMessage(blockId, msg);
          addMessage(msg);
        }
        continue;
      }

      if (event.type === "dag.validated") {
        const valid = event.payload["valid"];
        const errors = event.payload["errors"];
        const errList = Array.isArray(errors) ? (errors as string[]).join(", ") : "";
        addMessage({
          id: `${event.seq}`,
          role: "system",
          content: valid ? "DAG validation passed." : `DAG validation failed: ${errList}`,
          timestamp: event.ts,
        });
        continue;
      }

      if (event.type === "eda.started") {
        setNodeStatus("eda", "running");
        updateSession((s) => ({ ...s, status: "eda_running" }));
        addMessage({ id: `${event.seq}`, role: "system", content: "EDA analysis started...", timestamp: event.ts });
        continue;
      }

      if (event.type === "eda.completed") {
        setNodeStatus("eda", "success");
        const results = getPayloadRecord(event.payload, "results");
        if (results) {
          updateSession((s) => ({ ...s, eda_results: results }));
          setBlockResults((prev) => ({ ...prev, eda: results }));
        }
        addMessage({ id: `${event.seq}`, role: "system", content: "EDA analysis completed.", timestamp: event.ts });
        continue;
      }

      if (event.type === "eda.failed") {
        setNodeStatus("eda", "error");
        const errorMsg = getPayloadString(event.payload, "error") ?? "Unknown error";
        addMessage({ id: `${event.seq}`, role: "system", content: `EDA failed: ${errorMsg}`, timestamp: event.ts });
        continue;
      }

      if (event.type === "algorithm.started") {
        setNodeStatus("algorithm", "running");
        updateSession((s) => ({ ...s, status: "algorithm_running" }));
        addMessage({ id: `${event.seq}`, role: "system", content: "Algorithm selection started...", timestamp: event.ts });
        continue;
      }

      if (event.type === "algorithm.completed") {
        setNodeStatus("algorithm", "success");
        const recommendations = getPayloadRecord(event.payload, "recommendations");
        if (recommendations) {
          updateSession((s) => ({ ...s, algorithm_recommendations: recommendations }));
        }
        addMessage({ id: `${event.seq}`, role: "system", content: "Algorithm selection completed.", timestamp: event.ts });
        continue;
      }

      if (event.type === "algorithm.failed") {
        setNodeStatus("algorithm", "error");
        const errorMsg = getPayloadString(event.payload, "error") ?? "Unknown error";
        addMessage({ id: `${event.seq}`, role: "system", content: `Algorithm selection failed: ${errorMsg}`, timestamp: event.ts });
        continue;
      }

      if (event.type === "codegen.started") {
        setNodeStatus("codegen", "running");
        updateSession((s) => ({ ...s, status: "codegen_running" }));
        addMessage({ id: `${event.seq}`, role: "system", content: "Code generation started...", timestamp: event.ts });
        continue;
      }

      if (event.type === "codegen.completed") {
        setNodeStatus("codegen", "success");
        const generatedCode = getPayloadString(event.payload, "code");
        if (generatedCode) {
          updateSession((s) => ({ ...s, generated_code: generatedCode }));
          setBlockResults((prev) => ({ ...prev, codegen: { code: generatedCode } }));
        }
        addMessage({ id: `${event.seq}`, role: "system", content: "Code generation completed.", timestamp: event.ts });
        continue;
      }

      if (event.type === "codegen.failed") {
        setNodeStatus("codegen", "error");
        const errorMsg = getPayloadString(event.payload, "error") ?? "Unknown error";
        addMessage({ id: `${event.seq}`, role: "system", content: `Code generation failed: ${errorMsg}`, timestamp: event.ts });
        continue;
      }

      if (event.type === "chat.response") {
        const text = getPayloadString(event.payload, "text");
        if (!text) continue;
        const agent = getPayloadString(event.payload, "agent");
        addMessage({ id: `${event.seq}`, role: "assistant", content: text, agent, timestamp: event.ts });
      }
    }
  }, [addBlockMessage, addMessage, events, setNodeStatus, setSession]);

  const edaResults = useMemo<Record<string, unknown> | null>(() => {
    const edaBlock = nodes.find((n) => n.data.type === "eda");
    if (edaBlock && blockResults[edaBlock.id]) return blockResults[edaBlock.id];
    if (blockResults["eda"]) return blockResults["eda"];
    return currentSession?.eda_results ?? null;
  }, [nodes, blockResults, currentSession]);

  const codeEntries = useMemo<CodeEntry[]>(() => {
    const entries: CodeEntry[] = [];
    for (const node of nodes) {
      const result = blockResults[node.id];
      if (!result) continue;
      const code = typeof result["code"] === "string"
        ? result["code"]
        : typeof result["generated_code"] === "string"
        ? result["generated_code"]
        : null;
      if (code) {
        entries.push({ blockId: node.id, blockType: node.data.type, label: node.data.label, code });
      }
    }
    if (entries.length === 0 && currentSession?.generated_code) {
      entries.push({
        blockId: "codegen",
        blockType: "codegen",
        label: "Generated Code",
        code: currentSession.generated_code,
      });
    }
    return entries;
  }, [nodes, blockResults, currentSession]);

  const anomalyResults = useMemo<Record<string, unknown> | null>(() => {
    const vizBlock = nodes.find((n) => n.data.type === "anomaly_viz");
    if (vizBlock && blockResults[vizBlock.id]) return blockResults[vizBlock.id];
    return null;
  }, [nodes, blockResults]);

  const activeBlockType = useMemo<BlockType | null>(() => {
    if (!activeChatBlockId) return null;
    const node = nodes.find((n) => n.id === activeChatBlockId);
    return node?.data.type ?? null;
  }, [activeChatBlockId, nodes]);

  if (!currentSession) {
    return <SessionSkeleton />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header status={currentSession.status} />
      <main className="mx-auto grid h-[calc(100vh-4rem)] w-full max-w-[1800px] grid-cols-1 gap-4 p-4 md:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_420px]">

        <section className="min-h-[340px] md:h-full">
          <ErrorBoundary key={sessionId} fallback={<PanelError message="Chat panel crashed" />}>
            {activeChatBlockId && activeBlockType ? (
              <BlockChat
                sessionId={sessionId}
                blockId={activeChatBlockId}
                blockType={activeBlockType}
                onClose={handleBlockClose}
              />
            ) : (
              <ChatPanel sessionId={sessionId} />
            )}
          </ErrorBoundary>
        </section>

        <section className="flex min-h-[420px] flex-col rounded-xl border border-border/80 bg-card/30 p-3">
          <div className="mb-3 flex flex-wrap items-center gap-3 px-1">
            <h2 className="text-sm font-medium tracking-wide text-muted-foreground">Pipeline DAG</h2>
            <div className="flex-1">
              <DAGToolbar sessionId={sessionId} />
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              Stream: {isConnected ? "connected" : "reconnecting"}
            </span>
          </div>
          <ErrorBoundary fallback={<PanelError message="Pipeline view unavailable" />}>
            {showTemplateSelector ? (
              <TemplateSelector sessionId={sessionId} onApply={handleTemplateApply} />
            ) : (
              <PipelineEditor />
            )}
          </ErrorBoundary>
        </section>

        <section className="flex h-full min-h-[340px] flex-col rounded-xl border border-border/80 bg-card/30 p-3 xl:overflow-hidden">
          <Tabs defaultValue="eda" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="grid w-full shrink-0 grid-cols-3">
              <TabsTrigger value="eda">EDA</TabsTrigger>
              <TabsTrigger value="code">Code</TabsTrigger>
              <TabsTrigger value="anomaly">Anomaly</TabsTrigger>
            </TabsList>
            <TabsContent value="eda" className="mt-3 min-h-0 flex-1 overflow-y-auto">
              <ErrorBoundary
                key={edaResults ? "eda-loaded" : "eda-pending"}
                fallback={<PanelError message="EDA report failed to render" />}
              >
                <EDAReport results={edaResults} />
              </ErrorBoundary>
            </TabsContent>
            <TabsContent value="code" className="mt-3 min-h-0 flex-1 overflow-y-auto">
              <ErrorBoundary
                key={codeEntries.length > 0 ? "code-loaded" : "code-pending"}
                fallback={<PanelError message="Code viewer failed to render" />}
              >
                {codeEntries.length > 0 ? (
                  <CodeViewer entries={codeEntries} />
                ) : (
                  <CodeViewer code={currentSession.generated_code} />
                )}
              </ErrorBoundary>
            </TabsContent>
            <TabsContent value="anomaly" className="mt-3 min-h-0 flex-1 overflow-y-auto">
              <ErrorBoundary
                key={edaResults ? "anomaly-loaded" : "anomaly-pending"}
                fallback={<PanelError message="Anomaly chart failed to render" />}
              >
                <AnomalyChart edaResults={edaResults} validationResults={anomalyResults} />
              </ErrorBoundary>
            </TabsContent>
          </Tabs>
        </section>

      </main>

      {activeSettingsBlockId && (
        <BlockSettings
          open={!!activeSettingsBlockId}
          onClose={() => setActiveSettingsBlockId(null)}
          blockId={activeSettingsBlockId}
          sessionId={sessionId}
        />
      )}
    </div>
  );
}

export default function SessionPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  if (!sessionId) return null;

  return (
    <ReactFlowProvider>
      <SessionInner sessionId={sessionId} />
    </ReactFlowProvider>
  );
}
