"use client";

import { AlertCircle } from "lucide-react";

interface PanelErrorProps {
  message?: string;
}

export function PanelError({ message = "Failed to load content" }: PanelErrorProps) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
      <div className="flex items-center gap-2 text-sm text-red-400">
        <AlertCircle className="size-4" />
        <p>{message}</p>
      </div>
    </div>
  );
}
