"use client";

import { useEffect, useRef, useState } from "react";

import { Check, Copy, Download } from "lucide-react";
import { codeToHtml } from "shiki";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface CodeViewerProps {
  code: string | null;
}

export function CodeViewer({ code }: CodeViewerProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!code) {
      return;
    }

    let isMounted = true;

    const highlight = async () => {
      try {
        const html = await codeToHtml(code, {
          lang: "python",
          theme: "github-dark",
        });

        if (isMounted) {
          setHighlightedHtml(html);
        }
      } catch (error) {
        if (isMounted) {
          setHighlightedHtml("");
        }
        toast.error(error instanceof Error ? error.message : "Code highlighting failed.");
      }
    };

    void highlight();

    return () => {
      isMounted = false;
    };
  }, [code]);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (!code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);

      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }

      copiedTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);

      toast.success("Code copied to clipboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Clipboard action failed.");
    }
  };

  const handleDownload = () => {
    if (!code) {
      return;
    }

    const blob = new Blob([code], { type: "text/x-python;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "anomaly_detector.py";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="bg-zinc-900 text-zinc-200 border-zinc-700">
          Python
        </Badge>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDownload}>
            <Download className="size-4" />
            Download
          </Button>
        </div>
      </div>

      <div className="max-h-[500px] overflow-auto rounded-lg border border-border/80 bg-zinc-950 code-viewer-shiki">
        {highlightedHtml ? (
          <div dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        ) : (
          <pre className="rounded-lg p-4 text-sm leading-6 text-zinc-100">
            <code>{code}</code>
          </pre>
        )}
      </div>

      <style>{`
        .code-viewer-shiki pre {
          margin: 0;
          padding: 1rem;
          font-size: 0.875rem;
          line-height: 1.5;
          border-radius: 0.5rem;
          overflow-x: auto;
        }
      `}</style>
    </div>
  );
}
