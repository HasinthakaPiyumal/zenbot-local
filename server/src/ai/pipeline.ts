/**
 * Text-generation pipeline singleton using @huggingface/transformers v4.
 * Lazy init with progress_callback for console + SSE broadcast.
 */

import { broadcastModelProgress } from "./modelProgress.js";

const MODEL_ID = process.env.CHAT_MODEL_ID || "onnx-community/Llama-3.2-1B-Instruct-ONNX";

let instance: Awaited<ReturnType<typeof createPipeline>> | null = null;

/** Default progress callback — logs to console and broadcasts via SSE. */
function defaultProgressCallback(data: unknown): void {
  console.log("[Model]", data);
  broadcastModelProgress(
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>) as { status?: string; progress?: number; file?: string; file_name?: string }
      : { status: String(data) }
  );
}

async function createPipeline(progressCallback?: (data: unknown) => void) {
  const { pipeline } = await import("@huggingface/transformers");

  const generator = await pipeline("text-generation", MODEL_ID, {
    dtype: "q4f16",
    progress_callback: progressCallback ?? defaultProgressCallback,
  });

  return generator;
}

export type PipelineInstance = Awaited<ReturnType<typeof createPipeline>>;

export async function getInstance(
  progressCallback?: (data: unknown) => void
): Promise<PipelineInstance> {
  if (instance) return instance;

  instance = await createPipeline(progressCallback ?? defaultProgressCallback);
  broadcastModelProgress({ ready: true });
  return instance;
}

export function isReady(): boolean {
  return instance !== null;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Removed generate() and generateStream() as they are now handled by TransformersModel
