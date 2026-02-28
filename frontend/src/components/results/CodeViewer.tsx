"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface CodeViewerProps {
  code: string | null;
}

export function CodeViewer({ code }: CodeViewerProps) {
  const handleCopy = async () => {
    if (!code) {
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Code copied to clipboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Clipboard action failed.");
    }
  };

  if (!code) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-4 text-sm text-muted-foreground">
        No code generated yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
          <Copy className="mr-2 size-4" />
          Copy
        </Button>
      </div>
      <pre className="max-h-[380px] overflow-auto rounded-lg border border-border/80 bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-100">
        <code className="language-python">{code}</code>
      </pre>
    </div>
  );
}
