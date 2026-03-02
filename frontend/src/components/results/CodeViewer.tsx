"use client";

import { useEffect, useRef, useState } from "react";

import { Check, Copy, Download } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ICON_SIZE = "size-4";
const COPY_TIMEOUT_MS = 2000;
const SHIKI_THEME = "github-dark";
const SHIKI_LANG = "python";
const CODE_FENCE_RE = /```(?:python)?\s*\n([\s\S]*?)```/g;

interface CodeEntry {
  blockId: string;
  blockType: string;
  label: string;
  code: string;
}

interface CodeViewerProps {
  entries?: CodeEntry[];
  code?: string | null;
}

function extractCodeBlock(raw: string): string {
  const matches = [...raw.matchAll(CODE_FENCE_RE)];
  if (matches.length > 0) {
    return matches.reduce((a, b) => (a[1].length >= b[1].length ? a : b))[1].trim();
  }
  return raw.trim();
}

function useHighlight(cleanCode: string | null) {
  const [html, setHtml] = useState<string>("");

  useEffect(() => {
    if (!cleanCode) {
      setHtml("");
      return;
    }

    let mounted = true;

    const run = async () => {
      try {
        const { codeToHtml } = await import("shiki");
        const result = await codeToHtml(cleanCode, {
          lang: SHIKI_LANG,
          theme: SHIKI_THEME,
        });
        if (mounted) setHtml(result);
      } catch {
        if (mounted) setHtml("");
      }
    };

    void run();
    return () => { mounted = false; };
  }, [cleanCode]);

  return html;
}

function CodeBlock({ cleanCode }: { cleanCode: string }) {
  const highlightedHtml = useHighlight(cleanCode);

  return (
    <div className="max-h-[500px] overflow-auto rounded-lg border border-border/80 bg-zinc-950 code-viewer-shiki">
      {highlightedHtml ? (
        <div dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      ) : (
        <pre className="rounded-lg p-4 text-sm leading-6 text-zinc-100 break-words">
          <code>{cleanCode}</code>
        </pre>
      )}
    </div>
  );
}

function ActionButtons({
  cleanCode,
  downloadName,
}: {
  cleanCode: string;
  downloadName: string;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(cleanCode);
      } else {
        const ta = document.createElement("textarea");
        ta.value = cleanCode;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }

      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), COPY_TIMEOUT_MS);
      toast.success("Code copied to clipboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clipboard action failed.");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([cleanCode], { type: "text/x-python;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
        {copied ? <Check className={ICON_SIZE} /> : <Copy className={ICON_SIZE} />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button variant="ghost" size="sm" onClick={handleDownload}>
        <Download className={ICON_SIZE} />
        Download
      </Button>
    </div>
  );
}

function LegacyView({ code }: { code: string }) {
  const cleanCode = extractCodeBlock(code);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="bg-zinc-900 text-zinc-200 border-zinc-700">
          Python
        </Badge>
        <ActionButtons cleanCode={cleanCode} downloadName="anomaly_detector.py" />
      </div>
      <CodeBlock cleanCode={cleanCode} />
      <ShikiStyle />
    </div>
  );
}

function ShikiStyle() {
  return (
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
  );
}

function MultiTabView({ entries }: { entries: CodeEntry[] }) {
  const [activeTab, setActiveTab] = useState(entries[0].blockId);
  
  // Ensure activeTab is valid, otherwise fallback to the first entry
  const isValid = entries.some(e => e.blockId === activeTab);
  const currentTab = isValid ? activeTab : entries[0].blockId;
  const active = entries.find((e) => e.blockId === currentTab) ?? entries[0];
  const cleanCode = extractCodeBlock(active.code);
  const downloadName = `${active.label.replace(/\s+/g, "_")}_anomaly_detector.py`;

  return (
    <div className="space-y-3">
      <Tabs value={currentTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            {entries.map((entry) => (
              <TabsTrigger key={entry.blockId} value={entry.blockId}>
                <span className="truncate max-w-[120px]">{entry.label}</span>
                <Badge
                  variant="outline"
                  className="ml-1 bg-zinc-900 text-zinc-200 border-zinc-700 text-[10px] tabular-nums px-1.5 py-0 h-4"
                >
                  {entry.blockType}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          <ActionButtons cleanCode={cleanCode} downloadName={downloadName} />
        </div>

        {entries.map((entry) => {
          const clean = extractCodeBlock(entry.code);
          return (
            <TabsContent key={entry.blockId} value={entry.blockId}>
              <CodeBlock cleanCode={clean} />
            </TabsContent>
          );
        })}
      </Tabs>
      <ShikiStyle />
    </div>
  );
}

export function CodeViewer({ entries, code }: CodeViewerProps) {
  if (entries && entries.length > 0) {
    return <MultiTabView entries={entries} />;
  }

  if (code) {
    return <LegacyView code={code} />;
  }

  return (
    <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-4 text-sm text-muted-foreground">
      No code generated yet
    </div>
  );
}
