"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const rawMessage = this.state.error?.message?.trim() || "Unexpected runtime error";
      const message = rawMessage.length > 200 ? `${rawMessage.slice(0, 200)}...` : rawMessage;

      return (
        <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-red-500/30 bg-red-500/5 p-6">
          <div className="mx-auto flex max-w-lg flex-col items-center text-center">
            <div className="mb-4 rounded-full border border-red-500/30 bg-red-500/10 p-3">
              <AlertTriangle className="size-6 text-red-400" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Something went wrong</h2>
            <p className="mt-2 text-sm text-red-300/90">{message}</p>
            <Button onClick={this.handleReset} variant="outline" className="mt-5 gap-2 border-red-500/40 bg-zinc-950/40 text-red-200 hover:bg-red-500/10">
              <RefreshCw className="size-4" />
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
