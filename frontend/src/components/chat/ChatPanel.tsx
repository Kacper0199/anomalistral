"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { Bot, Cpu, MessageSquare, Send, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendCommand } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/sessionStore";

interface ChatPanelProps {
  sessionId: string;
}

export interface ChatPanelHandle {
  appendToStream: (messageId: string, chunk: string) => void;
  finalizeStream: (messageId: string) => void;
}

function formatRelativeTime(timestamp: string): string {
  const parsed = new Date(timestamp).getTime();
  if (Number.isNaN(parsed)) {
    return "just now";
  }

  const diffInSeconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  if (diffInSeconds < 10) return "just now";
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
}

const REMARK_PLUGINS = [remarkGfm];

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-3 text-base font-bold leading-tight first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1.5 mt-2.5 text-sm font-semibold leading-tight first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2 text-sm font-medium leading-tight first:mt-0">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mb-1.5 break-words leading-relaxed last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-1.5 ml-4 list-disc space-y-0.5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-1.5 ml-4 list-decimal space-y-0.5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className={cn("font-mono text-xs", className)} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-xs" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-1.5 overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs last:mb-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-1.5 border-l-2 border-border/80 pl-3 text-muted-foreground last:mb-0">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="mb-1.5 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border/60">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-border/40 last:border-0">{children}</tr>,
  th: ({ children }) => (
    <th className="px-2 py-1 text-left font-semibold text-muted-foreground">{children}</th>
  ),
  td: ({ children }) => <td className="px-2 py-1">{children}</td>,
  hr: () => <hr className="my-2 border-border/60" />,
};

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(function ChatPanel(
  { sessionId },
  ref
) {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState<Record<string, string>>({});
  const messages = useSessionStore((state) => state.messages);
  const addMessage = useSessionStore((state) => state.addMessage);
  const bottomRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    appendToStream: (messageId: string, chunk: string) => {
      setStreamingContent((prev) => ({
        ...prev,
        [messageId]: (prev[messageId] ?? "") + chunk,
      }));
    },
    finalizeStream: (messageId: string) => {
      setStreamingContent((prev) => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    },
  }));

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      } catch {}
    });

    return () => cancelAnimationFrame(frame);
  }, [messages.length, streamingContent]);

  const handleSend = async () => {
    const content = value.trim();
    if (!content) {
      return;
    }

    setIsSending(true);
    try {
      setValue("");
      addMessage({
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      });
      await sendCommand(sessionId, "chat", { message: content });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-border/80 bg-card/50">
      <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="size-4 text-muted-foreground" />
          Agent Chat
        </div>
        <Badge variant="secondary" className="h-5 px-2 text-[10px] uppercase tracking-wide">
          {messages.length}
        </Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div>
          {messages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Session updates and agent messages will appear here.
            </div>
          ) : (
            messages.map((message, index) => {
              const previousMessage = messages[index - 1];
              const startsGroup = !previousMessage || previousMessage.role !== message.role;
              const relativeTime = formatRelativeTime(message.timestamp);
              const activeStream = streamingContent[message.id];

              if (message.role === "system") {
                return (
                  <div
                    key={message.id}
                    className={cn("flex justify-start", startsGroup ? "mt-4" : "mt-1")}
                  >
                    <div className="inline-flex max-w-[85%] items-center gap-2 rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-[11px] italic text-muted-foreground">
                      <Cpu className="size-3 shrink-0" />
                      <span className="min-w-0 break-words">{message.content}</span>
                      <span className="min-w-[52px] whitespace-nowrap text-[10px] tabular-nums not-italic text-muted-foreground/80">
                        {relativeTime}
                      </span>
                    </div>
                  </div>
                );
              }

              const isUser = message.role === "user";
              const RoleIcon = isUser ? User : Bot;
              const displayContent = activeStream ?? message.content;
              const isStreaming = activeStream !== undefined;

              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    isUser ? "justify-end" : "justify-start",
                    startsGroup ? "mt-4" : "mt-1"
                  )}
                >
                  <div className="w-full max-w-[85%]">
                    <div
                      className={cn(
                        "mb-1 flex items-center gap-2 text-[11px] text-muted-foreground",
                        isUser ? "justify-end" : "justify-start"
                      )}
                    >
                      {startsGroup ? (
                        <>
                          {!isUser && message.agent ? (
                            <Badge
                              variant="secondary"
                              className="h-5 px-2 text-[10px] uppercase tracking-wide"
                            >
                              {message.agent}
                            </Badge>
                          ) : null}
                          <RoleIcon className="size-3" />
                          <span className="font-medium uppercase tracking-wide">
                            {isUser ? "You" : "Assistant"}
                          </span>
                        </>
                      ) : null}
                      <span className="min-w-[52px] text-[10px] tabular-nums text-muted-foreground/80">
                        {relativeTime}
                      </span>
                    </div>
                    <div
                      className={cn(
                        "rounded-2xl border px-3 py-2 text-sm leading-relaxed",
                        isUser
                          ? "rounded-br-md border-primary/40 bg-primary/20 text-foreground"
                          : "rounded-bl-md border-border/80 bg-muted/40 text-foreground"
                      )}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap break-words">{displayContent}</p>
                      ) : (
                        <div className="min-w-0">
                          <ReactMarkdown
                            remarkPlugins={REMARK_PLUGINS}
                            components={MARKDOWN_COMPONENTS}
                          >
                            {displayContent}
                          </ReactMarkdown>
                          {isStreaming && (
                            <span className="inline-block animate-pulse text-muted-foreground">
                              ▍
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="border-t border-border/80 p-3">
        <div className="mb-2 flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span>{value.length} chars</span>
          <span>Ctrl/⌘ + Enter to send</span>
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={isSending}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Ask the agents for adjustments..."
            className="min-h-[84px] resize-none"
          />
          <Button size="icon" onClick={() => void handleSend()} disabled={!value.trim() || isSending}>
            {isSending ? (
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current" />
              </span>
            ) : (
              <Send className="size-4" />
            )}
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </div>
    </div>
  );
});
