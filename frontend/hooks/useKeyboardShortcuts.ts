"use client";

import { useEffect } from "react";

interface ShortcutHandlers {
  onOpenCommandPalette?: () => void;
  onOpenAlertModal?: () => void;
  onSelectTool?: (tool: string) => void;
  onClearTool?: () => void;
  onSaveLayout?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when user is typing inside an input, textarea, or contentEditable element
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      // Ctrl + K / Cmd + K (Open Command Palette)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handlers.onOpenCommandPalette?.();
        return;
      }

      // Ctrl + S (Save Layout)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handlers.onSaveLayout?.();
        return;
      }

      // Ctrl + Z (Undo)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (!isInput) {
          e.preventDefault();
          handlers.onUndo?.();
        }
        return;
      }

      // Ctrl + Y or Ctrl + Shift + Z (Redo)
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        if (!isInput) {
          e.preventDefault();
          handlers.onRedo?.();
        }
        return;
      }

      // If user is inside an input, don't trigger chart/tool shortcuts
      if (isInput) return;

      // / (Focus Search / Command Palette)
      if (e.key === "/") {
        e.preventDefault();
        handlers.onOpenCommandPalette?.();
        return;
      }

      // Alt + A (Create Alert)
      if (e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        handlers.onOpenAlertModal?.();
        return;
      }

      // Alt + T (Trendline)
      if (e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        handlers.onSelectTool?.("trendline");
        return;
      }

      // Alt + H (Horizontal Line)
      if (e.altKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        handlers.onSelectTool?.("horizontal_line");
        return;
      }

      // Alt + V (Vertical Line)
      if (e.altKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        handlers.onSelectTool?.("vertical_line");
        return;
      }

      // Alt + F (Fibonacci)
      if (e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        handlers.onSelectTool?.("fibonacci");
        return;
      }

      // Escape (Clear current tool)
      if (e.key === "Escape") {
        handlers.onClearTool?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}
