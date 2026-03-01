import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SessionStatus } from "@/types";

interface HeaderProps {
  status?: SessionStatus;
  backHref?: string;
}

const statusLabel: Record<SessionStatus, string> = {
  created: "Created",
  idle: "Idle",
  eda_running: "EDA Running",
  algorithm_running: "Algorithm Running",
  codegen_running: "Codegen Running",
  completed: "Completed",
  failed: "Failed",
};

export function Header({ status, backHref }: HeaderProps) {
  return (
    <header className="border-b border-border/80 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-3 px-4 md:px-6">
        {backHref ? (
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground shrink-0">
            <Link href={backHref}>
              <ArrowLeft className="size-4" />
              Home
            </Link>
          </Button>
        ) : null}
        <div className="text-lg font-semibold tracking-tight">Anomalistral</div>
        <div className="flex-1" />
        {status ? (
          <Badge variant={status === "failed" ? "destructive" : "secondary"}>{statusLabel[status]}</Badge>
        ) : null}
      </div>
    </header>
  );
}
