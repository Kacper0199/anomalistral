"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Bot, MessageSquare, Send, User, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { getBlockMessages, sendBlockChat } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/sessionStore";
import type { BlockType, SessionBlockMessage } from "@/types";

interface BlockChatProps {
  sessionId: string;
  blockId: string;
  blockType: BlockType;
  onClose: () => void;
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

function transformMessages(raw: SessionBlockMessage[]) {
  return raw.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
    timestamp: m.created_at,
  }));
}

export function BlockChat({ sessionId, blockId, blockType, onClose }: BlockChatProps) {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = useSessionStore((state) => state.blockMessages[blockId] ?? []);
  const addBlockMessage = useSessionStore((state) => state.addBlockMessage);
  const setBlockMessages = useSessionStore((state) => state.setBlockMessages);

  useEffect(() => {
    getBlockMessages(sessionId, blockId)
      .then((raw) => setBlockMessages(blockId, transformMessages(raw)))
      .catch(() => toast.error("Failed to load block messages."));
  }, [sessionId, blockId, setBlockMessages]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      } catch {}
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const content = value.trim();
    if (!content) return;

    setIsSending(true);
    try {
      setValue("");
      addBlockMessage(blockId, {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      });
      await sendBlockChat(sessionId, blockId, content);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setIsSending(false);
    }
  }, [value, blockId, sessionId, addBlockMessage]);

  const shortId = blockId.length > 8 ? `${blockId.slice(0, 8)}…` : blockId;

  return (
    <div className="flex h-full flex-col rounded-xl border border-border/80 bg-card/50">
      <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="size-4 text-muted-foreground" />
          <Badge variant="secondary" className="h-5 px-2 text-[10px] uppercase tracking-wide">
            {blockType}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">{shortId}</span>
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
          <X className="size-4" />
          <span className="sr-only">Close block chat</span>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div>
          {messages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              No messages yet. Ask the agent about this block.
            </div>
          ) : (
            messages.map((message, index) => {
              const prev = messages[index - 1];
              const startsGroup = !prev || prev.role !== message.role;
              const isUser = message.role === "user";
              const RoleIcon = isUser ? User : Bot;

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
                    {startsGroup && (
                      <div
                        className={cn(
                          "mb-1 flex items-center gap-2 text-[11px] text-muted-foreground",
                          isUser ? "justify-end" : "justify-start"
                        )}
                      >
                        <RoleIcon className="size-3" />
                        <span className="font-medium uppercase tracking-wide">
                          {isUser ? "You" : "Agent"}
                        </span>
                      </div>
                    )}
                    <div
                      className={cn(
                        "rounded-2xl border px-3 py-2 text-sm leading-relaxed",
                        isUser
                          ? "rounded-br-md border-primary/40 bg-primary/20 text-foreground"
                          : "rounded-bl-md border-border/80 bg-muted/40 text-foreground"
                      )}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                      ) : (
                        <div className="min-w-0">
                          <ReactMarkdown
                            remarkPlugins={REMARK_PLUGINS}
                            components={MARKDOWN_COMPONENTS}
                          >
                            {message.content}
                          </ReactMarkdown>
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

      <Separator />
      <div className="p-3">
        <div className="mb-2 flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span>{value.length} chars</span>
          <span>Ctrl/⌘ + Enter to send</span>
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={isSending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Ask the agent about this block..."
            className="min-h-[72px] resize-none"
          />
          <Button
            size="icon"
            onClick={() => void handleSend()}
            disabled={!value.trim() || isSending}
          >
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
}
