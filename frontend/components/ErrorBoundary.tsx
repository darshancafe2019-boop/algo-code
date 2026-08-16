"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  title?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  public handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-5 backdrop-blur-md text-red-200 my-3">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            <h3 className="font-semibold text-sm text-red-300">
              {this.props.title || "Section Component Failed"}
            </h3>
          </div>
          <p className="text-xs text-red-400/80 mb-3 font-mono">
            {this.state.error?.message || "An unexpected error occurred in this module."}
          </p>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-800/60 text-red-200 text-xs transition-colors border border-red-700/50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry Section
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
