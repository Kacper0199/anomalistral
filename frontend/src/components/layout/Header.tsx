import { Badge } from "@/components/ui/badge";
import type { SessionStatus } from "@/types";

interface HeaderProps {
  status?: SessionStatus;
}

const statusLabel: Record<SessionStatus, string> = {
  created: "Created",
  eda_running: "EDA Running",
  algorithm_running: "Algorithm Running",
  codegen_running: "Codegen Running",
  validation_running: "Validation Running",
  completed: "Completed",
  failed: "Failed",
};

export function Header({ status }: HeaderProps) {
  return (
    <header className="border-b border-border/80 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between px-4 md:px-6">
        <div className="text-lg font-semibold tracking-tight">Anomalistral</div>
        {status ? (
          <Badge variant={status === "failed" ? "destructive" : "secondary"}>{statusLabel[status]}</Badge>
        ) : null}
      </div>
    </header>
  );
}
