"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useParams } from "next/navigation";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { PanelError } from "@/components/error/PanelError";
import { Header } from "@/components/layout/Header";
import { SessionSkeleton } from "@/components/loading/SessionSkeleton";
import { PipelineEditor } from "@/components/pipeline/PipelineEditor";
import { AnomalyChart } from "@/components/results/AnomalyChart";
import { CodeViewer } from "@/components/results/CodeViewer";
import { EDAReport } from "@/components/results/EDAReport";
import { ValidationReport } from "@/components/results/ValidationReport";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/hooks/useSession";
import { useSSE } from "@/hooks/useSSE";
import { API_URL } from "@/lib/api";
import { usePipelineStore } from "@/stores/pipelineStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useStreamStore } from "@/stores/streamStore";
import type { Session, SessionStatus } from "@/types";

const nodeOrder = ["upload", "eda", "algorithm", "codegen", "validation"] as const;
type PipelineNodeId = (typeof nodeOrder)[number];

const statusProgressMap: Record<
  Exclude<SessionStatus, "completed" | "failed">,
  { completed: PipelineNodeId[]; running?: PipelineNodeId }
> = {
  created: { completed: [] },
  eda_running: { completed: ["upload"], running: "eda" },
  algorithm_running: { completed: ["upload", "eda"], running: "algorithm" },
  codegen_running: { completed: ["upload", "eda", "algorithm"], running: "codegen" },
  validation_running: { completed: ["upload", "eda", "algorithm", "codegen"], running: "validation" },
};

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

function inferFailedNode(session: Session): PipelineNodeId {
  if (!session.eda_results) {
    return "eda";
  }
  if (!session.algorithm_recommendations) {
    return "algorithm";
  }
  if (!session.generated_code) {
    return "codegen";
  }
  return "validation";
}

function inferCompletedNodesBeforeFailure(session: Session): PipelineNodeId[] {
  const completed: PipelineNodeId[] = ["upload"];
  if (session.eda_results) {
    completed.push("eda");
  }
  if (session.algorithm_recommendations) {
    completed.push("algorithm");
  }
  if (session.generated_code) {
    completed.push("codegen");
  }
  return completed;
}

export default function SessionPage() {
  const processedSeqRef = useRef(0);
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const { currentSession, loadSession } = useSession();
  const setSession = useSessionStore((state) => state.setSession);
  const addMessage = useSessionStore((state) => state.addMessage);

  const events = useStreamStore((state) => state.events);
  const clearStream = useStreamStore((state) => state.clear);

  const resetPipeline = usePipelineStore((state) => state.resetPipeline);
  const setNodeData = usePipelineStore((state) => state.setNodeData);
  const setNodeStatus = usePipelineStore((state) => state.setNodeStatus);

  const { connect, disconnect, isConnected } = useSSE(sessionId ?? null);

  useEffect(() => {
    processedSeqRef.current = 0;
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void loadSession(sessionId);
  }, [loadSession, sessionId]);

  const sseRef = useRef({ connect, disconnect, clearStream });
  useEffect(() => {
    sseRef.current = { connect, disconnect, clearStream };
  });

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    sseRef.current.connect();
    return () => {
      sseRef.current.disconnect();
      sseRef.current.clearStream();
    };
  }, [sessionId]);

  useEffect(() => {
    resetPipeline();
  }, [sessionId, resetPipeline]);

  const sessionStatus = currentSession?.status;
  useEffect(() => {
    if (!sessionStatus) {
      return;
    }
    if (sessionStatus === "completed") {
      nodeOrder.forEach((nodeId) => setNodeStatus(nodeId, "success"));
      return;
    }
    if (sessionStatus === "failed") {
      const session = useSessionStore.getState().currentSession;
      if (!session) {
        return;
      }
      inferCompletedNodesBeforeFailure(session).forEach((nodeId) => setNodeStatus(nodeId, "success"));
      setNodeStatus(inferFailedNode(session), "error");
      return;
    }
    const progress = statusProgressMap[sessionStatus];
    if (!progress) {
      return;
    }
    progress.completed.forEach((nodeId) => setNodeStatus(nodeId, "success"));
    if (progress.running) {
      setNodeStatus(progress.running, "running");
    }
  }, [sessionStatus, setNodeStatus]);

  const isStuckRef = useRef(false);
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const stuckStatuses = new Set(["eda_running", "algorithm_running", "codegen_running", "validation_running"]);
    const shouldCheck = currentSession && stuckStatuses.has(currentSession.status);
    if (!shouldCheck) {
      isStuckRef.current = false;
      const interval = setInterval(() => {
        setIsStuck(false);
      }, 30_000);
      return () => clearInterval(interval);
    }
    const created = new Date(currentSession.created_at).getTime();
    const interval = setInterval(() => {
      setIsStuck(Date.now() - created > 5 * 60 * 1000);
    }, 1_000);
    return () => clearInterval(interval);
  }, [currentSession]);

  useEffect(() => {
    if (events.length === 0) {
      return;
    }

    const pendingEvents = events.filter((event) => event.seq > processedSeqRef.current);
    if (pendingEvents.length === 0) {
      return;
    }

    const updateSession = (updater: (session: Session) => Session) => {
      const session = useSessionStore.getState().currentSession;
      if (!session) {
        return;
      }
      setSession(updater(session));
    };

    for (const event of pendingEvents) {
      processedSeqRef.current = event.seq;

      if (event.type === "pipeline.started") {
        setNodeStatus("upload", "success");
        updateSession((session) => ({ ...session, status: "eda_running" }));
        addMessage({
          id: `${event.seq}`,
          role: "system",
          content: "Pipeline started.",
          timestamp: event.ts,
        });
        continue;
      }

      if (event.type === "eda.started") {
        setNodeStatus("eda", "running");
        setNodeData("eda", { startedAt: event.ts });
        updateSession((session) => ({ ...session, status: "eda_running" }));
        addMessage({
          id: `${event.seq}`,
          role: "system",
          content: "EDA analysis started...",
          timestamp: event.ts,
        });
        continue;
      }

      if (event.type === "eda.completed") {
        setNodeStatus("eda", "success");
        setNodeData("eda", { completedAt: event.ts, previewData: "EDA analysis complete" });
        const results = getPayloadRecord(event.payload, "results");
        if (results) {
          updateSession((session) => ({ ...session, eda_results: results }));
        }
        addMessage({
          id: `${event.seq}`,
          role: "system",
          content: "EDA analysis completed.",
          timestamp: event.ts,
        });
        continue;
      }

      if (event.type === "algorithm.started") {
        setNodeStatus("algorithm", "running");
        setNodeData("algorithm", { startedAt: event.ts });
        updateSession((session) => ({ ...session, status: "algorithm_running" }));
        addMessage({
          id: `${event.seq}`,
          role: "system",
          content: "Algorithm selection started...",
          timestamp: event.ts,
        });
        continue;
      }

      if (event.type === "algorithm.completed") {
        setNodeStatus("algorithm", "success");
        setNodeData("algorithm", { completedAt: event.ts, previewData: "Algorithm selected" });
        const recommendations = getPayloadRecord(event.payload, "recommendations");
        if (recommendations) {
          updateSession((session) => ({ ...session, algorithm_recommendations: recommendations }));
        }
        addMessage({
          id: `${event.seq}`,
          role: "system",
          content: "Algorithm selection completed.",
          timestamp: event.ts,
        });
        continue;
      }

      if (event.type === "codegen.started") {
        setNodeStatus("codegen", "running");
        setNodeData("codegen", { startedAt: event.ts });
        updateSession((session) => ({ ...session, status: "codegen_running" }));
        addMessage({
          id: `${event.seq}`,
          role: "system",
          content: "Code generation started...",
          timestamp: event.ts,
        });
        continue;
      }

      if (event.type === "codegen.completed") {
        setNodeStatus("codegen", "success");
        setNodeData("codegen", { completedAt: event.ts, previewData: "Code generated" });
        const generatedCodeValue = getPayloadString(event.payload, "code");
        updateSession((session) => ({
          ...session,
          status: "validation_running",
          ...(generatedCodeValue ? { generated_code: generatedCodeValue } : {}),
        }));
        addMessage({
          id: `${event.seq}`,
          role: "system",
          content: "Code generation completed.",
          timestamp: event.ts,
        });
        continue;
      }

      if (event.type === "validation.started") {
        setNodeStatus("validation", "running");
        setNodeData("validation", { startedAt: event.ts });
        updateSession((session) => ({ ...session, status: "validation_running" }));
        addMessage({
          id: `${event.seq}`,
          role: "system",
          content: "Validation started...",
          timestamp: event.ts,
        });
        continue;
      }

      if (event.type === "validation.completed") {
        setNodeStatus("validation", "success");
        setNodeData("validation", { completedAt: event.ts, previewData: "Validation complete" });
        const validation = getPayloadRecord(event.payload, "validation");
        if (validation) {
          updateSession((session) => ({ ...session, validation_results: validation }));
        }
        addMessage({
          id: `${event.seq}`,
          role: "system",
          content: "Validation completed.",
          timestamp: event.ts,
        });
        continue;
      }

      if (event.type === "pipeline.completed") {
        updateSession((session) => ({ ...session, status: "completed" }));
        addMessage({
          id: `${event.seq}`,
          role: "system",
          content: "Pipeline completed successfully.",
          timestamp: event.ts,
        });
        continue;
      }

      if (event.type === "pipeline.failed") {
        const runningNode = nodeOrder.find((nodeId) => {
          const node = usePipelineStore.getState().nodes.find((candidate) => candidate.id === nodeId);
          return node?.data.status === "running";
        });
        setNodeStatus(runningNode ?? "validation", "error");
        updateSession((session) => ({ ...session, status: "failed" }));
        const errorMessage = getPayloadString(event.payload, "error") ?? "Unknown error";
        addMessage({
          id: `${event.seq}`,
          role: "system",
          content: `Pipeline failed: ${errorMessage}`,
          timestamp: event.ts,
        });
        continue;
      }

      if (event.type === "chat.response") {
        const text = getPayloadString(event.payload, "text");
        if (!text) {
          continue;
        }
        const agent = getPayloadString(event.payload, "agent");
        addMessage({
          id: `${event.seq}`,
          role: "assistant",
          content: text,
          agent,
          timestamp: event.ts,
        });
      }
    }
  }, [addMessage, events, sessionId, setNodeData, setNodeStatus, setSession]);

  const edaResults = useMemo(
    () => currentSession?.eda_results ?? null,
    [currentSession?.eda_results],
  );
  const generatedCode = useMemo(
    () => currentSession?.generated_code ?? null,
    [currentSession?.generated_code],
  );
  const validationResults = useMemo(
    () => currentSession?.validation_results ?? null,
    [currentSession?.validation_results],
  );

  if (!sessionId) {
    return null;
  }

  if (!currentSession) {
    return <SessionSkeleton />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header status={currentSession.status} />
      <main className="mx-auto grid h-[calc(100vh-4rem)] w-full max-w-[1800px] grid-cols-1 gap-4 p-4 md:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_420px]">
        <section className="min-h-[340px] md:h-full">
          <ErrorBoundary key={sessionId} fallback={<PanelError message="Chat panel crashed" />}>
            <ChatPanel sessionId={sessionId} />
          </ErrorBoundary>
        </section>

        <section className="flex min-h-[420px] flex-col rounded-xl border border-border/80 bg-card/30 p-3">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-sm font-medium tracking-wide text-muted-foreground">Pipeline DAG</h2>
            <span className="text-xs text-muted-foreground">
              Stream: {isConnected ? "connected" : "reconnecting"}
            </span>
            {isStuck && (
              <button
                className="rounded bg-amber-600/80 px-2 py-0.5 text-xs text-white hover:bg-amber-600"
                onClick={async () => {
                  await fetch(`${API_URL}/sessions/${sessionId}/recover`, { method: "POST" });
                  void loadSession(sessionId);
                }}
              >
                Recover stuck session
              </button>
            )}
          </div>
          <ErrorBoundary fallback={<PanelError message="Pipeline view unavailable" />}>
            <PipelineEditor />
          </ErrorBoundary>
        </section>

        <section className="flex h-full min-h-[340px] flex-col rounded-xl border border-border/80 bg-card/30 p-3 xl:overflow-hidden">
          <Tabs defaultValue="eda" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="grid w-full shrink-0 grid-cols-4">
              <TabsTrigger value="eda">EDA</TabsTrigger>
              <TabsTrigger value="code">Code</TabsTrigger>
              <TabsTrigger value="validation">Validation</TabsTrigger>
              <TabsTrigger value="anomaly">Anomaly</TabsTrigger>
            </TabsList>
            <TabsContent value="eda" className="mt-3 min-h-0 flex-1 overflow-y-auto">
              <ErrorBoundary key={edaResults ? "eda-loaded" : "eda-pending"} fallback={<PanelError message="EDA report failed to render" />}>
                <EDAReport results={edaResults} />
              </ErrorBoundary>
            </TabsContent>
            <TabsContent value="code" className="mt-3 min-h-0 flex-1 overflow-y-auto">
              <ErrorBoundary key={generatedCode ? "code-loaded" : "code-pending"} fallback={<PanelError message="Code viewer failed to render" />}>
                <CodeViewer code={generatedCode} />
              </ErrorBoundary>
            </TabsContent>
            <TabsContent value="validation" className="mt-3 min-h-0 flex-1 overflow-y-auto">
              <ErrorBoundary key={validationResults ? "val-loaded" : "val-pending"} fallback={<PanelError message="Validation report failed to render" />}>
                <ValidationReport results={validationResults} sessionStatus={currentSession.status} />
              </ErrorBoundary>
            </TabsContent>
            <TabsContent value="anomaly" className="mt-3 min-h-0 flex-1 overflow-y-auto">
              <ErrorBoundary key={edaResults && validationResults ? "anomaly-loaded" : "anomaly-pending"} fallback={<PanelError message="Anomaly chart failed to render" />}>
                <AnomalyChart
                  edaResults={edaResults}
                  validationResults={validationResults}
                />
              </ErrorBoundary>
            </TabsContent>
          </Tabs>
        </section>
      </main>
    </div>
  );
}
