"use client";

import type { ReactNode } from "react";

import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";

interface ClientProvidersProps {
  children: ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <ErrorBoundary>
      <TooltipProvider>{children}</TooltipProvider>
    </ErrorBoundary>
  );
}
