/**
 * In-memory broadcaster for model load progress.
 * SSE clients subscribe; pipeline progress_callback pushes here.
 */

export interface ModelProgressEvent {
  status?: string;
  progress?: number;
  file_name?: string;
  file?: string;
  ready?: boolean;
}

type Listener = (data: ModelProgressEvent) => void;

const listeners: Set<Listener> = new Set();

export function subscribeModelProgress(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function broadcastModelProgress(data: ModelProgressEvent): void {
  const payload = JSON.stringify(data);
  for (const listener of listeners) {
    try {
      listener(data);
    } catch (e) {
      console.error("[modelProgress] listener error:", e);
    }
  }
}

export function getListenersCount(): number {
  return listeners.size;
}
