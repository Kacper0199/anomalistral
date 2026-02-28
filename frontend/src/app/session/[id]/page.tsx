"use client";

import { useEffect, useRef } from "react";

import { useParams } from "next/navigation";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { Header } from "@/components/layout/Header";
import { PipelineEditor } from "@/components/pipeline/PipelineEditor";
import { CodeViewer } from "@/components/results/CodeViewer";
import { EDAReport } from "@/components/results/EDAReport";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/hooks/useSession";
import { useSSE } from "@/hooks/useSSE";
import { usePipelineStore } from "@/stores/pipelineStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useStreamStore } from "@/stores/streamStore";
import type { SessionStatus, SSEEventType } from "@/types";

const statusSequence: Array<{ id: string; doneAt?: SessionStatus; runningAt?: SessionStatus }> = [
  { id: "upload", doneAt: "eda_running" },
  { id: "eda", doneAt: "algorithm_running", runningAt: "eda_running" },
  { id: "algorithm", doneAt: "codegen_running", runningAt: "algorithm_running" },
  { id: "codegen", doneAt: "validation_running", runningAt: "codegen_running" },
  { id: "validation", doneAt: "completed", runningAt: "validation_running" },
];

function getStatusPayloadValue(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
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
  const setNodeStatus = usePipelineStore((state) => state.setNodeStatus);

  const { connect, disconnect, isConnected } = useSSE(sessionId ?? null);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void loadSession(sessionId);
  }, [loadSession, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    connect();
    return () => {
      disconnect();
      clearStream();
    };
  }, [clearStream, connect, disconnect, sessionId]);

  useEffect(() => {
    if (!currentSession) {
      return;
    }

    resetPipeline();

    if (currentSession.status === "completed") {
      statusSequence.forEach((step) => setNodeStatus(step.id, "success"));
      return;
    }

    if (currentSession.status === "failed") {
      setNodeStatus("validation", "error");
      return;
    }

    statusSequence.forEach((step) => {
      if (step.doneAt === currentSession.status) {
        setNodeStatus(step.id, "success");
      }
      if (step.runningAt === currentSession.status) {
        setNodeStatus(step.id, "running");
      }
    });
  }, [currentSession, resetPipeline, setNodeStatus]);

  useEffect(() => {
    if (events.length === 0) {
      return;
    }

    const latestEvent = events[events.length - 1];
    if (latestEvent.seq <= processedSeqRef.current) {
      return;
    }
    processedSeqRef.current = latestEvent.seq;

    if (latestEvent.type === "status" && currentSession) {
      const statusValue = getStatusPayloadValue(latestEvent.payload, "status");
      if (statusValue) {
        setSession({ ...currentSession, status: statusValue as SessionStatus });
      }
    }

    const messageEventTypes: SSEEventType[] = ["delta", "tool_call", "tool_result", "error", "validation"];
    if (messageEventTypes.includes(latestEvent.type)) {
      const content =
        getStatusPayloadValue(latestEvent.payload, "text") ??
        getStatusPayloadValue(latestEvent.payload, "message") ??
        JSON.stringify(latestEvent.payload);
      const agent = getStatusPayloadValue(latestEvent.payload, "agent");
      addMessage({
        id: `${latestEvent.seq}`,
        role: "assistant",
        content,
        agent,
        timestamp: latestEvent.ts,
      });
    }

    if (latestEvent.type === "code_stdout" && currentSession) {
      const code = getStatusPayloadValue(latestEvent.payload, "code") ?? currentSession.generated_code;
      setSession({ ...currentSession, generated_code: code });
    }

    if (latestEvent.type === "validation" && currentSession) {
      setSession({ ...currentSession, validation_results: latestEvent.payload });
    }

    if (latestEvent.type === "dag_update" && currentSession) {
      setSession({ ...currentSession, dag_config: latestEvent.payload });
    }

    if (latestEvent.type === "tool_result" && currentSession) {
      const stage = getStatusPayloadValue(latestEvent.payload, "stage");
      if (stage === "eda") {
        setSession({ ...currentSession, eda_results: latestEvent.payload });
      }
    }
  }, [addMessage, currentSession, events, setSession]);

  if (!sessionId) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header status={currentSession?.status} />
      <main className="mx-auto grid h-[calc(100vh-4rem)] w-full max-w-[1800px] grid-cols-1 gap-4 p-4 md:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_420px]">
        <section className="min-h-[340px] md:h-full">
          <ChatPanel sessionId={sessionId} />
        </section>

        <section className="flex min-h-[420px] flex-col rounded-xl border border-border/80 bg-card/30 p-3">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-sm font-medium tracking-wide text-muted-foreground">Pipeline DAG</h2>
            <span className="text-xs text-muted-foreground">
              Stream: {isConnected ? "connected" : "reconnecting"}
            </span>
          </div>
          <PipelineEditor />
        </section>

        <section className="h-full min-h-[340px] rounded-xl border border-border/80 bg-card/30 p-3 xl:overflow-hidden">
          <Tabs defaultValue="eda" className="h-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="eda">EDA</TabsTrigger>
              <TabsTrigger value="code">Code</TabsTrigger>
              <TabsTrigger value="validation">Validation</TabsTrigger>
            </TabsList>
            <TabsContent value="eda" className="mt-3">
              <EDAReport results={currentSession?.eda_results ?? null} />
            </TabsContent>
            <TabsContent value="code" className="mt-3">
              <CodeViewer code={currentSession?.generated_code ?? null} />
            </TabsContent>
            <TabsContent value="validation" className="mt-3">
              {currentSession?.validation_results ? (
                <pre className="max-h-[380px] overflow-auto rounded-lg border border-border/80 bg-muted/30 p-4 text-xs leading-relaxed">
                  {JSON.stringify(currentSession.validation_results, null, 2)}
                </pre>
              ) : (
                <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-4 text-sm text-muted-foreground">
                  Waiting for validation...
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>
      </main>
    </div>
  );
}
