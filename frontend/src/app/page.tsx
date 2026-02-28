"use client";

import { useRef, useState } from "react";

import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/useSession";

export default function Home() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { createNewSession, isLoading } = useSession();
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const handleStart = async () => {
    if (!prompt.trim()) {
      toast.error("Describe the anomaly detection objective first.");
      return;
    }

    try {
      const session = await createNewSession(prompt.trim(), file ?? undefined);
      router.push(`/session/${session.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start analysis.");
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.12),transparent_34%),radial-gradient(circle_at_85%_18%,rgba(244,114,182,0.12),transparent_32%),linear-gradient(180deg,#0a0c12_0%,#080a10_100%)]">
      <Header />
      <main className="mx-auto flex w-full max-w-5xl px-4 py-10 md:px-6 md:py-14">
        <Card className="w-full border-border/80 bg-card/70 backdrop-blur">
          <CardHeader className="space-y-3">
            <CardTitle className="text-3xl tracking-tight">Anomalistral</CardTitle>
            <CardDescription className="max-w-3xl text-base leading-relaxed">
              Autonomous agentic MLOps platform for time-series anomaly detection. Describe your goal,
              upload a CSV, and launch the full analysis pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Analysis Brief</p>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Detect anomalies in IoT sensor data, compare isolation forests and ARIMA residual methods, then generate deployment-ready Python pipeline with validation metrics."
                className="min-h-[180px] resize-y bg-background/70"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Dataset (CSV)</p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const droppedFile = event.dataTransfer.files?.[0];
                  if (droppedFile) {
                    setFile(droppedFile);
                  }
                }}
                className="flex min-h-[136px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/50 px-4 text-center transition hover:border-primary/70"
              >
                <FileUp className="mb-2 size-6 text-muted-foreground" />
                <p className="text-sm font-medium">Drop CSV here or click to browse</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : "Accepted format: .csv"}
                </p>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>

            <div className="flex justify-end">
              <Button size="lg" onClick={() => void handleStart()} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Start Analysis
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
