"use client";

import { useState } from "react";

import { Send } from "lucide-react";
import { toast } from "sonner";

import { sendCommand } from "@/lib/api";
import { useSessionStore } from "@/stores/sessionStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

interface ChatPanelProps {
  sessionId: string;
}

export function ChatPanel({ sessionId }: ChatPanelProps) {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messages = useSessionStore((state) => state.messages);
  const addMessage = useSessionStore((state) => state.addMessage);

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
      <div className="border-b border-border/80 px-4 py-3 text-sm font-medium">Agent Chat</div>
      <ScrollArea className="flex-1 px-4 py-3">
        <div className="space-y-3">
          {messages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Session updates and agent messages will appear here.
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border/80 bg-muted/40 text-foreground"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {message.role}
                  </span>
                  {message.role === "assistant" && message.agent ? (
                    <Badge variant="secondary" className="h-5 text-[10px] uppercase tracking-wide">
                      {message.agent}
                    </Badge>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      <div className="border-t border-border/80 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
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
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
