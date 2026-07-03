"use client";

import { useState, useCallback, useRef, type ReactElement } from "react";
import { ToastContainer } from "@/components/ui/Toast";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastOptions {
  type?: ToastType;
  /** Auto-dismiss in ms. 0 = sticky (must be closed manually). Default 3000. */
  duration?: number;
}

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

export interface UseToastApi {
  showToast: (message: string, opts?: ToastOptions) => number;
  dismiss: (id: number) => void;
  /** Drop-in component to mount once at app root. */
  ToastContainer: () => ReactElement;
}

export function useToast(): UseToastApi {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message: string, opts: ToastOptions = {}): number => {
      const id = ++idRef.current;
      const type: ToastType = opts.type ?? "info";
      const duration = opts.duration ?? 3000;
      setToasts((prev) => {
        // Cap at 6 visible toasts — drop oldest.
        const next = [...prev, { id, message, type, duration }];
        if (next.length > 6) next.shift();
        return next;
      });
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  const Container = useCallback(
    () => <ToastContainer toasts={toasts} onDismiss={dismiss} />,
    [toasts, dismiss],
  );

  return { showToast, dismiss, ToastContainer: Container };
}
