"use client";

import { useEffect, useState } from "react";
import { GitBranch, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getTemplates, applyTemplate } from "@/lib/api";
import type { TemplateResponse, DAGDefinition } from "@/types";

const EMPTY_DAG: DAGDefinition = { nodes: [], edges: [] };

interface TemplateSelectorProps {
  sessionId: string;
  onApply: (dag: DAGDefinition) => void;
}

function TemplateSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="opacity-60">
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TemplateSelector({ sessionId, onApply }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<TemplateResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    getTemplates()
      .then(setTemplates)
      .catch(() => toast.error("Failed to load templates"))
      .finally(() => setLoading(false));
  }, []);

  async function handleApplyTemplate(templateId: string) {
    setApplying(templateId);
    try {
      const dag = await applyTemplate(sessionId, templateId);
      onApply(dag);
    } catch {
      toast.error("Failed to apply template");
    } finally {
      setApplying(null);
    }
  }

  function handleScratch() {
    onApply(EMPTY_DAG);
  }

  const isDisabled = applying !== null;

  return (
    <div className="space-y-6 p-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Choose a pipeline template</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Start from a pre-built template or configure your pipeline from scratch.
        </p>
      </div>

      {loading ? (
        <TemplateSkeleton />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {templates.map((tpl) => {
            const isApplying = applying === tpl.id;
            return (
              <Card
                key={tpl.id}
                onClick={() => !isDisabled && handleApplyTemplate(tpl.id)}
                className={
                  isDisabled
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer hover:border-primary transition-colors"
                }
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {isApplying ? (
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    ) : (
                      <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    {tpl.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {tpl.description && (
                    <p className="text-sm text-muted-foreground leading-snug">{tpl.description}</p>
                  )}
                  <div className="flex gap-2">
                    <Badge variant="secondary">{tpl.dag.nodes.length} nodes</Badge>
                    <Badge variant="secondary">{tpl.dag.edges.length} edges</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <Card
            onClick={() => !isDisabled && handleScratch()}
            className={
              isDisabled
                ? "cursor-not-allowed opacity-60 border-dashed"
                : "cursor-pointer hover:border-primary transition-colors border-dashed"
            }
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
                <Plus className="h-4 w-4 shrink-0" />
                Start from scratch
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Build your own pipeline by adding and connecting blocks manually.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {templates.length === 0 && !loading && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={handleScratch} disabled={isDisabled}>
            <Plus className="h-4 w-4 mr-2" />
            Start from scratch
          </Button>
        </div>
      )}
    </div>
  );
}
