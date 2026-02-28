"use client";

import { useEffect, useRef, useState } from "react";

import { Bot, Cpu, MessageSquare, Send, User } from "lucide-react";
import { toast } from "sonner";

import { Separator } from "@/components/ui/separator";
import { sendCommand } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/sessionStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

interface ChatPanelProps {
  sessionId: string;
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

export function ChatPanel({ sessionId }: ChatPanelProps) {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messages = useSessionStore((state) => state.messages);
  const addMessage = useSessionStore((state) => state.addMessage);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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
      <ScrollArea className="flex-1 px-4 py-3">
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

              if (message.role === "system") {
                return (
                  <div
                    key={message.id}
                    className={cn("flex justify-center", startsGroup ? "mt-4" : "mt-1")}
                  >
                    <div className="flex w-full items-center gap-2">
                      <Separator className="flex-1 bg-border/60" />
                      <div className="inline-flex max-w-[85%] items-center gap-2 rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-[11px] italic text-muted-foreground">
                        <Cpu className="size-3 shrink-0" />
                        <span className="break-words min-w-0">{message.content}</span>
                        <span className="whitespace-nowrap text-[10px] not-italic text-muted-foreground/80">
                          {relativeTime}
                        </span>
                      </div>
                      <Separator className="flex-1 bg-border/60" />
                    </div>
                  </div>
                );
              }

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
                      <span className="text-[10px] text-muted-foreground/80">{relativeTime}</span>
                    </div>
                    <div
                      className={cn(
                        "rounded-2xl border px-3 py-2 text-sm leading-relaxed",
                        isUser
                          ? "rounded-br-md border-primary/40 bg-primary/20 text-foreground"
                          : "rounded-bl-md border-border/80 bg-muted/40 text-foreground"
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
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
}
